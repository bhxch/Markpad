import { describe, it, expect, vi } from 'vitest';
import { generateExportHtml, computeFitScale, convertAssetImagesToDataUri } from './export';

// 构造一个接近真实结构的 .markdown-container：浮动目录栏 + 正文区。
function makeContainer(inner = ''): HTMLElement {
	const container = document.createElement('div');
	container.className = 'markdown-container';
	container.innerHTML = `
		<div class="layout-container">
			<div class="toc-overlay-wrapper is-pinned">
				<div class="toc-container">
					<div class="toc-header"></div>
					<div class="toc-list"><button class="toc-link" data-id="test">目录项</button></div>
				</div>
			</div>
			<div class="viewer-pane">
				<div class="viewer-content">
					<article class="markdown-body">
						<h1 id="test">测试标题</h1>
						<p>正文内容 https://example.com/a/very/long/unbreakable/path/that/should/wrap</p>
						${inner}
					</article>
				</div>
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
