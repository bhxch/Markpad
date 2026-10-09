import { describe, it, expect, vi } from 'vitest';
import { join } from 'node:path';
import { generateExportHtml, computeFitScale, convertAssetImagesToDataUri } from './export';

// save_file_content 契约测试用（见文件末尾独立 describe）。vi.mock 会被提升到
// 文件顶部，作用于本文件整个模块图；现有用例不触发 invoke/save，不受影响。
const { invokeMock, saveDialogMock } = vi.hoisted(() => ({
	invokeMock: vi.fn<(command: string, args: Record<string, unknown>) => Promise<null>>(async () => null),
	saveDialogMock: vi.fn<() => Promise<string | null>>(async () => '/tmp/markpad-export.html'),
}));
vi.mock('@tauri-apps/api/core', () => ({ invoke: invokeMock }));
vi.mock('@tauri-apps/plugin-dialog', () => ({ save: saveDialogMock }));

// 构造镜像真实 DOM 的导出容器（D22）：.layout-container 是 TOC wrapper 与
// 正文的公共祖先；二轮 merge 曾误选 .viewer-content（wrapper 之外的节点）
// 致 TOC 重建死路、而本夹具失真掩护了它——夹具必须与 MarkdownViewer 同构。
function makeContainer(inner = ''): HTMLElement {
	const container = document.createElement('div');
	container.className = 'layout-container';
	container.innerHTML = `
		<div class="pane viewer-pane" style="flex: 0.5">
			<div class="find-bar">find</div>
			<div class="viewer-content">
				<article class="markdown-body">
					<h1 id="test">测试标题</h1>
					<p>正文内容 https://example.com/a/very/long/unbreakable/path/that/should/wrap</p>
					${inner}
				</article>
			</div>
		</div>
		<div class="top-fade-mask"></div>
		<div class="toc-toggle-floating"></div>
		<div class="toc-overlay-wrapper is-pinned">
			<div class="toc-resize-handle"></div>
			<div class="toc-container">
				<div class="toc-header"></div>
				<div class="toc-list"><button class="toc-link" data-id="test">目录项</button></div>
			</div>
		</div>`;
	return container;
}

// 带真实 diagram 结构的 container（应用用 [data-diagram-render/code]）
function makeContainerWithDiagram(): HTMLElement {
	return makeContainer(`
		<div class="diagram-wrapper">
			<button class="diagram-toggle-btn" type="button"></button>
			<div data-diagram-render="true"><svg></svg></div>
			<div data-diagram-code="true"><pre><code>graph TD</code></pre></div>
		</div>`);
}

describe('generateExportHtml: HTML 导出布局', () => {
	it('问题1: .markdown-body 居中 (margin: 0 auto)', async () => {
		const out = await generateExportHtml(makeContainer(), false, 'a4', false, '测试');
		expect(out).toMatch(/\.markdown-body\s*\{[^}]*\bmargin:\s*0\s+auto\b[^}]*\}/);
	});

	it('问题2: .markdown-body 长字符串换行 (overflow-wrap: break-word)', async () => {
		const out = await generateExportHtml(makeContainer(), false, 'a4', false, '测试');
		expect(out).toMatch(/\.markdown-body\s*\{[^}]*\boverflow-wrap:\s*break-word\b[^}]*\}/);
	});
});

describe('generateExportHtml: PDF 导出', () => {
	it('问题3a: PDF 移除 .toc-overlay-wrapper DOM 节点', async () => {
		const out = await generateExportHtml(makeContainer(), true, 'a4', true, '测试');
		expect(out).not.toMatch(/class="[^"]*toc-overlay-wrapper/);
		expect(out).not.toMatch(/class="[^"]*toc-container/);
	});

	it('问题3b: PDF @media print 约束 pre 宽度', async () => {
		const out = await generateExportHtml(makeContainer(), true, 'a4', true, '测试');
		expect(out).toMatch(/pre[^{]*\{[^}]*max-width:\s*100%/);
	});
});

describe('默认页面大小 (已移除 dynamic)', () => {
	it('generateExportHtml 默认 pageSize 为 a4', async () => {
		const out = await generateExportHtml(makeContainer(), true, undefined as any, true, '测试');
		expect(out).toMatch(/size:\s*210mm\s+297mm/);
	});
});

// Minor2（spec 2026-10-07-theme-restore）：vscode UI 主题激活时 applyTheme 不设
// data-theme-scheme（T7 特异性修复的前提），导出 html 元数据的 scheme 兜底
// 'vscode' 保真，而非误标 github-light；视觉不受影响（cssVariables 取自活 DOM）。
describe('readExportTheme vscode 兜底（Minor2）', () => {
	it('data-theme=vscode 且无 scheme 属性：导出元 data-theme-scheme=vscode', async () => {
		const root = document.documentElement;
		root.setAttribute('data-theme', 'vscode');
		root.setAttribute('data-theme-mode', 'dark');
		root.removeAttribute('data-theme-scheme');
		try {
			const out = await generateExportHtml(makeContainer(), false, 'a4', false, '测试');
			expect(out).toContain('data-theme-scheme="vscode"');
			expect(out).toContain('data-theme-mode="dark"');
		} finally {
			root.removeAttribute('data-theme');
			root.removeAttribute('data-theme-mode');
		}
	});

	it('缺 scheme 且非 vscode：维持 github-light 旧行为', async () => {
		const root = document.documentElement;
		root.removeAttribute('data-theme-scheme');
		root.setAttribute('data-theme', 'light');
		try {
			const out = await generateExportHtml(makeContainer(), false, 'a4', false, '测试');
			expect(out).toContain('data-theme-scheme="github-light"');
		} finally {
			root.removeAttribute('data-theme');
		}
	});
});

describe('computeFitScale', () => {
	it('ratio > 1: 缩放且起新页', () => {
		expect(computeFitScale(2)).toEqual({ scale: 0.95 / 2, newPage: true });
	});
	it('ratio 0.8~1 且 scale<1: 略缩', () => {
		expect(computeFitScale(0.97)).toEqual({ scale: 0.95 / 0.97, newPage: false });
	});
	it('ratio<=0.8 或 scale>=1: null', () => {
		expect(computeFitScale(0.5)).toBeNull();
		expect(computeFitScale(0.9)).toBeNull();
	});
});

describe('PDF 分页（只一页回归）', () => {
	it('@media print 不再用 flex 布局 .layout-container', async () => {
		const out = await generateExportHtml(makeContainer(), true, 'a4', true, '测试');
		const flexLayoutCount = (out.match(/\.layout-container\s*\{[^}]*display:\s*flex/g) || []).length;
		expect(flexLayoutCount, '@media print 的 .layout-container 不应是 flex').toBeLessThanOrEqual(1);
	});
});

describe('PDF html/body 分页', () => {
	it('@media print 覆盖 html/body 为 overflow:visible（基础 overflow:hidden 会阻止分页）', async () => {
		const out = await generateExportHtml(makeContainer(), true, 'a4', true, '测试');
		expect(out).toMatch(/@media\s+print[\s\S]*?html,\s*body[\s\S]*?overflow:\s*visible/i);
	});
});

describe('HTML 导出 diagram 切换按钮', () => {
	it('diagram toggle CSS 选择器匹配实际 DOM ([data-diagram-render/code])', async () => {
		const out = await generateExportHtml(makeContainerWithDiagram(), false, 'a4', false, '测试');
		expect(out, '.show-source 应隐藏 [data-diagram-render]').toMatch(
			/show-source[^{]*data-diagram-render[^{]*\{[^}]*display:\s*none/,
		);
		expect(out, '.show-source 应显示 [data-diagram-code]').toMatch(
			/show-source[^{]*data-diagram-code[^{]*\{[^}]*display:\s*block/,
		);
	});

	it('T2: 导出模板 .diagram-toggle-btn 带 z-index，切 code 后按钮不被 pre 盖住（可命中）', async () => {
		const out = await generateExportHtml(makeContainerWithDiagram(), false, 'a4', false, '测试');
		const btnRule = out.match(/\.diagram-toggle-btn\s*\{[^}]*\}/)?.[0] ?? '';
		expect(btnRule).toMatch(/z-index:\s*10/);
	});
});

describe('frontmatter 面板清理（Task 14 ①）', () => {
	// viewer-content 克隆会带出预览的交互式 <details class="frontmatter-panel">，
	// 两个导出分支（HTML/PDF）都不得把它带进导出物。
	it('HTML 导出移除 .frontmatter-panel', async () => {
		const container = makeContainer('<details class="frontmatter-panel"><summary>属性</summary></details>');
		const out = await generateExportHtml(container, false, 'a4', false, '测试');
		expect(out).not.toMatch(/class="[^"]*frontmatter-panel/);
		expect(out).toContain('测试标题');
	});

	it('PDF 导出移除 .frontmatter-panel', async () => {
		const container = makeContainer('<details class="frontmatter-panel"><summary>属性</summary></details>');
		const out = await generateExportHtml(container, true, 'a4', true, '测试');
		expect(out).not.toMatch(/class="[^"]*frontmatter-panel/);
	});
});

describe('主题属性双兼容（Task 16）', () => {
	it('无 data-theme-mode 时回落 data-theme 判暗色', async () => {
		const root = document.documentElement;
		root.removeAttribute('data-theme-mode');
		root.setAttribute('data-theme', 'dark');
		try {
			const out = await generateExportHtml(makeContainer(), false, 'a4', false, '测试');
			expect(out).toMatch(/data-theme-mode="dark"/);
		} finally {
			root.removeAttribute('data-theme');
		}
	});

	it('data-theme-mode 缺失且 data-theme 非暗色时按 light', async () => {
		const root = document.documentElement;
		root.removeAttribute('data-theme-mode');
		root.setAttribute('data-theme', 'light');
		try {
			const out = await generateExportHtml(makeContainer(), false, 'a4', false, '测试');
			expect(out).toMatch(/data-theme-mode="light"/);
		} finally {
			root.removeAttribute('data-theme');
		}
	});
});

describe('convertAssetImagesToDataUri', () => {
	it('把 asset:// 图片转为 data URI（外部浏览器可访问）', async () => {
		const container = document.createElement('div');
		const img = document.createElement('img');
		img.setAttribute('src', 'asset://localhost/tmp/test.png');
		container.appendChild(img);

		const origFetch = globalThis.fetch;
		globalThis.fetch = vi.fn().mockResolvedValue({
			blob: () =>
				Promise.resolve(
					new Blob([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], { type: 'image/png' }),
				),
		}) as any;

		try {
			await convertAssetImagesToDataUri(container);
			expect(img.getAttribute('src')).toMatch(/^data:image\/png;base64,/);
		} finally {
			globalThis.fetch = origFetch;
		}
	});

	it('非 asset:// 图片（http/data）保持不变', async () => {
		const container = document.createElement('div');
		const img = document.createElement('img');
		img.setAttribute('src', 'https://example.com/a.png');
		container.appendChild(img);
		await convertAssetImagesToDataUri(container);
		expect(img.getAttribute('src')).toBe('https://example.com/a.png');
	});

	it('Windows 形态 http(s)://asset.localhost/... 也转 data URI（Task 16 吸收）', async () => {
		const container = document.createElement('div');
		const winImg = document.createElement('img');
		winImg.setAttribute('src', 'http://asset.localhost/C%3A%5CUsers%5Ctest%5Ca.png');
		container.appendChild(winImg);
		// 主机边界锚定：asset.localhost 的同名前缀外链不得被误吞
		const evilImg = document.createElement('img');
		evilImg.setAttribute('src', 'https://asset.localhost.example/a.png');
		container.appendChild(evilImg);

		const origFetch = globalThis.fetch;
		globalThis.fetch = vi.fn().mockResolvedValue({
			blob: () =>
				Promise.resolve(
					new Blob([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], { type: 'image/png' }),
				),
		}) as any;

		try {
			await convertAssetImagesToDataUri(container);
			expect(winImg.getAttribute('src')).toMatch(/^data:image\/png;base64,/);
			expect(evilImg.getAttribute('src')).toBe('https://asset.localhost.example/a.png');
		} finally {
			globalThis.fetch = origFetch;
		}
	});
});

describe('.md→.html 链接改写（Task 16 吸收 rewriteMarkdownHrefForExport）', () => {
	it('相对 .md 链接导出后改写为 .html，保留 query/hash；外链 .md 不动', async () => {
		const container = makeContainer(
			'<a href="notes/Plan%20A.md#todo">邻居文档</a>' +
				'<a href="https://example.test/a.md">外链</a>' +
				'<a href="readme.markdown?raw=1">带query</a>' +
				'<a href="#test">锚点</a>',
		);
		const out = await generateExportHtml(container, false, 'a4', false, '测试');
		expect(out).toContain('href="notes/Plan%20A.html#todo"');
		expect(out).toContain('href="readme.html?raw=1"');
		expect(out).toContain('href="https://example.test/a.md"');
		expect(out).toContain('href="#test"');
	});
});

describe('多 tab 宿主剥离（Task 17 ⑨）', () => {
	// 上游骨架：.markdown-body 内每个打开的 tab 挂一个 .markdown-blocks 宿主
	//（MV 的 previewHosts），非活动 tab 仅 inline display:none 但内容仍挂载。
	// 导出物只允许含活动 tab 的正文。
	function makeContainerWithTabs(): HTMLElement {
		return makeContainer(`
			<div class="markdown-blocks" style="display: none;"><h2>其他tab标题</h2><p>inactive-tab-content</p></div>
			<div class="markdown-blocks"><h2>活动tab标题</h2><p>active-tab-content</p></div>`);
	}

	it('HTML 导出只保留非 display:none 的活动宿主', async () => {
		const out = await generateExportHtml(makeContainerWithTabs(), false, 'a4', false, '测试');
		expect(out).toContain('active-tab-content');
		expect(out).not.toContain('inactive-tab-content');
	});

	it('PDF 导出同样剥离非活动宿主', async () => {
		const out = await generateExportHtml(makeContainerWithTabs(), true, 'a4', true, '测试');
		expect(out).toContain('active-tab-content');
		expect(out).not.toContain('inactive-tab-content');
	});

	it('单一宿主时不剥离（正常导出）', async () => {
		const out = await generateExportHtml(
			makeContainer('<div class="markdown-blocks"><p>only-tab-content</p></div>'),
			false, 'a4', false, '测试',
		);
		expect(out).toContain('only-tab-content');
	});

	it('判据不唯一（无可见宿主）时保守保留全部，不误删', async () => {
		const container = makeContainer(`
			<div class="markdown-blocks" style="display: none;"><p>tab-a-content</p></div>
			<div class="markdown-blocks" style="display: none;"><p>tab-b-content</p></div>`);
		const out = await generateExportHtml(container, false, 'a4', false, '测试');
		expect(out).toContain('tab-a-content');
		expect(out).toContain('tab-b-content');
	});
});

describe('TOC 新交互类清理（Task 16）', () => {
	function makeContainerWithTocHandle(): HTMLElement {
		const container = makeContainer();
		const wrapper = container.querySelector('.toc-overlay-wrapper') as HTMLElement;
		const handle = document.createElement('div');
		handle.className = 'toc-resize-handle';
		wrapper.prepend(handle);
		wrapper.classList.add('is-overhanging', 'is-resizing');
		return container;
	}

	it('HTML 导出移除 .toc-resize-handle，wrapper 固化为 pinned 且无悬浮/拖拽态类', async () => {
		const out = await generateExportHtml(makeContainerWithTocHandle(), true, 'a4', false, '测试');
		expect(out).not.toMatch(/toc-resize-handle/);
		expect(out).toMatch(/class="[^"]*toc-overlay-wrapper[^"]*is-pinned/);
		expect(out).not.toMatch(/is-overhanging|is-resizing/);
	});

	it('PDF 导出移除整个 TOC wrapper（含 .toc-resize-handle）', async () => {
		const out = await generateExportHtml(makeContainerWithTocHandle(), true, 'a4', true, '测试');
		expect(out).not.toMatch(/toc-resize-handle/);
		expect(out).not.toMatch(/class="[^"]*toc-overlay-wrapper/);
	});
});

describe('generateExportHtml: 导出宽度随预览设置派生（上游 #467）', () => {
	it('contentWidth 参数注入 .markdown-body 的 max-width', async () => {
		const out = await generateExportHtml(makeContainer(), false, 'a4', false, '测试', 1240);
		expect(out).toMatch(/\.markdown-body\s*\{[^}]*\bmax-width:\s*1240px\b[^}]*\}/);
	});

	it('缺省 contentWidth 回退 900px，保持纯函数向后兼容', async () => {
		const out = await generateExportHtml(makeContainer(), false, 'a4', false, '测试');
		expect(out).toMatch(/\.markdown-body\s*\{[^}]*\bmax-width:\s*900px\b[^}]*\}/);
	});
});

describe('exportAsHtml: save_file_content 契约', () => {
	it('HTML 导出保存以 save_file_content 落盘且携带 encoding: UTF-8', async () => {
		// Rust 端 save_file_content 为三参必填 (path, content, encoding)，Tauri v2
		// 对缺失 key 在反序列化阶段确定性报 missing required key encoding，
		// 导出保存必败——本用例锁定 encoding 参数防回归。
		const { exportAsHtml } = await import('./export');
		invokeMock.mockClear();
		saveDialogMock.mockClear();

		const ok = await exportAsHtml(makeContainer(), false, '测试文档');

		expect(ok).toBe(true);
		expect(saveDialogMock).toHaveBeenCalledTimes(1);
		expect(invokeMock).toHaveBeenCalledTimes(1);

		const [command, args] = invokeMock.mock.calls[0];
		expect(command).toBe('save_file_content');
		expect(args).toMatchObject({ path: '/tmp/markpad-export.html', encoding: 'UTF-8' });
		expect(typeof args.content).toBe('string');
		expect(args.content).toContain('markdown-body');
	});
});

describe('PDF 动态单页（D21，spec 2026-10-09）', () => {
	it('dynamic 输出 @page 210mm auto 占位且不带固定页高', async () => {
		const out = await generateExportHtml(makeContainer(), false, 'dynamic', true, '测试');
		expect(out).toMatch(/@page\s*\{\s*size:\s*210mm auto;\s*margin:\s*15mm;/);
		expect(out).not.toMatch(/size:\s*210mm 297mm/);
	});

	it('dynamic 不做按页缩放（processDiagramsForPrint 跳过，源码契约）', async () => {
		const { readFileSync } = await import('node:fs');
		const src = readFileSync(join(__dirname, 'export.ts'), 'utf8');
		expect(src).toMatch(/forPrint && pageSize !== 'dynamic'\)/);
	});

	it('dynamicPageHeightMm：内容高度换 mm 并加 30mm 边距 + 1mm 缓冲', async () => {
		const { dynamicPageHeightMm } = await import('./export');
		expect(dynamicPageHeightMm(0)).toBe(31);
		expect(dynamicPageHeightMm(96)).toBe(57); // ceil(25.4)=26 + 31
		expect(dynamicPageHeightMm(1000)).toBe(296); // ceil(264.58)=265 + 31
	});
});

describe('HTML 导出 TOC 与新骨架清理（D22，spec 2026-10-09）', () => {
	it('TOC 重建命中真实 DOM 形态：pinned 固化 + 锚点化 + resize handle 摘除', async () => {
		const out = await generateExportHtml(makeContainer(), true, 'a4', false, '测试');
		expect(out).toMatch(/toc-overlay-wrapper[^>]*is-pinned/);
		expect(out).toMatch(/<a href="#test" class="toc-link"/);
		expect(out).not.toMatch(/toc-resize-handle/);
		expect(out).toMatch(/toc-toggle-export/);
	});

	it('新骨架衍生物不入导出物：find-bar/top-fade-mask/toc-toggle-floating', async () => {
		const out = await generateExportHtml(makeContainer(), true, 'a4', false, '测试');
		expect(out).not.toMatch(/find-bar/);
		expect(out).not.toMatch(/top-fade-mask/);
		expect(out).not.toMatch(/toc-toggle-floating/);
	});

	it('viewer-pane 行内 flex 归一化（split 态不压扁导出正文）', async () => {
		const out = await generateExportHtml(makeContainer(), false, 'a4', false, '测试');
		expect(out).not.toMatch(/style="flex:\s*0\.5"/);
	});
});

describe('导出 lightbox 交互对齐应用内（D23，spec 2026-10-09）', () => {
	it('脚本含乘法滚轮缩放、光标锚定与拖拽平移', async () => {
		const out = await generateExportHtml(makeContainer(), false, 'a4', false, '测试');
		// D23 审查 I-1：deltaY 先钳 ±10 再 exp，对齐应用内 wheelZoomFactor（一格约 ±10%）
		expect(out).toMatch(/Math\.max\(-10, Math\.min\(10, e\.deltaY\)\)/);
		expect(out).toMatch(/Math\.exp\(-d \/ 100\)/);
		expect(out).toMatch(/MIN_ZOOM = 0\.1/);
		expect(out).toMatch(/MAX_ZOOM = 10/);
		expect(out).toMatch(/addEventListener\('mousedown'/);
		expect(out).toMatch(/lbPanX = cx - \(cx - lbPanX\) \* \(newZoom \/ lbZoom\)/);
		expect(out).toMatch(/translate\('/);
	});

	it('开图/切图重置视图且带 n / N 计数器', async () => {
		const out = await generateExportHtml(makeContainer(), false, 'a4', false, '测试');
		expect(out).toMatch(/lbResetView\(\);/);
		expect(out).toMatch(/lightbox-counter/);
		expect(out).toMatch(/' \/ '/);
	});

	it('键盘含 +/=/- 缩放与 r/f 重置', async () => {
		const out = await generateExportHtml(makeContainer(), false, 'a4', false, '测试');
		expect(out).toMatch(/e\.key === '\+' \|\| e\.key === '='/);
		expect(out).toMatch(/'r' \|\| e\.key === 'R'/);
	});
});

describe('宽表 breakout/fit 导出一致性（D24，spec 2026-10-09）', () => {
	it('导出 CSS 携带 container/breakout/fit 规则且 --measure 随 contentWidth', async () => {
		const out = await generateExportHtml(makeContainer(), false, 'a4', false, '测试', 1200);
		expect(out).toMatch(/\.viewer-content\s*\{[^}]*container-type:\s*inline-size/);
		expect(out).toMatch(/--measure:\s*min\(100cqi,\s*1200px\)/);
		expect(out).toMatch(/\.table-breakout table:not\(:is\(li, blockquote, td, th, details, \.markdown-alert, \.footnotes\) table\)/);
		expect(out).toMatch(/\.table-fit table :is\(td, th\)\s*\{\s*overflow-wrap:\s*anywhere/);
		expect(out).toMatch(/\.markdown-body\.full-width\s*\{[^}]*--measure:\s*100cqi/);
	});

	// 审查 C-1（fix round 1）：基础 table 模型必须与预览（src/styles.css
	// .markdown-body table）一致——breakout translate 的 -50% 基于表格自身盒宽，
	// width:100% 时盒宽恒为列宽，translate 恒得负值且 breakout 增宽永不生效。
	// 钉 CSS 文本不足以防语义回归（I-1），故四声明连序断言锁死模型形态。
	it('基础 table 模型对齐预览 max-content 盒宽（breakout 数学前提，审查 C-1/M-1）', async () => {
		const out = await generateExportHtml(makeContainer(), false, 'a4', false, '测试', 1200);
		expect(out).toMatch(
			/\.markdown-body table\s*\{[^}]*display:\s*block[^}]*width:\s*max-content[^}]*max-width:\s*100%[^}]*overflow-x:\s*auto/,
		);
		expect(out).toMatch(
			/\.markdown-body\.toc-in-gutter\s*\{[^}]*--breakout-inset:\s*calc\(var\(--toc-width,\s*0px\)\s*\+\s*var\(--gutter\)\)/, // M-1
		);
	});
});
