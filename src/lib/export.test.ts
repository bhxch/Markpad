import { describe, it, expect } from 'vitest';
import { generateExportHtml, computeFitScale } from './export';

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

// 带真实 diagram 结构的 container（应用用 [data-diagram-render/code]，不是 chart/source-layer）
function makeContainerWithDiagram(): HTMLElement {
	return makeContainer(`
		<div class="diagram-wrapper">
			<button class="diagram-toggle-btn" type="button"></button>
			<div data-diagram-render="true"><svg></svg></div>
			<div data-diagram-code="true"><pre><code>graph TD</code></pre></div>
		</div>`);
}

describe('generateExportHtml: HTML 导出布局', () => {
	it('问题1: .markdown-body 居中 (margin: 0 auto)', () => {
		const out = generateExportHtml(makeContainer(), false, 'a4', false, '测试');
		expect(out).toMatch(/\.markdown-body\s*\{[^}]*\bmargin:\s*0\s+auto\b[^}]*\}/);
	});

	it('问题2: .markdown-body 长字符串换行 (overflow-wrap: break-word)', () => {
		const out = generateExportHtml(makeContainer(), false, 'a4', false, '测试');
		expect(out).toMatch(/\.markdown-body\s*\{[^}]*\boverflow-wrap:\s*break-word\b[^}]*\}/);
	});
});

describe('generateExportHtml: PDF 导出', () => {
	it('问题3a: PDF 移除 .toc-overlay-wrapper DOM 节点', () => {
		const out = generateExportHtml(makeContainer(), true, 'a4', true, '测试');
		expect(out).not.toMatch(/class="[^"]*toc-overlay-wrapper/);
		expect(out).not.toMatch(/class="[^"]*toc-container/);
	});

	it('问题3b: PDF @media print 约束 pre 宽度', () => {
		const out = generateExportHtml(makeContainer(), true, 'a4', true, '测试');
		expect(out).toMatch(/pre[^{]*\{[^}]*max-width:\s*100%/);
	});
});

describe('默认页面大小 (已移除 dynamic)', () => {
	it('generateExportHtml 默认 pageSize 为 a4', () => {
		const out = generateExportHtml(makeContainer(), true, undefined as any, true, '测试');
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
	// 根因：@media print 里 .layout-container { display: flex }，flex 容器打印分页支持差，
	// 导致整篇内容无法自动分页，PDF 只渲染一页。
	it('@media print 不再用 flex 布局 .layout-container（允许内容自动分页）', () => {
		const out = generateExportHtml(makeContainer(), true, 'a4', true, '测试');
		const flexLayoutCount = (out.match(/\.layout-container\s*\{[^}]*display:\s*flex/g) || []).length;
		// 屏幕样式（getBaseStyles 顶部）保留 1 处 flex 即可；@media print 应改为 block
		expect(flexLayoutCount, '@media print 的 .layout-container 不应是 flex').toBeLessThanOrEqual(1);
	});
});

describe('HTML 导出 diagram 切换按钮', () => {
	// 根因：应用 DOM 用 [data-diagram-render/code]，但导出 CSS 用 .diagram-chart-layer/.diagram-source-layer，
	// 选择器不匹配 → toggle .show-source 时 CSS 不切换 display → 按钮"无效"。
	it('diagram toggle CSS 选择器匹配实际 DOM ([data-diagram-render/code])，使 show-source 能切换显示', () => {
		const out = generateExportHtml(makeContainerWithDiagram(), false, 'a4', false, '测试');
		// show-source 时应隐藏 [data-diagram-render]（图表）、显示 [data-diagram-code]（源码）
		expect(out, '.show-source 应隐藏 [data-diagram-render]').toMatch(
			/show-source[^{]*data-diagram-render[^{]*\{[^}]*display:\s*none/,
		);
		expect(out, '.show-source 应显示 [data-diagram-code]').toMatch(
			/show-source[^{]*data-diagram-code[^{]*\{[^}]*display:\s*block/,
		);
	});
});
