import { describe, it, expect } from 'vitest';
import { generateExportHtml } from './export';

// 构造一个接近真实结构的 .markdown-container：浮动目录栏 + 正文区。
// generateExportHtml 会 clone 它并按 forPrint/showToc 清洗节点。
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

describe('generateExportHtml: HTML 导出布局', () => {
	// 问题1: 导出的正文应像程序内一样居中，而不是左对齐
	it('问题1: .markdown-body 居中 (margin: 0 auto)，与程序内一致', () => {
		const out = generateExportHtml(makeContainer(), false, 'dynamic', false, '测试');
		expect(
			out,
			'导出 HTML 的 .markdown-body 主规则应含 margin: 0 auto 以居中正文',
		).toMatch(/\.markdown-body\s*\{[^}]*\bmargin:\s*0\s+auto\b[^}]*\}/);
	});

	// 问题2: 导出的正文不应有行超出其他行的宽度
	it('问题2: .markdown-body 长字符串换行 (overflow-wrap: break-word)，无行超宽', () => {
		const out = generateExportHtml(makeContainer(), false, 'dynamic', false, '测试');
		expect(
			out,
			'导出 HTML 的 .markdown-body 应允许长字符串换行，避免单行突出',
		).toMatch(/\.markdown-body\s*\{[^}]*\boverflow-wrap:\s*break-word\b[^}]*\}/);
	});
});

describe('generateExportHtml: PDF 导出', () => {
	// 问题3a: PDF 不应受目录栏开合影响——目录栏节点必须移除
	it('问题3a: PDF (forPrint) 移除 .toc-overlay-wrapper DOM 节点，不受目录栏影响', () => {
		const out = generateExportHtml(makeContainer(), true, 'a4', true, '测试');
		// 目录栏 DOM 节点必须移除（无节点则不影响 PDF 布局）；
		// CSS 样式定义 (.toc-overlay-wrapper {...}) 保留无害，不计入。
		expect(out, '不应保留浮动目录栏 DOM 节点').not.toMatch(
			/class="[^"]*toc-overlay-wrapper/,
		);
		expect(out, '不应保留目录栏容器 DOM 节点').not.toMatch(
			/class="[^"]*toc-container/,
		);
	});

	// 问题3b: PDF 只渲染左半栏（右边 ~30% 消失）的根因是渲染内容超过 @page 宽度：
	// .markdown-body max-width:none + pre/table 等无宽度约束，固有宽度撑开超过页面被截断。
	// @media print 应约束内容元素宽度，使其不超出 @page。
	it('问题3b: PDF @media print 约束 pre 宽度，避免渲染内容超过 @page 只写左半栏', () => {
		const out = generateExportHtml(makeContainer(), true, 'a4', true, '测试');
		// pre 等内容元素在 PDF 的 @media print 中应约束宽度 (max-width:100%)，
		// 否则代码块/表格固有宽度超过 @page 可用宽度，右边被截断 (只渲染左半栏)。
		expect(
			out,
			'PDF 应让 pre max-width:100%，避免内容超过 @page 被截断',
		).toMatch(/pre[^{]*\{[^}]*max-width:\s*100%/);
	});
});
