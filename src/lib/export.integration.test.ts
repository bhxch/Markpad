import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { generateExportHtml } from './export';

// ============================================================================
// md 文件驱动的导出集成测试（L1，CI 可跑，无 GUI 依赖）
//
// 被测对象是真实的 generateExportHtml（stripInactiveTabHosts、frontmatter
// 面板剥离、TOC 重建、图表 wrapper 处理、asset→dataURI、交互脚本注入、
// .md→.html 链接改写、@page 打印样式）。夹具是 docs/demo/ 下的真实文档。
//
// 唯一的 test double 是 md→预览 DOM 的渲染器（mdToPreviewHtml 注释块）：真实
// 渲染链是 Rust comrak + richContent + pipeline，无法在 vitest 进程内运行，
// 该由 scripts/export-e2e.mjs（tauri-connector 驱动运行中的应用）在端到端
// 层覆盖，Rust 侧另有 cargo test 守护。double 忠实还原 generateExportHtml
// 消费的 DOM 契约（结构对照 export.test.ts 的 makeContainer 与 GUI 实测）。
//
// 断言一律在 DOMParser 解析后的导出物上数元素——导出模板自带的交互脚本与
// CSS 中合法含有 data-diagram-render 等字面量，字符串计数会误判。
// ============================================================================

const DEMO_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../docs/demo');

// vitest 的 CSS 管线默认关闭，'katex/dist/katex.min.css?raw' 会被替换为空串；
// 与 exportKatex.test.ts 同款替身：把包内同一文件全文注入（生产 Vite 不受影响）。
const { katexCssText } = await vi.hoisted(async () => {
	const { readFileSync } = await import('node:fs');
	return { katexCssText: readFileSync('node_modules/katex/dist/katex.min.css', 'utf8') };
});
vi.mock('katex/dist/katex.min.css?raw', () => ({ default: katexCssText }));

// demo_features.md 中出现的图表语言 + diagrams.ts 的其余类型
const DIAGRAM_LANGS = new Set([
	'mermaid', 'dot', 'graphviz', 'plantuml', 'svgbob', 'nomnoml',
	'vega', 'vegalite', 'vega-lite', 'excalidraw', 'bpmn', 'kroki',
]);

// 文本节点转义：与 DOM 序列化语义一致（" 在文本节点中不转义）
function escapeText(s: string): string {
	return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
// 属性值转义：额外转义引号
function escapeAttr(s: string): string {
	return escapeText(s).replace(/"/g, '&quot;');
}

// 与 export.ts 标题 ID 生成算法一致（:1216），保证 TOC data-id 与导出锚点对齐
function slugify(text: string): string {
	return text.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '-').replace(/^-|-$/g, '');
}

// 标题纯文本：先展开链接取文字，再剥行内标记——TOC 条目与导出侧 ID 同源
function headingPlain(text: string): string {
	return text
		.replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
		.replace(/[*`~]/g, '')
		.trim();
}

// 极简行内标记：链接/图片/加粗/斜体/行内码/删除线
function inline(text: string, mdDir: string): string {
	let out = escapeText(text);
	out = out.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_m, alt, src) => {
		const abs = path.resolve(mdDir, src);
		return `<img src="asset://localhost/${abs}" alt="${escapeAttr(alt)}">`;
	});
	out = out.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
	out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
	out = out.replace(/\*([^*]+)\*/g, '<em>$1</em>');
	out = out.replace(/~~([^~]+)~~/g, '<del>$1</del>');
	out = out.replace(/`([^`]+)`/g, '<code>$1</code>');
	return out;
}

interface ParsedDoc {
	headings: { level: number; text: string }[];
	codeBlocks: { lang: string; code: string }[];
	diagrams: { lang: string; code: string }[];
	images: string[];
	hasFrontmatter: boolean;
}

function parseMd(mdRaw: string): ParsedDoc {
	const md = mdRaw.replace(/^\uFEFF/, '');
	const doc: ParsedDoc = { headings: [], codeBlocks: [], diagrams: [], images: [], hasFrontmatter: false };
	let body = md;

	const fm = md.match(/^---\r?\n([\s\S]*?)\r?\n---\s*(?:\n|$)/);
	if (fm) {
		doc.hasFrontmatter = true;
		body = md.slice(fm[0].length);
	}

	const lines = body.split('\n');
	let i = 0;
	while (i < lines.length) {
		const line = lines[i];
		const fence = line.match(/^```\s*([\w-]*)\s*$/);
		if (fence) {
			const lang = fence[1];
			const buf: string[] = [];
			i++;
			while (i < lines.length && !/^```\s*$/.test(lines[i])) {
				buf.push(lines[i]);
				i++;
			}
			i++;
			if (DIAGRAM_LANGS.has(lang)) doc.diagrams.push({ lang, code: buf.join('\n') });
			else if (lang) doc.codeBlocks.push({ lang, code: buf.join('\n') });
			continue;
		}
		const h = line.match(/^(#{1,6})\s+(.*)$/);
		if (h) {
			doc.headings.push({ level: h[1].length, text: h[2] });
			i++;
			continue;
		}
		const img = line.match(/!\[([^\]]*)\]\(([^)]+)\)/);
		if (img && !img[2].startsWith('http')) doc.images.push(img[2]);
		i++;
	}
	return doc;
}

// md → 仿真预览 DOM（.markdown-container 完整结构：TOC + 正文 + 交互件）
function mdToPreviewContainer(mdRaw: string, mdDir: string): HTMLElement {
	const md = mdRaw.replace(/^\uFEFF/, '');
	const doc = parseMd(mdRaw);
	let body = md;
	const fm = md.match(/^---\r?\n[\s\S]*?\r?\n---\s*(?:\n|$)/);
	if (fm) body = md.slice(fm[0].length);

	const htmlParts: string[] = [];
	const lines = body.split('\n');
	let i = 0;
	let listOpen: 'ul' | 'ol' | null = null;
	const closeList = () => {
		if (listOpen) {
			htmlParts.push(`</${listOpen}>`);
			listOpen = null;
		}
	};
	while (i < lines.length) {
		const line = lines[i];
		const fence = line.match(/^```\s*([\w-]*)\s*$/);
		if (fence) {
			closeList();
			const lang = fence[1];
			const buf: string[] = [];
			i++;
			while (i < lines.length && !/^```\s*$/.test(lines[i])) {
				buf.push(lines[i]);
				i++;
			}
			i++;
			const code = escapeText(buf.join('\n'));
			if (DIAGRAM_LANGS.has(lang)) {
				htmlParts.push(
					`<div class="diagram-wrapper">` +
						`<button class="diagram-toggle-btn" type="button"></button>` +
						`<div data-diagram-render="true"><svg></svg></div>` +
						`<div data-diagram-code="true"><pre><code>${code}</code></pre></div>` +
					`</div>`,
				);
			} else if (lang) {
				// lang-label 是预览的"语言标签即复制按钮"，导出必须剥离
				htmlParts.push(
					`<div class="code-block-wrapper"><button class="lang-label">${lang}</button>` +
						`<pre><code class="language-${lang}">${code}</code></pre></div>`,
				);
			} else {
				htmlParts.push(`<pre><code>${code}</code></pre>`);
			}
			continue;
		}
		const h = line.match(/^(#{1,6})\s+(.*)$/);
		if (h) {
			closeList();
			htmlParts.push(`<h${h[1].length}>${inline(h[2], mdDir)}</h${h[1].length}>`);
			i++;
			continue;
		}
		if (/^\s*[-*]\s+/.test(line) || /^\s*\d+\.\s+/.test(line)) {
			const ordered = /^\s*\d+\.\s+/.test(line);
			const want: 'ul' | 'ol' = ordered ? 'ol' : 'ul';
			if (listOpen !== want) {
				closeList();
				htmlParts.push(`<${want}>`);
				listOpen = want;
			}
			let item = line.replace(/^\s*(?:[-*]|\d+\.)\s+/, '');
			let checkbox = '';
			const cb = item.match(/^\[( |x)\]\s+/);
			if (cb) {
				checkbox = `<input type="checkbox" ${cb[1] === 'x' ? 'checked' : ''} disabled> `;
				item = item.slice(cb[0].length);
			}
			htmlParts.push(`<li>${checkbox}${inline(item, mdDir)}</li>`);
			i++;
			continue;
		}
		if (/^>\s?/.test(line)) {
			closeList();
			htmlParts.push(`<blockquote><p>${inline(line.replace(/^>\s?/, ''), mdDir)}</p></blockquote>`);
			i++;
			continue;
		}
		if (/^\s*\|/.test(line) && lines[i + 1] && /^\s*\|?[\s:|-]+\|/.test(lines[i + 1])) {
			closeList();
			const cells = (row: string) =>
				row.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
			const head = cells(line);
			i += 2;
			const rows: string[][] = [];
			while (i < lines.length && /^\s*\|/.test(lines[i])) {
				rows.push(cells(lines[i]));
				i++;
			}
			htmlParts.push(
				'<table><thead><tr>' +
					head.map((c) => `<th>${inline(c, mdDir)}</th>`).join('') +
					'</tr></thead><tbody>' +
					rows.map((r) => '<tr>' + r.map((c) => `<td>${inline(c, mdDir)}</td>`).join('') + '</tr>').join('') +
					'</tbody></table>',
			);
			continue;
		}
		if (/^(---|\*\*\*|___)\s*$/.test(line)) {
			closeList();
			htmlParts.push('<hr>');
			i++;
			continue;
		}
		if (line.trim() === '') {
			closeList();
			i++;
			continue;
		}
		closeList();
		htmlParts.push(`<p>${inline(line, mdDir)}</p>`);
		i++;
	}
	closeList();

	// TOC 侧栏：条目来自文档标题（与预览大纲同源语义），导出侧重建为锚点
	const tocEntries = doc.headings
		.map((h) => {
			const plain = headingPlain(h.text);
			return `<button class="toc-link" data-id="${escapeAttr(slugify(plain))}">${escapeText(plain)}</button>`;
		})
		.join('\n');

	const frontmatterPanel = doc.hasFrontmatter
		? `<div class="frontmatter-panel"><select><option>meta</option></select></div>`
		: '';

	const container = document.createElement('div');
	container.className = 'markdown-container';
	container.innerHTML = `
		<div class="layout-container">
			<div class="toc-overlay-wrapper is-pinned">
				<div class="toc-container">
					<div class="toc-header"></div>
					<div class="toc-list">${tocEntries}</div>
				</div>
			</div>
			<div class="viewer-pane">
				<div class="viewer-content">
					${frontmatterPanel}
					<article class="markdown-body">
						${htmlParts.join('\n')}
					</article>
				</div>
			</div>
		</div>`;
	return container;
}

// asset:// → 真实文件字节（图片转换走真盘上的 codeblock.png）
// deferred：beforeAll 缩进对齐（顶层钩子，与下方 afterAll 同级同列）。
beforeAll(() => {
	vi.stubGlobal(
		'fetch',
		vi.fn(async (input: string | URL | Request) => {
			const url = String(input);
			// T1: katex 字体资产（Vite ?url 资产 URL），返回确定的假 woff2 字节
			if (/\.woff2($|\?)/.test(url)) {
				return new Response(new Uint8Array([0x77, 0x4f, 0x46, 0x32]), { status: 200 });
			}
			let p = '';
			if (url.startsWith('asset://localhost/')) p = url.slice('asset://localhost/'.length);
			else if (/^https?:\/\/asset\.localhost\//.test(url)) p = url.split('asset.localhost/')[1];
			else throw new Error(`unexpected fetch in export integration test: ${url}`);
			const bytes = readFileSync(decodeURIComponent(p));
			return new Response(bytes, { headers: { 'content-type': 'image/png' } });
		}),
	);
});
afterAll(() => {
	vi.unstubAllGlobals();
});

async function exportHtml(container: HTMLElement, title: string, width = 900): Promise<string> {
	return generateExportHtml(container, true, 'a4', false, title, width);
}

async function exportPrint(container: HTMLElement, title: string): Promise<string> {
	return generateExportHtml(container, true, 'a4', true, title, 900);
}

// 导出物 → DOM（结构性断言一律数元素，避免模板脚本/CSS 字面量误判）。
// $ 返回静态数组，$1 返回单个 Element。
function parseDoc(html: string): Document {
	return new DOMParser().parseFromString(html, 'text/html');
}
interface Querier {
	(sel: string): Element[];
	single(sel: string): Element | null;
	text(): string;
}
function querier(doc: Document): Querier {
	const $ = ((sel: string) => Array.from(doc.querySelectorAll(sel))) as Querier;
	$.single = (sel: string) => doc.querySelector(sel);
	$.text = () => doc.body?.textContent ?? '';
	return $;
}

const FIXTURES = [
	'test_highlight.md',
	'testfile.md',
	'demo_features.md',
	'export_pipeline_test.md',
	'all_languages_test.md',
];

describe.each(FIXTURES)('导出集成: %s', (file) => {
	const stem = file.replace(/\.md$/, '');
	const md = readFileSync(path.join(DEMO_DIR, file), 'utf-8');
	const parsed = parseMd(md);

	it('HTML 导出：完整文档 + 内容保全 + 无应用残留', async () => {
		const out = await exportHtml(mdToPreviewContainer(md, DEMO_DIR), stem);
		expect(out.startsWith('<!DOCTYPE html>')).toBe(true);
		expect(out).toContain(`<title>${stem}</title>`);
		expect(out.length).toBeGreaterThan(5000);

		const $ = querier(parseDoc(out));
		expect($('script').length).toBeGreaterThan(0); // 交互脚本注入
		expect($('.markdown-body').length).toBeGreaterThan(0);
		// 应用 chrome 不进导出物（选择器字符串会合法残留在模板脚本里，只查元素）
		expect($('.editor-pane').length).toBe(0);
		expect($('.split-bar').length).toBe(0);
		expect($('button.lang-label').length).toBe(0);
		// 内容保全：每个标题都有导出侧生成的锚点 ID（含中文 slug）。
		// 用 ID 集合比对——数字开头的 slug 的 CSS 转义选择器 happy-dom 不支持。
		const ids = new Set($('.markdown-body [id]').map((e) => e.id));
		for (const h of parsed.headings) {
			const id = slugify(headingPlain(h.text));
			if (id) expect(ids.has(id)).toBe(true);
		}
		// 代码块保全：语言标签与代码首行文本都在
		for (const c of parsed.codeBlocks) {
			expect($(`code.language-${c.lang}`).length).toBeGreaterThan(0);
			const marker = c.code.split('\n').find((l) => l.trim());
			if (marker) expect(out).toContain(escapeText(marker.trim()));
		}
		expect(out).not.toContain('[object Object]');
		expect(out).not.toContain('\uFEFF'); // BOM 不进导出物
	});

	it('HTML 导出：TOC 条目转为锚点且数量与标题一致', async () => {
		const out = await exportHtml(mdToPreviewContainer(md, DEMO_DIR), stem);
		const $ = querier(parseDoc(out));
		expect($('a.toc-link').length).toBe(parsed.headings.length);
		expect($('[data-action="switch-side"]').length).toBeGreaterThan(0);
		expect($('[data-action="hide"]').length).toBeGreaterThan(0);
		// 锚点指向的标题 ID 真实存在
		const anchorIds = new Set($('.markdown-body [id]').map((e) => e.id));
		for (const a of $('a.toc-link')) {
			const id = a.getAttribute('href')?.slice(1);
			if (id) expect(anchorIds.has(id)).toBe(true);
		}
	});

	it('PDF 打印导出：交互件剥离 + @page 页尺寸', async () => {
		const out = await exportPrint(mdToPreviewContainer(md, DEMO_DIR), stem);
		const $ = querier(parseDoc(out));
		expect($('.diagram-toggle-btn').length).toBe(0);
		expect($('.toc-overlay-wrapper').length).toBe(0);
		expect($('.frontmatter-panel').length).toBe(0);
		expect($('.markdown-body').length).toBeGreaterThan(0); // 正文仍在
		expect(out).toMatch(/@page\s*\{[^}]*size:\s*210mm\s*297mm/); // a4
	});
});

describe('导出集成: 专项变换（export_pipeline_test.md）', () => {
	const md = readFileSync(path.join(DEMO_DIR, 'export_pipeline_test.md'), 'utf-8');
	const parsed = parseMd(md);
	let out = '';
	let $: ReturnType<typeof querier>;
	beforeAll(async () => {
		out = await exportHtml(mdToPreviewContainer(md, DEMO_DIR), 'export_pipeline_test');
		$ = querier(parseDoc(out));
	});

	it('frontmatter 面板被剥离，YAML 字段值不泄漏进导出物', () => {
		expect(parsed.hasFrontmatter).toBe(true);
		expect($('.frontmatter-panel').length).toBe(0);
		expect($.text()).not.toContain('Markpad E2E');
	});

	it('图表 wrapper 保留（render/code 双区 + 切换按钮）', () => {
		expect(parsed.diagrams.length).toBe(1);
		expect($('.diagram-wrapper').length).toBe(parsed.diagrams.length);
		expect($('[data-diagram-render="true"]').length).toBe(parsed.diagrams.length);
		expect($('[data-diagram-code="true"]').length).toBe(parsed.diagrams.length);
		expect($('button.diagram-toggle-btn').length).toBe(parsed.diagrams.length);
	});

	it('本地图片转换为 dataURI（真实 png 字节）', () => {
		expect(parsed.images.length).toBe(1);
		const png = readFileSync(path.join(DEMO_DIR, '../../pics/codeblock.png'));
		const img = $.single('img[src^="data:image/png;base64,"]');
		expect(img).not.toBeNull();
		expect(img!.getAttribute('src')).toContain(png.toString('base64'));
		expect($('img[src^="asset:"]').length).toBe(0); // 不残留 asset 协议地址
	});

	it('相对 .md 链接改写为 .html，外链保持不变', () => {
		expect($('a[href="testfile.html"]').length).toBe(1);
		expect($('a[href="https://github.com/bhxch/Markpad"]').length).toBe(1);
	});

	it('表格保全', () => {
		expect($.text()).toContain('列一');
		expect($.text()).toContain('内容丙');
	});
});

describe('导出集成: 逐文件特性', () => {
	it('test_highlight.md: 三语言代码块保全且 BOM 不入导出物', async () => {
		const md = readFileSync(path.join(DEMO_DIR, 'test_highlight.md'), 'utf-8');
		expect(md.charCodeAt(0)).toBe(0xfeff); // 夹具确有 BOM
		const out = await exportHtml(mdToPreviewContainer(md, DEMO_DIR), 'test_highlight');
		const $ = querier(parseDoc(out));
		for (const marker of ['fn main()', 'def hello', 'Hello World']) {
			expect(out).toContain(marker);
		}
		for (const lang of ['rust', 'python', 'javascript']) {
			expect($(`code.language-${lang}`).length).toBe(1);
		}
	});

	it('testfile.md: checkbox 任务列表保全', async () => {
		const md = readFileSync(path.join(DEMO_DIR, 'testfile.md'), 'utf-8');
		const checked = (md.match(/^\s*- \[x\]/gm) ?? []).length;
		const unchecked = (md.match(/^\s*- \[ \]/gm) ?? []).length;
		expect(checked + unchecked).toBeGreaterThan(0);
		const out = await exportHtml(mdToPreviewContainer(md, DEMO_DIR), 'testfile');
		const $ = querier(parseDoc(out));
		expect($('input[type=checkbox][checked]').length).toBe(checked);
		expect($('input[type=checkbox]:not([checked])').length).toBe(unchecked);
	});

	it('all_languages_test.md: 大文件全量导出（代码块零丢失）', async () => {
		const md = readFileSync(path.join(DEMO_DIR, 'all_languages_test.md'), 'utf-8');
		const parsed = parseMd(md);
		const total = parsed.codeBlocks.length + parsed.diagrams.length;
		expect(total).toBeGreaterThan(100); // 夹具确为百语言级
		const out = await exportHtml(mdToPreviewContainer(md, DEMO_DIR), 'all_languages_test');
		const $ = querier(parseDoc(out));
		// 每个代码块（含图表源码区）都有 <pre>，零丢失
		expect($('pre').length).toBe(total);
		expect($.text()).toContain('procedure Hello'); // ada 抽查
	});

	it('demo_features.md: 八种图表语言全部进导出物', async () => {
		const md = readFileSync(path.join(DEMO_DIR, 'demo_features.md'), 'utf-8');
		const parsed = parseMd(md);
		const out = await exportHtml(mdToPreviewContainer(md, DEMO_DIR), 'demo_features');
		const $ = querier(parseDoc(out));
		for (const lang of ['mermaid', 'dot', 'nomnoml', 'vegalite', 'bpmn', 'svgbob', 'plantuml', 'excalidraw']) {
			const d = parsed.diagrams.find((x) => x.lang === lang);
			expect(d, `夹具缺少 ${lang} 图表`).toBeDefined();
			const marker = d!.code.split('\n').find((l) => l.trim())!.trim();
			expect($.text()).toContain(marker);
		}
	});
});

// T1: 导出物是自包含文件——含公式的文档必须携带 katex.min.css（.katex-mathml
// 靠它的 clip 规则隐藏、.katex-html 靠它排版）与所用字体族的 data URI；纯文本
// 文档零负担（不携带任何 KaTeX 痕迹）。
describe('导出集成: KaTeX 样式内联（T1）', () => {
	const md = readFileSync(path.join(DEMO_DIR, 'testfile.md'), 'utf-8');

	function withKatex(): HTMLElement {
		const container = mdToPreviewContainer(md, DEMO_DIR);
		const body = container.querySelector('.markdown-body') as HTMLElement;
		body.innerHTML +=
			'<span class="katex"><span class="katex-mathml"><math>…</math></span>' +
			'<span class="katex-html">x</span></span>';
		return container;
	}

	it('含公式文档导出 HTML 携带 clip 隐藏规则与 data URI 字体；纯文本文档不携带', async () => {
		const withMath = await exportHtml(withKatex(), 'testfile');
		expect(withMath).toMatch(/\.katex-mathml\s*\{[^}]*clip(-path)?:/);
		expect(withMath).toContain('KaTeX_Main');
		expect(withMath).toContain('data:font/woff2;base64,');
		// 保留的 @font-face 源已改写，内部资产路径与 css 相对路径都不外泄
		expect(withMath).not.toContain('/node_modules/');
		expect(withMath).not.toMatch(/url\(["']?fonts\//);

		const plain = await exportHtml(mdToPreviewContainer(md, DEMO_DIR), 'testfile');
		expect(plain).not.toContain('KaTeX_Main');
		expect(plain).not.toContain('.katex-mathml');
	});
});
