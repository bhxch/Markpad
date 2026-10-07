#!/usr/bin/env bun
// @ts-nocheck —— bun 运行时脚本（Bun 全局、跨目录 .ts 导入），不适用 web tsconfig 语义检查
/**
 * 导出管线端到端集成测试（L2）：tauri-connector 驱动运行中的应用。
 *
 * 用法:
 *   bun run scripts/export-e2e.mjs [md 文件...]     # 缺省 = docs/demo 全部 5 份
 *
 * 前置:
 *   1. dev-connector debug 构建: npx tauri build --debug --no-bundle -- --features dev-connector
 *   2. headless: scripts/start-markpad.sh（Xvfb + D-Bus），或任意可显示环境
 *      （脚本自身会清杀旧实例并按文件重启应用——argv 直开文件是稳定路径，
 *      单实例转发不可靠）
 *
 * 与 src/lib/export.integration.test.ts（L1, vitest）的分工：
 *   L1 用仿真预览 DOM 驱动真实 generateExportHtml，CI 可跑；
 *   L2 用真实链路（Rust comrak render_markdown → richContent → pipeline →
 *   generateExportHtml → save_file_content IPC 落盘），需要运行中的应用。
 *
 * 断言全部是导出物字节级的区域检查（.markdown-body 区段 + 全文），不用
 * DOM 解析器——happy-dom 对大文件/大型 SVG/超长属性有解析断裂（浏览器
 * 渲染同一文件正常，已用 X11 截图证实），解析器缺陷不该被误报为导出缺陷。
 * 标题 id 期望值用 comrak 的 GFM slug 算法（非字母数字删除、空白逐个转
 * 连字符、保留下划线、不去首尾连字符——对照真实导出物逐一验证）。
 */
import { readFileSync, mkdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { send } from '../../.agents/skills/tauri-connector/scripts/connector.ts';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEMO_DIR = path.join(ROOT, 'docs/demo');
const BIN = path.join(ROOT, 'src-tauri/target/debug/Markpad');
const OUT_DIR = '/tmp/markpad-export-e2e';

const DIAGRAM_LANGS = new Set([
	'mermaid', 'dot', 'graphviz', 'plantuml', 'svgbob', 'nomnoml',
	'vega', 'vegalite', 'vega-lite', 'excalidraw', 'bpmn', 'kroki',
]);

// ---------- md 源解析（生成断言期望值） ----------
function parseMd(mdRaw) {
	const md = mdRaw.replace(/^\uFEFF/, '');
	const doc = { headings: [], codeBlocks: [], diagrams: [], images: [], hasFrontmatter: false, firstHeading: '' };
	let body = md;
	const fm = md.match(/^---\r?\n[\s\S]*?\r?\n---\s*(?:\n|$)/);
	if (fm) {
		doc.hasFrontmatter = true;
		body = md.slice(fm[0].length);
	}
	const lines = body.split('\n');
	let i = 0;
	while (i < lines.length) {
		const fence = lines[i].match(/^```\s*([\w-]*)\s*$/);
		if (fence) {
			const lang = fence[1];
			const buf = [];
			i++;
			while (i < lines.length && !/^```\s*$/.test(lines[i])) { buf.push(lines[i]); i++; }
			i++;
			if (DIAGRAM_LANGS.has(lang)) doc.diagrams.push({ lang, code: buf.join('\n') });
			else if (lang) doc.codeBlocks.push({ lang, code: buf.join('\n') });
			continue;
		}
		const img = lines[i].match(/!\[([^\]]*)\]\(([^)]+)\)/);
		if (img && !img[2].startsWith('http')) doc.images.push(img[2]);
		const h = lines[i].match(/^(#{1,6})\s+(.*)$/);
		if (h) {
			const text = h[2].replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/[*`~]/g, '').trim();
			doc.headings.push(text);
			if (!doc.firstHeading) doc.firstHeading = text;
		}
		i++;
	}
	return doc;
}

// ---------- connector 驱动 ----------
const EVAL_TIMEOUT = 120000;

async function evalJs(script) {
	const res = await send({ type: 'execute_js', script, window_id: 'main' }, EVAL_TIMEOUT);
	if (res.error) throw new Error(`eval error: ${res.error}`);
	return res.result;
}

async function launchWithFile(mdPath) {
	Bun.spawnSync(['pkill', '-f', 'target/debug/Markpad']);
	await Bun.sleep(1000);
	const child = Bun.spawn([BIN, mdPath], {
		stdout: 'ignore',
		stderr: 'ignore',
		env: { ...process.env, DISPLAY: process.env.DISPLAY ?? ':99' },
	});
	child.unref();
	const deadline = Date.now() + 20000;
	while (Date.now() < deadline) {
		try {
			if ((await evalJs('document.readyState')) === 'complete') return;
		} catch {}
		await Bun.sleep(500);
	}
	throw new Error('应用启动超时（webview 未就绪）');
}

async function openAndWait(mdPath, firstHeading, deadlineMs = 30000) {
	await launchWithFile(mdPath);
	const marker = firstHeading.slice(0, 12);
	const deadline = Date.now() + deadlineMs;
	while (Date.now() < deadline) {
		await Bun.sleep(500);
		const ok = await evalJs(
			`(() => { const b = document.querySelector('.markdown-body'); ` +
			`return !!(b && b.textContent && b.textContent.includes(${JSON.stringify(marker)})); })()`,
		);
		if (ok === true) return;
	}
	throw new Error(`预览渲染超时: ${mdPath}`);
}

async function generateInPage(title) {
	// 异步任务在页面内执行，结果挂 window.__e2eOut 轮询取回（不依赖 eval 的 await 语义）。
	// bridge 按表达式求值，多语句必须包进 IIFE。
	await evalJs(`(() => {
		window.__e2eOut = { state: 'pending' };
		(async () => {
			try {
				const fn = window.__markpadExport && window.__markpadExport.generateExportHtml;
				if (!fn) throw new Error('__markpadExport hook missing (需重建含新前端资源的 debug 二进制)');
				const c = document.querySelector('.markdown-container');
				if (!c) throw new Error('.markdown-container not found');
				const html = await fn(c, true, 'a4', false, ${JSON.stringify(title)}, 900);
				window.__e2eOut = { state: 'done', html };
			} catch (e) {
				window.__e2eOut = { state: 'error', message: String(e) };
			}
		})();
		return 'kicked';
	})()`);
	const deadline = Date.now() + EVAL_TIMEOUT;
	while (Date.now() < deadline) {
		await Bun.sleep(400);
		const st = await evalJs('JSON.stringify(window.__e2eOut ? { state: window.__e2eOut.state, len: window.__e2eOut.html ? window.__e2eOut.html.length : 0, message: window.__e2eOut.message } : { state: "missing" })');
		const status = JSON.parse(st);
		if (status.state === 'done') {
			return String(await evalJs('window.__e2eOut.html'));
		}
		if (status.state === 'error') throw new Error(`页面内导出失败: ${status.message}`);
	}
	throw new Error('页面内导出超时');
}

async function saveViaIpc(filePath) {
	// 真实 save_file_content IPC（三参 encoding 契约，缺参在 Tauri v2 反序列化必败）
	const res = await evalJs(
		`window.__TAURI__.core.invoke('save_file_content', ` +
		`{ path: ${JSON.stringify(filePath)}, content: window.__e2eOut.html, encoding: 'UTF-8' })` +
		`.then(() => 'saved').catch(e => 'invoke-FAIL: ' + e)`,
	);
	if (res !== 'saved') throw new Error(res);
	if (!existsSync(filePath)) throw new Error(`IPC 声称成功但文件不存在: ${filePath}`);
}

// ---------- 断言（字节级区域检查） ----------
let failures = 0;

function check(label, cond, detail = '') {
	if (cond) {
		console.log(`    ✓ ${label}`);
	} else {
		failures++;
		console.log(`    ✗ ${label}${detail ? ' — ' + detail : ''}`);
	}
}


// 规范化比对：tree-sitter 会把代码拆成 token span（空白可能落在标签之间），
// 原始字符串在 HTML 中不连续。去标签 + 实体解码 + 去空白后做包含检查，
// 保证"字符按序保全"这一实质契约，不依赖 span 切分方式。
const squash = (s) => s
	.replace(/<[^>]+>/g, '')
	.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&')
	.replace(/\s+/g, '');

// comrak 的 GFM slug：小写；删除字母/数字/空白/-/_ 以外的字符；空白逐个转 '-'
const gfmSlug = (t) => t.toLowerCase().replace(/[^\p{L}\p{N}\s\-_]/gu, '').replace(/\s/g, '-');

function assertExport(html, mdPath, parsed) {
	const stem = path.basename(mdPath, '.md');
	const artMatch = html.match(/<article[^>]*class="markdown-body[^"]*"/);
	const start = artMatch ? artMatch.index : -1;
	const end = html.lastIndexOf('</article>');
	const body = start >= 0 && end > start ? html.slice(start, end) : '';

	check('DOCTYPE + </html> 完整文档', html.startsWith('<!DOCTYPE html>') && html.trimEnd().endsWith('</html>'));
	check('title 含文件名', html.includes(`<title>${stem}`));
	check('正文区提取', body.length > 100);
	check('交互脚本注入', (html.match(/<script/g) ?? []).length > 0);
	check('无应用 chrome', !body.includes('class="editor-pane"') && !body.includes('class="split-bar"'));
	check('无复制按钮残留', !body.includes('<button class="lang-label"'));
	check('frontmatter 面板剥离', !html.includes('class="frontmatter-panel"'));
	check('无 [object Object]', !html.includes('[object Object]'));
	check('无 BOM', !html.includes('\uFEFF'));

	// 标题锚点：comrak 为全部标题生成 GFM slug id
	const ids = new Set([...body.matchAll(/<h[1-6][^>]*?id="([^"]*)"/g)].map((m) => m[1]));
	const missingHeadings = parsed.headings.filter((h) => !ids.has(gfmSlug(h)));
	check(`标题锚点保全 (${parsed.headings.length})`, missingHeadings.length === 0,
		JSON.stringify(missingHeadings.slice(0, 3)));

	// 代码块/图表源码首行文本保全（规范化比对，见 squash 注释）
	const bodySquashed = squash(body);
	const firstLineKey = (code) => {
		const line = code.split('\n').find((l) => l.trim());
		return line ? line.trim().replace(/\s+/g, '') : null;
	};
	const missingCode = parsed.codeBlocks.filter((c) => {
		const k = firstLineKey(c.code);
		return k && !bodySquashed.includes(k);
	});
	check(`代码块保全 (${parsed.codeBlocks.length})`, missingCode.length === 0,
		JSON.stringify(missingCode.map((c) => c.lang).slice(0, 5)));
	const missingDiag = parsed.diagrams.filter((d) => {
		const k = firstLineKey(d.code);
		return k && !bodySquashed.includes(k);
	});
	check(`图表源码保全 (${parsed.diagrams.length})`, missingDiag.length === 0,
		JSON.stringify(missingDiag.map((d) => d.lang).slice(0, 5)));
	if (parsed.diagrams.some((d) => d.lang === 'mermaid')) {
		check('mermaid SVG 已渲染', (body.match(/<svg/g) ?? []).length > 0);
	}
	if (parsed.images.length > 0) {
		// L2 独有：真实 asset:// 协议 fetch → dataURI（L1 用 stub fetch，此处走真链路）
		check(`本地图片 → dataURI (${parsed.images.length})`,
			(body.match(/src="data:image\//g) ?? []).length >= parsed.images.length &&
			!body.includes('src="asset:'));
	}
}

// ---------- 主流程 ----------
const args = process.argv.slice(2).map((a) => path.resolve(a));
const files = args.length ? args : ['test_highlight.md', 'testfile.md', 'demo_features.md', 'export_pipeline_test.md', 'all_languages_test.md']
	.map((f) => path.join(DEMO_DIR, f));

for (const f of files) {
	if (!existsSync(f)) {
		console.error(`✗ 夹具不存在: ${f}`);
		process.exit(1);
	}
}

console.log(`导出 e2e：${files.length} 个文件，输出目录 ${OUT_DIR}`);
mkdirSync(OUT_DIR, { recursive: true });

for (const mdPath of files) {
	const stem = path.basename(mdPath, '.md');
	console.log(`\n[ ${stem} ]`);
	const parsed = parseMd(readFileSync(mdPath, 'utf-8'));

	await openAndWait(mdPath, parsed.firstHeading || stem);
	const html = await generateInPage(stem);
	console.log(`    生成 ${html.length} 字节`);
	assertExport(html, mdPath, parsed);

	// 真实 IPC 落盘 + 字节级回读复验（UTF-8 编码契约）
	const outPath = path.join(OUT_DIR, `${stem}.export.html`);
	await saveViaIpc(outPath);
	const fromDisk = readFileSync(outPath, 'utf-8');
	check('IPC 落盘 + UTF-8 回读一致', fromDisk === html);
	check('磁盘文件含正文区', /<article[^>]*class="markdown-body/.test(fromDisk));
}

console.log(`\n结果: ${failures === 0 ? '全部通过 ✓' : failures + ' 项失败 ✗'}`);
process.exit(failures === 0 ? 0 : 1);
