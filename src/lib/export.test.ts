import { describe, it, expect } from 'vitest';
import { generateExportHtml, computeFitScale } from './export';

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
	it('问题1: .markdown-body 居中 (margin: 0 auto)，与程序内一致', () => {
		const out = generateExportHtml(makeContainer(), false, 'a4', false, '测试');
		expect(out).toMatch(/\.markdown-body\s*\{[^}]*\bmargin:\s*0\s+auto\b[^}]*\}/);
	});

	it('问题2: .markdown-body 长字符串换行 (overflow-wrap: break-word)，无行超宽', () => {
		const out = generateExportHtml(makeContainer(), false, 'a4', false, '测试');
		expect(out).toMatch(/\.markdown-body\s*\{[^}]*\boverflow-wrap:\s*break-word\b[^}]*\}/);
	});
});

describe('generateExportHtml: PDF 导出', () => {
	it('问题3a: PDF (forPrint) 移除 .toc-overlay-wrapper DOM 节点，不受目录栏影响', () => {
		const out = generateExportHtml(makeContainer(), true, 'a4', true, '测试');
		expect(out).not.toMatch(/class="[^"]*toc-overlay-wrapper/);
		expect(out).not.toMatch(/class="[^"]*toc-container/);
	});

	it('问题3b: PDF @media print 约束 pre 宽度，避免渲染内容超过 @page 只写左半栏', () => {
		const out = generateExportHtml(makeContainer(), true, 'a4', true, '测试');
		expect(out).toMatch(/pre[^{]*\{[^}]*max-width:\s*100%/);
	});
});

describe('默认页面大小 (已移除 dynamic)', () => {
	it('generateExportHtml 默认 pageSize 为 a4 (@page 210mm 297mm)', () => {
		// 不传 pageSize（第 3 参数），默认应为 a4
		const out = generateExportHtml(makeContainer(), true, undefined as any, true, '测试');
		expect(out).toMatch(/size:\s*210mm\s+297mm/);
	});
});

describe('computeFitScale: 按页面高度缩放决策 (用于 diagram/img/svg)', () => {
	it('ratio > 1 (超过一页): 缩放到一页的 95% 且强制起新页', () => {
		expect(computeFitScale(2)).toEqual({ scale: 0.95 / 2, newPage: true });
		expect(computeFitScale(1.5)).toEqual({ scale: 0.95 / 1.5, newPage: true });
	});

	it('ratio 0.8~1 且 scale<1 (接近一页): 略缩但不起新页', () => {
		// 0.97 → scale = 0.95/0.97 ≈ 0.979 < 1
		expect(computeFitScale(0.97)).toEqual({ scale: 0.95 / 0.97, newPage: false });
	});

	it('ratio <= 0.8 或 scale>=1: 无需缩放 (返回 null)', () => {
		expect(computeFitScale(0.5)).toBeNull();
		// 0.9 → scale = 0.95/0.9 ≈ 1.056 >= 1，不缩放
		expect(computeFitScale(0.9)).toBeNull();
	});
});
