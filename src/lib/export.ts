import { save } from '@tauri-apps/plugin-dialog';
import { invoke } from '@tauri-apps/api/core';
import { rewriteMarkdownHrefForExport } from './utils/exportHtml';
import { buildKatexExportStyles } from './utils/exportKatex.js'; // T1: 导出 KaTeX 样式内联

export type ExportFormat = 'html' | 'pdf';
export type PdfPageSize = 'dynamic' | 'a4' | 'a3' | 'letter' | 'legal';

// Page constants (in mm)
const A4_WIDTH = 210;
const A4_HEIGHT = 297;
const MARGIN = 15;
const USABLE_HEIGHT = A4_HEIGHT - MARGIN * 2; // ~267mm

// Element types that should not be split
const UNSPLITTABLE_TAGS = ['PRE', 'TABLE', 'FIGURE', 'SVG', 'IFRAME', 'IMG', 'VIDEO', 'CANVAS'];

/**
 * Represents a single page for PDF export
 */
export interface PdfPage {
	html: string;           // HTML content for this page
	height: number;         // Page height in mm (A4 or extended)
	width: number;          // Page width in mm (always A4)
}

/**
 * Result of pagination
 */
export interface PaginationResult {
	pages: PdfPage[];
	totalHeight: number;
}

/**
 * 多 tab 宿主剥离（Task 17 ⑨）：上游骨架在 .markdown-body 内为每个打开的 tab
 * 挂一个 .markdown-blocks 宿主（MarkdownViewer 的 previewHosts，块补丁绕过
 * Svelte 直接填充子节点；非活动 tab 仅 inline display:none 隐藏，内容仍挂载
 * 在 DOM）。克隆 .viewer-content 会把所有 tab 的正文一并带进导出物。这里只
 * 保留非 display:none 的活动宿主——那是 DOM 上唯一的活动判据（previewHosts
 * 是组件内部状态，export 层拿不到）；宿主唯一或判据不唯一（结构变动）时
 * 保守不动，等同旧行为。
 */
function stripInactiveTabHosts(clone: HTMLElement): void {
	const hosts = Array.from(clone.querySelectorAll<HTMLElement>('.markdown-blocks'));
	if (hosts.length <= 1) return;
	const active = hosts.filter((el) => el.style.display !== 'none');
	if (active.length !== 1) return;
	for (const el of hosts) {
		if (el !== active[0]) el.remove();
	}
}

/**
 * D22: 新上游骨架衍生物清理（容器改为 .layout-container 后首次进入克隆）与
 * split 态行内 flex 归一化——style:flex 会把导出件正文压扁。
 */
const EXPORT_CHROME_SELECTOR =
	'.top-fade-mask, .find-bar, .loading-chip, .preview-cursor-caret';

function stripViewerChrome(clone: HTMLElement): void {
	clone.querySelectorAll(EXPORT_CHROME_SELECTOR).forEach(el => el.remove());
	clone.querySelectorAll('.viewer-pane').forEach(el => (el as HTMLElement).removeAttribute('style'));
}

/**
 * Smart pagination algorithm
 * Splits content into pages, avoiding breaking unsplittable elements
 */
export function paginateContent(
	container: HTMLElement,
	showToc: boolean,
	title: string = 'Exported Document'
): PaginationResult {
	// Clone the container
	const clone = container.cloneNode(true) as HTMLElement;
	stripInactiveTabHosts(clone);
	stripViewerChrome(clone); // D22: 新骨架衍生物清理 + viewer-pane flex 归一化

	// Remove interactive elements
	clone.querySelectorAll('.toc-sidebar, .toc-container, .editor-pane, .split-bar, .diagram-toggle-btn, .lang-label, .toc-toggle-floating').forEach(el => el.remove());
	// frontmatter 面板（Task 14 ①）：viewer-content 克隆会带出预览的交互式
	// <details class="frontmatter-panel">（含 select/input 编辑件），导出物不需要它。
	clone.querySelectorAll('.frontmatter-panel').forEach(el => el.remove());
	clone.querySelectorAll('[onclick], [onmousedown], [onwheel]').forEach(el => {
		el.removeAttribute('onclick');
		el.removeAttribute('onmousedown');
		el.removeAttribute('onwheel');
	});
	
	// Get the markdown body
	const markdownBody = clone.querySelector('.markdown-body') as HTMLElement;
	if (!markdownBody) {
		return { pages: [], totalHeight: 0 };
	}
	
	// Get all direct children
	const elements = Array.from(markdownBody.children) as HTMLElement[];
	
	// Calculate page height in pixels (for measurement)
	// Assuming 96 DPI: 1mm ≈ 3.78px
	const pxPerMm = 96 / 25.4;
	const usableHeightPx = USABLE_HEIGHT * pxPerMm;
	const marginPx = MARGIN * pxPerMm;
	
	// Get theme info
	const { mode: themeMode, scheme: themeScheme } = readExportTheme();
	const cssVariables = extractCssVariables();
	
	// Paginate elements
	const pages: PdfPage[] = [];
	let currentPageElements: HTMLElement[] = [];
	let currentPageHeight = 0;
	
	for (const element of elements) {
		// Clone element for measurement
		const measureEl = element.cloneNode(true) as HTMLElement;
		
		// Create temporary container for measurement
		const measureContainer = document.createElement('div');
		measureContainer.style.cssText = `
			position: absolute;
			visibility: hidden;
			width: ${A4_WIDTH - MARGIN * 2}mm;
			font-size: 16px;
			line-height: 1.6;
		`;
		measureContainer.appendChild(measureEl);
		document.body.appendChild(measureContainer);
		
		const elementHeight = measureEl.offsetHeight;
		const elementHeightMm = elementHeight / pxPerMm;
		
		document.body.removeChild(measureContainer);
		
		// Check if element is a heading (prefer starting new page before heading)
		const isHeading = /^H[1-6]$/.test(element.tagName);
		
		// Check if element is unsplittable
		const isUnsplittable = UNSPLITTABLE_TAGS.includes(element.tagName) || 
			element.querySelector(UNSPLITTABLE_TAGS.join(',')) !== null;
		
		// Decision: should we start a new page?
		const wouldExceedHeight = currentPageHeight + elementHeightMm > USABLE_HEIGHT;
		const shouldStartNewPage = (wouldExceedHeight && currentPageElements.length > 0) ||
			(isHeading && currentPageHeight > USABLE_HEIGHT * 0.7);
		
		if (shouldStartNewPage) {
			// Finalize current page
			if (currentPageElements.length > 0) {
				const pageHeight = Math.max(A4_HEIGHT, currentPageHeight + MARGIN * 2);
				pages.push(createPage(currentPageElements, pageHeight, themeMode, themeScheme, cssVariables, title, showToc));
			}
			currentPageElements = [];
			currentPageHeight = 0;
		}
		
		// Add element to current page
		currentPageElements.push(element.cloneNode(true) as HTMLElement);
		currentPageHeight += elementHeightMm;
		
		// If single element exceeds A4 height, create an extended page
		if (isUnsplittable && elementHeightMm > USABLE_HEIGHT) {
			// This element needs an extended page
			const extendedHeight = elementHeightMm + MARGIN * 2;
			pages.push(createPage([element.cloneNode(true) as HTMLElement], extendedHeight, themeMode, themeScheme, cssVariables, title, showToc));
			currentPageElements = [];
			currentPageHeight = 0;
		}
	}
	
	// Finalize last page
	if (currentPageElements.length > 0) {
		const pageHeight = Math.max(A4_HEIGHT, currentPageHeight + MARGIN * 2);
		pages.push(createPage(currentPageElements, pageHeight, themeMode, themeScheme, cssVariables, title, showToc));
	}
	
	// Calculate total height
	const totalHeight = pages.reduce((sum, p) => sum + p.height, 0);
	
	return { pages, totalHeight };
}

/**
 * Create a single page HTML
 */
function createPage(
	elements: HTMLElement[],
	height: number,
	themeMode: string,
	themeScheme: string,
	cssVariables: string,
	title: string,
	showToc: boolean
): PdfPage {
	const contentHtml = elements.map(el => el.outerHTML).join('\n');
	
	const html = `<!DOCTYPE html>
<html lang="zh-CN" data-theme-mode="${themeMode}" data-theme-scheme="${themeScheme}">
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<title>${title}</title>
	<style>
:root {
${cssVariables}
}

${getBaseStyles(themeMode)}

@page {
	size: ${A4_WIDTH}mm ${height}mm;
	margin: ${MARGIN}mm;
}

@media print {
	html, body {
		height: auto !important;
		overflow: visible !important;
		margin: 0;
		padding: 0;
	}
	
	.markdown-container {
		display: block;
	}
	
	.markdown-body {
		max-width: none;
		padding: 0;
	}
	
	pre, table, figure, img, svg {
		break-inside: avoid;
	}
}
	</style>
</head>
<body>
	<div class="markdown-container">
		<div class="layout-container">
			<div class="viewer-pane">
				<div class="markdown-body">
${contentHtml}
				</div>
			</div>
		</div>
	</div>
</body>
</html>`;

	return {
		html,
		height,
		width: A4_WIDTH
	};
}

/**
 * Export as PDF using browser print dialog
 */
export async function exportAsPdf(
	container: HTMLElement,
	showToc: boolean,
	pageSize: PdfPageSize,
	title: string = 'Exported Document'
): Promise<{ success: boolean; message: string }> {
	let html: string;
	try {
		html = await generateExportHtml(container, showToc, pageSize, true, title);
	} catch (e) {
		return { success: false, message: `PDF export failed: ${e}` };
	}

	return new Promise((resolve) => {
		try {
			const iframe = document.createElement('iframe');
			iframe.style.cssText = 'position:fixed;left:-9999px;top:-9999px;width:210mm;height:auto;border:none;';
			document.body.appendChild(iframe);

			const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
			if (!iframeDoc) {
				document.body.removeChild(iframe);
				resolve({ success: false, message: 'Failed to create print document' });
				return;
			}

			iframeDoc.open();
			iframeDoc.write(html);
			iframeDoc.close();

			// D21: dynamic 单页在已挂载、宽 210mm 的 iframe 内实测内容高度后注入
			// 精确 @page 页高再打印——这是 92baf54 删除 dynamic 时缺失的一环
			// （当时在脱离 DOM 的克隆上测量，scrollHeight 恒 0）。
			const applyDynamicPageHeight = () => {
				if (pageSize !== 'dynamic') return;
				try {
					const px = iframeDoc.documentElement?.scrollHeight || 0;
					if (!px) return;
					const style = iframeDoc.createElement('style');
					style.id = 'dynamic-page-size';
					style.textContent = `@page { size: 210mm ${dynamicPageHeightMm(px)}mm; margin: 15mm; }`;
					iframeDoc.head.appendChild(style);
				} catch {
					// 测量失败维持 210mm auto 占位，至少不阻塞打印
				}
			};

			const doPrint = () => {
				setTimeout(() => {
					try {
						iframe.contentWindow?.focus();
						iframe.contentWindow?.print();
						resolve({ success: true, message: 'Print dialog opened' });
					} catch (e) {
						resolve({ success: false, message: `Print failed: ${e}` });
					}

					setTimeout(() => {
						document.body.removeChild(iframe);
					}, 1000);
				}, 500);
			};

			if (pageSize === 'dynamic') {
				// load + 双 rAF：等图片/字体/布局就绪再测高；write 关闭后 readyState
				// 可能已 complete，此时直接走 rAF。
				const afterLoad = () => {
					const win = iframe.contentWindow;
					win?.requestAnimationFrame(() =>
						win.requestAnimationFrame(() => {
							applyDynamicPageHeight();
							doPrint();
						})
					);
				};
				if (iframeDoc.readyState === 'complete') afterLoad();
				else iframe.addEventListener('load', afterLoad, { once: true });
			} else {
				doPrint();
			}
		} catch (e) {
			resolve({ success: false, message: `PDF export failed: ${e}` });
		}
	});
}

// Page size dimensions in mm
const PAGE_SIZES: Record<string, { width: number; height: number }> = {
	// D21: 动态单页——高度占位 0，exportAsPdf 在挂载的打印 iframe 内实测内容后注入精确页高。
	// 恢复 92baf54 误删的原始默认选项（2026-03-04 设计"单页（动态高度）"）；
	// 当年"实测无法生效"的根因是在脱离 DOM 的克隆上读 scrollHeight（恒 0）。
	dynamic: { width: 210, height: 0 },
	a4: { width: 210, height: 297 },
	a3: { width: 297, height: 420 },
	letter: { width: 215.9, height: 279.4 },
	legal: { width: 215.9, height: 355.6 },
};

/**
 * 主题属性双兼容（spec §7.2）：合并后两套主题属性并存——本地体系写
 * `data-theme-mode`/`data-theme-scheme`（settings.applyTheme），上游体系写
 * `data-theme`（app.html 启动脚本）。导出模板优先读本地属性；缺失时回落
 * `data-theme`，值含 "dark" 判为暗色。三处读点（分页/单页导出/多页合并）共用。
 */
function readExportTheme(): { mode: string; scheme: string } {
	const root = document.documentElement;
	// Minor2：vscode UI 主题激活时 applyTheme 不设 data-theme-scheme（T7 特异性
	// 修复的前提），scheme 兜底 'vscode' 保真导出 html 元数据；视觉不受影响——
	// cssVariables 取自活 DOM。非 vscode 的缺 scheme 场景维持 github-light 旧行为。
	const scheme = root.getAttribute('data-theme-scheme');
	return {
		mode:
			root.getAttribute('data-theme-mode') ||
			(root.getAttribute('data-theme')?.includes('dark') ? 'dark' : 'light'),
		scheme: scheme || (root.getAttribute('data-theme') === 'vscode' ? 'vscode' : 'github-light'),
	};
}

/**
 * Extract CSS variables from computed styles
 */
function extractCssVariables(): string {
	const root = document.documentElement;
	const computedStyle = getComputedStyle(root);
	const variables: string[] = [];

	// Get all CSS variable names from stylesheets
	const varNames = new Set<string>();
	for (const sheet of document.styleSheets) {
		try {
			for (const rule of sheet.cssRules) {
				const text = rule.cssText;
				const matches = text.match(/--[a-zA-Z0-9-]+/g);
				if (matches) {
					matches.forEach(v => varNames.add(v));
				}
			}
		} catch {
			// Cross-origin stylesheet, skip
		}
	}

	// Get values for each variable
	varNames.forEach(varName => {
		const value = computedStyle.getPropertyValue(varName);
		if (value) {
			variables.push(`  ${varName}: ${value};`);
		}
	});

	return variables.join('\n');
}

/**
 * Get tree-sitter syntax highlighting CSS
 * Colors adapt based on current theme mode
 */
function getTreeSitterStyles(theme: string): string {
	const dark = theme === 'dark';
	return `
	/* Tree-sitter Syntax Highlighting */
.ts-comment, .ts-comment-line, .ts-comment-block, .ts-comment-doc { color: ${dark ? '#6A9955' : '#008000'}; font-style: italic; }
.ts-keyword { color: ${dark ? '#569CD6' : '#0000FF'}; }
.ts-keyword-control, .ts-keyword-conditional, .ts-keyword-repeat, .ts-keyword-import, .ts-keyword-return, .ts-keyword-exception, .ts-keyword-function, .ts-keyword-storage, .ts-keyword-operator { color: ${dark ? '#C586C0' : '#AF00DB'}; }
.ts-string { color: ${dark ? '#CE9178' : '#A31515'}; }
.ts-string-regexp { color: ${dark ? '#D16969' : '#811F3F'}; }
.ts-string-special, .ts-string-path, .ts-string-url, .ts-string-symbol, .ts-char { color: ${dark ? '#CE9178' : '#A31515'}; }
.ts-number, .ts-integer, .ts-float { color: ${dark ? '#B5CEA8' : '#098658'}; }
.ts-constant { color: ${dark ? '#4FC1FF' : '#0070C1'}; }
.ts-constant-builtin, .ts-boolean { color: ${dark ? '#569CD6' : '#0000FF'}; }
.ts-type, .ts-constructor, .ts-namespace { color: ${dark ? '#4EC9B0' : '#267F99'}; }
.ts-type-builtin, .ts-enum-variant { color: ${dark ? '#4EC9B0' : '#267F99'}; }
.ts-function, .ts-function-builtin, .ts-method, .ts-macro, .ts-function-special { color: ${dark ? '#DCDCAA' : '#795E26'}; }
.ts-variable, .ts-label { color: ${dark ? '#9CDCFE' : '#001080'}; }
.ts-variable-builtin { color: ${dark ? '#569CD6' : '#0000FF'}; }
.ts-parameter, .ts-member, .ts-property { color: ${dark ? '#9CDCFE' : '#001080'}; }
.ts-operator { color: ${dark ? '#D4D4D4' : '#000000'}; }
.ts-punctuation, .ts-delimiter { color: ${dark ? '#D4D4D4' : '#000000'}; }
.ts-bracket { color: ${dark ? '#FFD700' : '#000000'}; }
.ts-punctuation-special { color: ${dark ? '#D4D4D4' : '#000000'}; }
.ts-tag { color: ${dark ? '#569CD6' : '#800000'}; }
.ts-attribute { color: ${dark ? '#9CDCFE' : '#FF0000'}; }
.ts-special { color: ${dark ? '#C586C0' : '#AF00DB'}; }
.ts-escape { color: ${dark ? '#D7A635' : '#EE0000'}; }
.ts-tag-error { color: ${dark ? '#F44747' : '#F44747'}; }
.ts-default { color: ${dark ? '#D4D4D4' : '#1F2328'}; }
`;
}

/**
 * Get the base CSS styles for export
 *
 * contentWidth：正文 .markdown-body 的 max-width（px）。上游 #467：导出宽度
 * 不应写死 900px，而应与预览宽度设置同源；缺省回退 900px 保持纯函数向后兼容
 * （PDF 通路 @media print 以 max-width: none 覆盖，不受此值影响）。
 */
function getBaseStyles(theme: string, contentWidth: number = 900): string {
	return `
/* Base styles */
* {
	box-sizing: border-box;
}

html, body {
margin: 0;
padding: 0;
background-color: var(--color-canvas-default);
color: var(--color-fg-default);
font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
line-height: 1.6;
 height: 100vh;
		overflow: hidden;
	}

.markdown-container {
display: flex;
height: 100vh;
}

.layout-container {
display: flex;
flex: 1;
position: relative;
 height: 100%;
		overflow: hidden;
	}

/* TOC Container */
.toc-container {
width: 240px;
flex-shrink: 0;
display: flex;
flex-direction: column;
overflow: hidden;
 height: 100%;
	}

.toc-header {
	display: flex;
	justify-content: flex-end;
	gap: 4px;
	padding: 10px 14px;
}

.toc-list {
margin: 0;
padding: 0 0 16px;
list-style: none;
overflow-y: auto;
 flex: 1;
	}

.toc-item {
	padding: 1px 0;
}

.toc-link-wrapper {
	display: flex;
	align-items: center;
}

.toc-link {
	display: block;
	width: 100%;
	text-align: left;
	background: none;
	border: none;
	padding: 3px 16px 3px 4px;
	color: #656d76;
	font-size: 13px;
	cursor: pointer;
	text-decoration: none;
	white-space: nowrap;
	overflow: hidden;
	text-overflow: ellipsis;
	font-family: inherit;
}

.toc-link:hover {
	color: #24292f;
}

.toc-link.active {
	color: #24292f;
	font-weight: 500;
}

.level-1 .toc-link { font-weight: 500; font-size: 13px; }
.level-3 .toc-link { font-size: 12.5px; }
.level-4 .toc-link { font-size: 12px; opacity: 0.9; }

.viewer-pane {
flex: 1;
padding: 20px;
overflow-x: auto;
 height: 100%;
		overflow-y: hidden;
	}

	.viewer-content {
		height: 100%;
		overflow-y: auto;
	}

.markdown-body {
	font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
	font-size: 16px;
	line-height: 1.6;
	color: var(--color-fg-default);
	max-width: ${contentWidth}px;
	margin: 0 auto;
	overflow-wrap: break-word;
}

.markdown-body > *:first-child {
	margin-top: 0 !important;
}

.markdown-body > *:last-child {
	margin-bottom: 0 !important;
}

.markdown-body h1, .markdown-body h2, .markdown-body h3,
.markdown-body h4, .markdown-body h5, .markdown-body h6 {
	margin-top: 24px;
	margin-bottom: 16px;
	font-weight: 600;
	line-height: 1.25;
	color: var(--color-fg-default);
}

.markdown-body h1 { font-size: 2em; border-bottom: 1px solid var(--color-border-muted); padding-bottom: .3em; }
.markdown-body h2 { font-size: 1.5em; border-bottom: 1px solid var(--color-border-muted); padding-bottom: .3em; }
.markdown-body h3 { font-size: 1.25em; }
.markdown-body h4 { font-size: 1em; }
.markdown-body h5 { font-size: .875em; }
.markdown-body h6 { font-size: .85em; color: var(--color-fg-muted); }

.markdown-body p {
	margin: 0 0 16px;
}

.markdown-body a {
	color: var(--color-accent-fg);
	text-decoration: none;
}

.markdown-body a:hover {
	text-decoration: underline;
}

.markdown-body ul, .markdown-body ol {
	margin: 0 0 16px;
	padding-left: 2em;
}

.markdown-body li {
	margin: 0.25em 0;
}

.markdown-body blockquote {
	margin: 0 0 16px;
	padding: 0 1em;
	color: var(--color-fg-muted);
	border-left: 0.25em solid var(--color-border-default);
}

.markdown-body code {
	padding: 0.2em 0.4em;
	margin: 0;
	font-size: 85%;
	background: var(--color-canvas-subtle);
	border-radius: 6px;
	font-family: ui-monospace, SFMono-Regular, SF Mono, Menlo, Consolas, monospace;
}

.markdown-body pre {
	padding: 16px;
	overflow: auto;
	font-size: 85%;
	line-height: 1.45;
	background: var(--hljs-bg, var(--color-canvas-subtle));
	border-radius: 6px;
	margin: 0 0 16px;
	position: relative;
}

.markdown-body pre code {
	background: transparent;
	padding: 0;
	font-size: 100%;
}

.markdown-body img {
	max-width: 100%;
	box-sizing: content-box;
	background-color: var(--color-canvas-default);
}

.markdown-body table {
	border-spacing: 0;
	border-collapse: collapse;
	margin: 0 0 16px;
	width: 100%;
	overflow: auto;
}

.markdown-body table th, .markdown-body table td {
	padding: 6px 13px;
	border: 1px solid var(--color-border-default);
}

.markdown-body table tr {
	background-color: var(--color-canvas-default);
	border-top: 1px solid var(--color-border-muted);
}

.markdown-body table tr:nth-child(2n) {
	background-color: var(--color-canvas-subtle);
}

.markdown-body table th {
	font-weight: 600;
}

.markdown-body hr {
	height: 0.25em;
	padding: 0;
	margin: 24px 0;
	background-color: var(--color-border-default);
	border: 0;
}

/* Code highlighting - hljs */
.hljs-comment, .hljs-quote { color: var(--hljs-comment, #8b949e); }
.hljs-keyword, .hljs-selector-tag { color: var(--hljs-keyword, #ff7b72); }
.hljs-string, .hljs-attr { color: var(--hljs-string, #a5d6ff); }
.hljs-title, .hljs-section { color: var(--hljs-title, #d2a8ff); }
.hljs-variable, .hljs-template-variable { color: var(--hljs-variable, #ffa657); }
.hljs-type, .hljs-class { color: var(--hljs-type, #ff7b72); }
.hljs-number { color: var(--hljs-number, #79c0ff); }
.hljs-literal { color: var(--hljs-literal, #79c0ff); }
.hljs-built_in { color: var(--hljs-built_in, #ffa657); }
.hljs-symbol { color: var(--hljs-symbol, #ffa657); }
.hljs-bullet { color: var(--hljs-bullet, #79c0ff); }
.hljs-link { color: var(--hljs-link, #a5d6ff); text-decoration: underline; }
.hljs-meta { color: var(--hljs-meta, #79c0ff); }
.hljs-deletion { background: #ffdce0; }
.hljs-addition { background: #cdffd8; }

${getTreeSitterStyles(theme)}

/* Diagram styles */
.diagram-wrapper {
	margin: 1.5em 0;
	text-align: center;
}

.diagram-wrapper svg {
	max-width: 100%;
	height: auto;
}

.diagram-wrapper pre {
	text-align: left;
}

.lang-label {
	position: absolute;
	top: 8px;
	right: 8px;
	font-size: 11px;
	color: var(--color-fg-muted);
	background: var(--color-canvas-default);
	padding: 2px 8px;
	border-radius: 4px;
	border: 1px solid var(--color-border-default);
}

/* Diagram Wrapper & Toggle Button */
.diagram-wrapper {
	margin: 1.5em 0;
	position: relative;
}

.diagram-wrapper pre {
	margin: 0 !important;
	padding: 16px;
	background: var(--hljs-bg, var(--color-canvas-subtle));
	border: 1px solid var(--color-border-default);
	border-radius: 6px;
	overflow-x: auto;
}

.diagram-wrapper svg {
	max-width: 100%;
	height: auto;
}

[data-diagram-render="true"] {
	width: 100%;
}

[data-diagram-code="true"] {
	display: none;
	width: 100%;
}

.diagram-wrapper.show-source [data-diagram-render="true"] {
	display: none;
}

.diagram-wrapper.show-source [data-diagram-code="true"] {
	display: block;
}

.diagram-toggle-btn {
	position: absolute;
	top: 8px;
	right: 8px;
	z-index: 10; /* T2: 切 code 后 pre(position:relative) 按 DOM 序绘制，无此层按钮被盖住无法切回 */
	width: 28px;
	height: 28px;
	background-color: var(--color-canvas-default);
	border: 1px solid var(--color-border-default);
	border-radius: 4px;
	color: var(--color-fg-muted);
	display: flex;
	align-items: center;
	justify-content: center;
	cursor: pointer;
	opacity: 0;
	transition: opacity 0.2s, background-color 0.1s;
}

.diagram-wrapper:hover .diagram-toggle-btn {
	opacity: 0.6;
}

.diagram-toggle-btn:hover {
	opacity: 1 !important;
	background-color: var(--color-canvas-subtle);
	color: var(--color-fg-default);
}


	/* Diagram default display states (for JS toggle) */
	[data-diagram-render="true"] { display: block; }
	[data-diagram-code="true"] { display: none; }

	/* Export: TOC sidebar positioning */
	.toc-overlay-wrapper {
		position: relative !important;
		flex-shrink: 0;
		width: 240px;
		height: 100%;
		overflow: hidden;
		background: var(--color-canvas-subtle, #f6f8fa);
		padding-top: 0 !important;
		transition: width 0.25s ease, opacity 0.25s ease;
	}
	.toc-overlay-wrapper:not(.on-right) {
		order: -1;
		border-right: 1px solid var(--color-border-default);
		border-left: none !important;
	}
	.toc-overlay-wrapper.on-right {
		order: 1;
		border-left: 1px solid var(--color-border-default);
		border-right: none !important;
	}
	.toc-overlay-wrapper .toc-container {
		height: 100%;
	}
	.toc-overlay-wrapper .toc-list {
		flex: 1;
		overflow-y: auto;
		min-height: 0;
	}
	.toc-overlay-wrapper.toc-hidden {
		width: 0;
		opacity: 0;
		overflow: hidden;
		border: none !important;
		padding: 0;
	}

	/* Export: TOC toggle button (show when sidebar hidden) */
	.toc-toggle-export {
		position: fixed;
		top: 50%;
		transform: translateY(-50%);
		width: 24px;
		height: 48px;
		background: var(--color-canvas-overlay, var(--color-canvas-default));
		border: 1px solid var(--color-border-default);
		border-radius: 0 6px 6px 0;
		cursor: pointer;
		display: none;
		align-items: center;
		justify-content: center;
		z-index: 100;
		color: var(--color-fg-muted);
		opacity: 0.7;
		transition: opacity 0.2s;
		left: 0;
	}
	.toc-toggle-export:hover { opacity: 1; }
	.toc-toggle-export.visible { display: flex; }
	.toc-toggle-export.on-right {
		left: auto;
		right: 0;
		border-radius: 6px 0 0 6px;
	}
	.toc-toggle-export svg { transition: transform 0.2s; }

	/* Export: TOC fold button */
		.toc-fold-btn {
			background: none;
			border: none;
			padding: 2px;
			cursor: pointer;
			opacity: 0;
			color: var(--color-fg-muted);
			display: flex;
			align-items: center;
			justify-content: center;
			transition: transform 0.2s ease, opacity 0.2s ease;
			border-radius: 4px;
			flex-shrink: 0;
			width: 20px;
			height: 20px;
			box-sizing: border-box;
		}
		.toc-item:hover > .toc-fold-btn,
		.toc-fold-btn.collapsed { opacity: 0.6; }
		.toc-fold-btn:hover { opacity: 1 !important; }
		.toc-fold-btn.collapsed { transform: rotate(-90deg); }

		/* Export: Image lightbox button */
	.img-lightbox-btn {
		position: absolute;
		top: 8px;
		right: 44px;
		width: 28px;
		height: 28px;
		background-color: var(--color-canvas-default);
		border: 1px solid var(--color-border-default);
		border-radius: 4px;
		color: var(--color-fg-muted);
		display: flex;
		align-items: center;
		justify-content: center;
		cursor: pointer;
		opacity: 0;
		transition: opacity 0.2s, background-color 0.1s;
		z-index: 10;
	}
	.img-lightbox-wrapper:hover .img-lightbox-btn,
	.diagram-wrapper:hover .img-lightbox-btn { opacity: 0.6; }
	.img-lightbox-btn:hover {
		opacity: 1 !important;
		background-color: var(--color-canvas-subtle);
		color: var(--color-fg-default);
	}

	/* Export: Lightbox overlay */
	.lightbox-overlay {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.85);
		z-index: 10000;
		display: flex;
		align-items: center;
		justify-content: center;
	}
	.lightbox-content {
	max-width: 95vw;
	max-height: 95vh;
	display: flex;
	align-items: center;
	justify-content: center;
	 background: var(--color-canvas-default, #fff);
			border-radius: 8px;
			padding: 12px;
			box-shadow: 0 8px 32px rgba(0,0,0,0.4);
			overflow: hidden;
			transform-origin: center center;
			/* D23: 拖拽/缩放交互态（对齐 ZoomOverlay）；连续滚轮/拖拽下 transition 造成滞后故移除 */
			cursor: grab;
			user-select: none;
		}
	.lightbox-content.lb-dragging { cursor: grabbing; }
		.lightbox-content img {
			max-width: 95vw;
			max-height: 95vh;
			object-fit: contain;
		}
		.lightbox-content svg {
			max-width: 95vw;
			max-height: 95vh;
			object-fit: contain;
			background: var(--color-canvas-default, #fff);
			border-radius: 4px;
			padding: 8px;
		}
	.lightbox-close {
		position: absolute;
		top: 16px;
		right: 16px;
		width: 36px;
		height: 36px;
		background: rgba(255, 255, 255, 0.15);
		border: none;
		border-radius: 50%;
		color: white;
		font-size: 20px;
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 10001;
		transition: background 0.2s;
	}
	.lightbox-close:hover { background: rgba(255, 255, 255, 0.3); }
	.lightbox-nav {
		position: absolute;
		top: 50%;
		transform: translateY(-50%);
		width: 40px;
		height: 40px;
		background: rgba(255, 255, 255, 0.15);
		border: none;
		border-radius: 50%;
		color: white;
		font-size: 24px;
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 10001;
		transition: background 0.2s;
	}
	.lightbox-nav:hover { background: rgba(255, 255, 255, 0.3); }
	.lightbox-prev { left: 16px; }
	.lightbox-next { right: 16px; }
	.lightbox-counter {
		position: absolute;
		bottom: 16px;
		left: 50%;
		transform: translateX(-50%);
		color: rgba(255,255,255,0.85);
		background: rgba(0,0,0,0.45);
		border-radius: 12px;
		padding: 4px 12px;
		font-size: 13px;
		z-index: 10001;
		pointer-events: none;
	}

/* Print styles */
@media print {
	html, body {
		height: auto !important;
		overflow: visible !important;
	}

	.markdown-container {
		display: block;
	}
	
	.layout-container {
		display: block;
	}
	
	.toc-sidebar {
		position: relative;
		height: auto;
		overflow: visible;
		break-after: page;
	}
	
	.viewer-pane {
		overflow: visible;
	}
	
	.markdown-body {
		max-width: none;
	}
	
	.diagram-wrapper,
	.diagram-wrapper svg,
	pre,
	img,
	table {
		break-inside: avoid;
	}

	pre, table, img, .markdown-body svg {
		max-width: 100%;
	}

	.markdown-body pre {
		white-space: pre-wrap;
		word-break: break-word;
	}
}
`;
}

/**
 * Get print-specific CSS for PDF export
 */
function getPrintStyles(pageSize: PdfPageSize): string {
	// D21: dynamic 占位样式；最终精确页高由 exportAsPdf 实测后以补充 <style> 覆盖。
	if (pageSize === 'dynamic') {
		return `
@page {
	size: 210mm auto;
	margin: 15mm;
}

@media print {
	html, body { height: auto !important; overflow: visible !important; }
	.markdown-container { display: block; }
	.layout-container { display: block; }
}
`;
	}
	const size = PAGE_SIZES[pageSize];
	
	return `
@page {
	size: ${size.width}mm ${size.height}mm;
	margin: 15mm;
}

@media print {
	.diagram-wrapper {
		break-inside: avoid;
		page-break-inside: avoid;
	}
	
	.diagram-wrapper.large-diagram {
		break-before: page;
		page-break-before: always;
	}
}
`;
}

/**
 * Decide whether an element (diagram/img/svg) should be scaled to fit a page,
 * based on the ratio of its height to the page's usable height.
 *
 * ratio = elementHeight / pageUsableHeight
 * - ratio > 1: taller than a page → scale to 95% of a page, start a new page
 * - 0.8 < ratio (and resulting scale < 1): nearly a page → scale down slightly
 * - otherwise: null (no scaling needed)
 */
export function computeFitScale(ratio: number): { scale: number; newPage: boolean } | null {
	if (ratio > 1) {
		return { scale: 0.95 / ratio, newPage: true };
	}
	if (ratio > 0.8) {
		const scale = 0.95 / ratio;
		if (scale < 1) {
			return { scale, newPage: false };
		}
	}
	return null;
}

/**
 * D21: dynamic 单页页高估算——打印布局像素 → mm（96DPI），加 30mm 上下边距
 * 与 1mm 防截断缓冲。exportAsPdf 以 iframe 实测 scrollHeight 调用。
 */
export function dynamicPageHeightMm(contentPx: number): number {
	return Math.ceil((contentPx * 25.4) / 96) + 30 + 1;
}

/**
 * Convert asset:// images to data URIs so exported HTML works in external browsers.
 * asset:// is a Tauri webview-only protocol; external browsers can't load it.
 */
export async function convertAssetImagesToDataUri(container: HTMLElement): Promise<void> {
	// Windows（与 Android）上 convertFileSrc 产出 http(s)://asset.localhost/<path>，
	// 其余平台是 asset://localhost/<path>——只认 asset: 前缀会漏掉 Windows 的全部
	// 本地图片（吸收上游 utils/exportHtml.ts isAssetUrl 的同款判定）。主机边界锚定，
	// 避免误吞 https://asset.localhost.example 这类恰好同名前缀的外链。
	const assetHostPattern = /^https?:\/\/asset\.localhost(?:\/|$)/i;
	const imgs = Array.from(container.querySelectorAll('img')).filter(img => {
		const src = img.getAttribute('src') || '';
		return src.startsWith('asset:') || assetHostPattern.test(src);
	});
	await Promise.all(
		imgs.map(async (img) => {
			const src = img.getAttribute('src') || '';
			try {
				const resp = await fetch(src);
				const blob = await resp.blob();
				const buf = await blob.arrayBuffer();
				const bytes = new Uint8Array(buf);
				let binary = '';
				for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
				const base64 = btoa(binary);
				const mime = blob.type || 'image/png';
				img.setAttribute('src', `data:${mime};base64,${base64}`);
			} catch {
				// conversion failed (not in webview / fetch error); keep original src
			}
		}),
	);
}

/**
 * Process diagrams for pagination
 */
function processDiagramsForPrint(container: HTMLElement, pageSize: PdfPageSize): void {
	const size = PAGE_SIZES[pageSize];
	const pageHeightMm = size.height - 30; // Subtract margins (15mm * 2)
	const pageHeightPx = pageHeightMm / 25.4 * 96; // Convert to pixels

	// Collect targets: diagram wrappers, plus inline img/svg that are NOT inside
	// a diagram-wrapper (those are already handled via the wrapper).
	const targets: HTMLElement[] = [];
	container.querySelectorAll('.diagram-wrapper').forEach(el => targets.push(el as HTMLElement));
	container.querySelectorAll('.markdown-body img, .markdown-body svg').forEach(el => {
		if (el.closest('.diagram-wrapper')) return;
		targets.push(el as HTMLElement);
	});

	targets.forEach(el => {
		const height = el.scrollHeight;
		if (!height) return;
		const fit = computeFitScale(height / pageHeightPx);
		if (!fit) return;

		if (fit.newPage) {
			el.classList.add('large-diagram');
		}
		el.style.transform = `scale(${fit.scale})`;
		el.style.transformOrigin = 'top left';
		el.style.width = `${100 / fit.scale}%`;
	});
}

/**
 * Generate complete HTML for export
 */
export async function generateExportHtml(
	container: HTMLElement,
	showToc: boolean,
	pageSize: PdfPageSize = 'a4',
	forPrint: boolean = false,
	title: string = 'Exported Document',
	contentWidth: number = 900
): Promise<string> {
	// Clone the container
	const clone = container.cloneNode(true) as HTMLElement;
	stripInactiveTabHosts(clone);
	stripViewerChrome(clone); // D22: 新骨架衍生物清理 + viewer-pane flex 归一化

	// Remove interactive elements (but keep diagram-toggle-btn for HTML export)
	if (forPrint) {
		// For PDF: remove TOC sidebar, diagram toggle buttons, and other interactive elements
		// （.toc-resize-handle 是上游新增的拖拽手柄，位于 .toc-overlay-wrapper 内；运行时它
		// 随容器外的 wrapper 不会入克隆，列在此处是防 DOM 结构变动的兜底。）
		clone.querySelectorAll('.toc-sidebar, .toc-container, .toc-overlay-wrapper, .toc-resize-handle, .editor-pane, .split-bar, .diagram-toggle-btn, .lang-label, .toc-toggle-floating').forEach(el => el.remove());
	} else {
		// For HTML: keep diagram toggle buttons, remove other interactive elements
		clone.querySelectorAll('.editor-pane, .split-bar, .lang-label, .toc-toggle-floating, .toc-resize-handle').forEach(el => el.remove());
	}
	// frontmatter 面板（Task 14 ①）：两个分支都移除——克隆自 .viewer-content，内含
	// 预览的交互式 frontmatter 面板（select/input 编辑件），不属于导出文档。
	clone.querySelectorAll('.frontmatter-panel').forEach(el => el.remove());
	
	// Remove event handlers
	clone.querySelectorAll('[onclick], [onmousedown], [onwheel]').forEach(el => {
		el.removeAttribute('onclick');
		el.removeAttribute('onmousedown');
		el.removeAttribute('onwheel');
	});

		// For HTML export: Fix TOC for standalone HTML
		if (!forPrint && showToc) {
			// Ensure TOC wrapper acts as pinned sidebar
			clone.querySelectorAll('.toc-overlay-wrapper').forEach(el => {
				const wrapper = el as HTMLElement;
				wrapper.classList.add('is-pinned');
				// 上游新增的悬浮/拖拽态类对静态导出无意义：is-overhanging 的样式以
				// :not(.is-pinned) 规避、is-resizing 只在拖拽中存在，摘掉保证 pinned
				// 侧栏形态唯一。
				wrapper.classList.remove('is-overhanging', 'is-resizing');
				wrapper.style.cssText = '';
			});

			// Rebuild TOC header with export-friendly buttons
			clone.querySelectorAll('.toc-header').forEach(header => {
				const h = header as HTMLElement;
				h.innerHTML = '';
				h.style.cssText = 'display:flex;justify-content:flex-end;gap:4px;padding:10px 14px;flex-shrink:0;';

				const switchBtn = document.createElement('button');
				switchBtn.className = 'toc-header-btn';
				switchBtn.setAttribute('data-action', 'switch-side');
				switchBtn.title = 'Switch Side';
				switchBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m18 8 4 4-4 4"></path><path d="M2 12h20"></path><path d="m6 8-4 4 4 4"></path></svg>';
				switchBtn.style.cssText = 'background:none;border:none;padding:6px;cursor:pointer;color:var(--color-fg-muted);opacity:0.7;border-radius:4px;display:flex;align-items:center;justify-content:center;';
				h.appendChild(switchBtn);

				const hideBtn = document.createElement('button');
				hideBtn.className = 'toc-header-btn';
				hideBtn.setAttribute('data-action', 'hide');
				hideBtn.title = 'Hide TOC';
				hideBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"></path><path d="m6 6 12 12"></path></svg>';
				hideBtn.style.cssText = 'background:none;border:none;padding:6px;cursor:pointer;color:var(--color-fg-muted);opacity:0.7;border-radius:4px;display:flex;align-items:center;justify-content:center;';
				h.appendChild(hideBtn);
			});

			// Convert TOC link buttons to anchor links
			clone.querySelectorAll('.toc-link').forEach(item => {
				const tocItem = item as HTMLElement;
				const targetId = tocItem.getAttribute('data-id');
				if (targetId) {
					const link = document.createElement('a');
					link.href = `#${targetId}`;
					link.className = tocItem.className;
					link.textContent = tocItem.textContent;
					link.setAttribute('data-id', targetId);
					tocItem.replaceWith(link);
				}
			});
		}

		// For HTML export: remove !important inline display styles from diagrams so JS toggle works
		if (!forPrint) {
			clone.querySelectorAll('[data-diagram-render="true"]').forEach(el => {
				(el as HTMLElement).style.removeProperty('display');
			});
			clone.querySelectorAll('[data-diagram-code="true"]').forEach(el => {
				(el as HTMLElement).style.removeProperty('display');
			});
			clone.querySelectorAll('[data-diagram-render]').forEach(el => {
				(el as HTMLElement).style.removeProperty('pointer-events');
			});
		}

	// Ensure headings have proper IDs for TOC links
	clone.querySelectorAll('.markdown-body h1, .markdown-body h2, .markdown-body h3, .markdown-body h4, .markdown-body h5, .markdown-body h6').forEach(heading => {
		const h = heading as HTMLElement;
		if (!h.id) {
			// Generate ID from text content
			const text = h.textContent?.trim() || '';
			const id = text.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '-').replace(/^-|-$/g, '');
			h.id = id;
		}
	});

	// .md→.html 链接改写（吸收上游 utils/exportHtml.ts 的 rewriteMarkdownHrefForExport，
	// 白名单 §7.2-6）：导出物只含本文档，指向邻居 .md/.markdown/… 的相对链接在导出
	// 目录里没有对应文件，改写为 .html（保留 query/hash；带 scheme 的外链与 mailto
	// 等不动）。纯输出侧的 href 重写，直接复用上游函数。
	clone.querySelectorAll('a[href]').forEach(link => {
		const href = link.getAttribute('href');
		if (!href) return;
		link.setAttribute('href', rewriteMarkdownHrefForExport(href));
	});

	// Get current theme
	const { mode: themeMode, scheme: themeScheme } = readExportTheme();

	// Extract CSS variables
	const cssVariables = extractCssVariables();

	// Process diagrams/img/svg for print (scale to fit page)
	// D21: dynamic 单页页高自适应内容，无需按页缩放/换页。
	if (forPrint && pageSize !== 'dynamic') {
		processDiagramsForPrint(clone, pageSize);
	}

		// Add scripts for HTML export
		const tocToggleHtml = (!forPrint && showToc) ? `
		<button class="toc-toggle-export" data-action="show" title="Show TOC">
			<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>
		</button>` : '';

		const htmlScripts = forPrint ? '' : `
		<script>
		(function() {
			// === TOC: Toggle visibility ===
			var tocSidebar = document.querySelector('.toc-overlay-wrapper');
			var tocToggle = document.querySelector('.toc-toggle-export');

			function hideToc() {
				if (tocSidebar) tocSidebar.classList.add('toc-hidden');
				if (tocToggle) {
					tocToggle.classList.add('visible');
					if (tocSidebar && tocSidebar.classList.contains('on-right')) {
						tocToggle.classList.add('on-right');
					} else {
						tocToggle.classList.remove('on-right');
					}
				}
			}
			function showToc() {
				if (tocSidebar) tocSidebar.classList.remove('toc-hidden');
				if (tocToggle) tocToggle.classList.remove('visible');
			}

			// TOC header button clicks
			document.querySelectorAll('.toc-header-btn').forEach(function(btn) {
				btn.addEventListener('click', function() {
					var action = this.getAttribute('data-action');
					if (action === 'hide') hideToc();
					else if (action === 'switch-side' && tocSidebar) {
						tocSidebar.classList.toggle('on-right');
						if (tocToggle && tocSidebar.classList.contains('toc-hidden')) {
							tocToggle.classList.toggle('on-right');
						}
					}
				});
			});

			// Show button click
			if (tocToggle) {
				tocToggle.addEventListener('click', showToc);
			}

			// === TOC: Smooth scrolling ===
			document.querySelectorAll('.toc-link, .toc-container a[data-id]').forEach(function(item) {
				item.addEventListener('click', function(e) {
					e.preventDefault();
					var targetId = this.getAttribute('data-id') || (this.getAttribute('href') || '').substring(1);
					if (targetId) {
						var target = document.getElementById(targetId);
						if (target) {
							var viewer = document.querySelector('.viewer-content');
							if (viewer) {
								viewer.scrollTo({ top: target.offsetTop - 20, behavior: 'smooth' });
							}
							history.pushState(null, '', '#' + targetId);
							document.querySelectorAll('.toc-link.active, a.toc-link.active').forEach(function(el) {
								el.classList.remove('active');
							});
							this.classList.add('active');
						}
					}
				});
			});

			// === TOC: Active tracking on scroll ===
			var viewerContent = document.querySelector('.viewer-content');
			if (viewerContent) {
				viewerContent.addEventListener('scroll', function() {
					var scrollTop = viewerContent.scrollTop;
					var activeId = null;
					document.querySelectorAll('.toc-link, a[data-id]').forEach(function(link) {
						var id = link.getAttribute('data-id') || (link.getAttribute('href') || '').substring(1);
						if (id) {
							var el = document.getElementById(id);
							if (el && el.offsetTop - scrollTop < 150) activeId = id;
						}
					});
					document.querySelectorAll('.toc-link, a[data-id]').forEach(function(link) {
						var id = link.getAttribute('data-id') || (link.getAttribute('href') || '').substring(1);
						if (id === activeId) link.classList.add('active');
						else link.classList.remove('active');
					});
				});
			}

			// === TOC: Fold/unfold ===
			document.querySelectorAll('.toc-fold-btn').forEach(function(btn) {
				btn.addEventListener('click', function() {
					var li = this.closest('.toc-item');
					if (!li) return;
					var match = li.className.match(/level-(\\d+)/);
					if (!match) return;
					var level = parseInt(match[1]);
					var collapsed = this.classList.toggle('collapsed');
					var sibling = li.nextElementSibling;
					while (sibling && sibling.classList.contains('toc-item')) {
						var sm = sibling.className.match(/level-(\\d+)/);
						if (!sm) break;
						if (parseInt(sm[1]) <= level) break;
						sibling.style.display = collapsed ? 'none' : '';
						sibling = sibling.nextElementSibling;
					}
				});
			});

			// === Diagram toggle ===
			document.querySelectorAll('.diagram-toggle-btn').forEach(function(btn) {
			btn.addEventListener('click', function() {
			var wrapper = this.closest('.diagram-wrapper');
			if (!wrapper) return;
			var isSource = wrapper.classList.toggle('show-source');
			if (isSource) {
			 this.title = 'Show Diagram';
			 this.innerHTML = '<svg style="pointer-events:none" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg>';
			} else {
			this.title = 'Show Source';
			this.innerHTML = '<svg style="pointer-events:none" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 18 22 12 16 6"></polyline><polyline points="8 6 2 12 8 18"></polyline></svg>';
			}
			});
			});

			// === Lightbox（D23: 对齐应用内 ZoomOverlay——乘法滚轮+光标锚定+拖拽平移） ===
			var MIN_ZOOM = 0.1;
			var MAX_ZOOM = 10;
			var ZOOM_STEP = 0.15;
			var lightboxItems = [];
			var lightboxOverlay = null;
			var currentLightboxIndex = -1;
			var lbZoom = 1, lbPanX = 0, lbPanY = 0;
			var lbDragging = false, lbStartX = 0, lbStartY = 0;

			function lbApply() {
				var content = document.getElementById('lightbox-content');
				if (!content) return;
				content.style.transform = 'translate(' + lbPanX + 'px,' + lbPanY + 'px) scale(' + lbZoom + ')';
				content.style.cursor = lbDragging ? 'grabbing' : 'grab';
				content.classList.toggle('lb-dragging', lbDragging);
			}
			function lbResetView() {
				lbZoom = 1; lbPanX = 0; lbPanY = 0;
				lbApply();
			}

			function createLightbox() {
				lightboxOverlay = document.createElement('div');
				lightboxOverlay.id = 'lightbox-overlay';
				lightboxOverlay.className = 'lightbox-overlay';
				lightboxOverlay.style.display = 'none';
				lightboxOverlay.innerHTML = '<div class="lightbox-content" id="lightbox-content"></div>'
					+ '<div class="lightbox-counter" id="lightbox-counter"></div>'
					+ '<button class="lightbox-close" id="lightbox-close">\u00d7</button>'
					+ '<button class="lightbox-nav lightbox-prev" id="lightbox-prev">\u2039</button>'
					+ '<button class="lightbox-nav lightbox-next" id="lightbox-next">\u203a</button>';
				document.body.appendChild(lightboxOverlay);

				document.getElementById('lightbox-close').addEventListener('click', closeLightbox);
				document.getElementById('lightbox-prev').addEventListener('click', function() { navigateLightbox(-1); });
				document.getElementById('lightbox-next').addEventListener('click', function() { navigateLightbox(1); });
				lightboxOverlay.addEventListener('click', function(e) {
					if (e.target === lightboxOverlay) closeLightbox();
				});
				// D23: 乘法滚轮缩放（delta 感应）+ 光标锚定，对齐 ZoomOverlay.handleWheel
				lightboxOverlay.addEventListener('wheel', function(e) {
					e.preventDefault();
					if (!document.getElementById('lightbox-content')) return;
					var newZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, lbZoom * Math.exp(-e.deltaY / 100)));
					var rect = lightboxOverlay.getBoundingClientRect();
					var cx = e.clientX - rect.left - rect.width / 2;
					var cy = e.clientY - rect.top - rect.height / 2;
					lbPanX = cx - (cx - lbPanX) * (newZoom / lbZoom);
					lbPanY = cy - (cy - lbPanY) * (newZoom / lbZoom);
					lbZoom = newZoom;
					lbApply();
				}, { passive: false });
				// D23: 左键拖拽平移（导航/关闭按钮除外），对齐 ZoomOverlay.handleMouseDown/Move/Up
				lightboxOverlay.addEventListener('mousedown', function(e) {
					if (e.button !== 0) return;
					if (e.target.closest && e.target.closest('.lightbox-close, .lightbox-nav')) return;
					lbDragging = true;
					lbStartX = e.clientX - lbPanX;
					lbStartY = e.clientY - lbPanY;
					lbApply();
					e.preventDefault();
				});
				document.addEventListener('mousemove', function(e) {
					if (!lbDragging) return;
					lbPanX = e.clientX - lbStartX;
					lbPanY = e.clientY - lbStartY;
					lbApply();
				});
				document.addEventListener('mouseup', function() {
					if (!lbDragging) return;
					lbDragging = false;
					lbApply();
				});
			}

			function showLightbox(index) {
				if (!lightboxOverlay) createLightbox();
				var item = lightboxItems[index];
				if (!item) return;
				currentLightboxIndex = index;
				var content = document.getElementById('lightbox-content');
				if (item.type === 'img') {
					content.innerHTML = '<img src="' + item.src + '" style="max-width:95vw;max-height:95vh;object-fit:contain;">';
				} else if (item.type === 'svg') {
					content.innerHTML = item.html;
				}
				lbResetView(); // D23: 开图/切图重置视图（对齐应用内 navigateTo→resetView）
				var counter = document.getElementById('lightbox-counter');
				if (counter) counter.textContent = (index + 1) + ' / ' + lightboxItems.length;
				lightboxOverlay.style.display = 'flex';
				document.getElementById('lightbox-prev').style.display = index > 0 ? 'flex' : 'none';
				document.getElementById('lightbox-next').style.display = index < lightboxItems.length - 1 ? 'flex' : 'none';
			}

			function closeLightbox() {
				if (lightboxOverlay) lightboxOverlay.style.display = 'none';
				currentLightboxIndex = -1;
			}

			function navigateLightbox(delta) {
				var next = currentLightboxIndex + delta;
				if (next >= 0 && next < lightboxItems.length) showLightbox(next);
			}

				// Collect lightbox items
				document.querySelectorAll('.img-lightbox-btn').forEach(function(btn) {
					var wrapper = btn.closest('.img-lightbox-wrapper') || btn.closest('.diagram-wrapper');
					if (!wrapper) return;
					var renderEl = wrapper.querySelector('[data-diagram-render="true"]');
					var svg = renderEl ? renderEl.querySelector('svg') : null;
					var img = renderEl ? renderEl.querySelector('img') : null;
					if (!svg && !img) {
						img = wrapper.querySelector('img');
					}
					lightboxItems.push({
						type: img ? 'img' : 'svg',
						src: img ? (img.getAttribute('src') || '') : null,
						html: svg ? svg.outerHTML : null
					});
					var itemIndex = lightboxItems.length - 1;
					btn.addEventListener('click', function(e) {
						e.stopPropagation();
						e.preventDefault();
						showLightbox(itemIndex);
					});
				});

			// Keyboard shortcuts（D23: 补 +/-/= 缩放与 r/f 重置，对齐应用内键位）
			document.addEventListener('keydown', function(e) {
				var open = lightboxOverlay && lightboxOverlay.style.display !== 'none';
				if (e.key === 'Escape') { closeLightbox(); return; }
				if (!open) return;
				if (e.key === 'ArrowLeft') navigateLightbox(-1);
				else if (e.key === 'ArrowRight') navigateLightbox(1);
				else if (e.key === '+' || e.key === '=') { lbZoom = Math.min(MAX_ZOOM, lbZoom * (1 + ZOOM_STEP)); lbApply(); }
				else if (e.key === '-') { lbZoom = Math.max(MIN_ZOOM, lbZoom * (1 - ZOOM_STEP)); lbApply(); }
				else if (e.key === 'r' || e.key === 'R' || e.key === 'f' || e.key === 'F') lbResetView();
				else return;
				e.preventDefault();
			});
		})();
		</script>`;


	// HTML export: convert asset:// images to data URIs (external browsers can't load asset://)
	if (!forPrint) {
		await convertAssetImagesToDataUri(clone);
	}

	// T1: 含公式的文档内联 KaTeX 样式与字体子集（HTML 与单页 PDF 共用本模板）
	const katexStyles = await buildKatexExportStyles(clone);

	// Build HTML
	const html = `<!DOCTYPE html>
<html lang="zh-CN" data-theme-mode="${themeMode}" data-theme-scheme="${themeScheme}">
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<title>${title}</title>
	<style>
:root {
${cssVariables}
}

${getBaseStyles(themeMode, contentWidth)}

${forPrint ? getPrintStyles(pageSize) : ''}
	</style>
	${katexStyles}
</head>
<body>
		${clone.outerHTML}
		${tocToggleHtml}
		${htmlScripts}
	</body>
</html>`;

	return html;
}

/**
 * Export as HTML file
 */
export async function exportAsHtml(
	container: HTMLElement,
	showToc: boolean,
	defaultFileName: string,
	contentWidth: number = 900
): Promise<boolean> {
	const filePath = await save({
		defaultPath: `${defaultFileName}.html`,
		filters: [{ name: 'HTML', extensions: ['html'] }],
	});

	if (!filePath) return false;

	const html = await generateExportHtml(container, showToc, 'a4', false, defaultFileName, contentWidth);
	// save_file_content 的 encoding 为三参必填（见 src-tauri/src/commands.rs），
	// 缺 key 在 Tauri v2 反序列化阶段确定性报错，导出保存必败。
	await invoke('save_file_content', { path: filePath, content: html, encoding: 'UTF-8' });
	return true;
}

/**
 * Export as PDF with smart pagination
 * Uses browser print dialog with CSS @page for custom page sizes
 * 
 * Note: The browser print dialog will appear, but the page size
 * is set via CSS @page which is respected by the print output.
 */
export async function exportAsPdfPaginated(
	container: HTMLElement,
	showToc: boolean,
	title: string = 'Exported Document'
): Promise<{ success: boolean; message: string }> {
	try {
		// 1. Paginate content
		const { pages, totalHeight } = paginateContent(container, showToc, title);
		
		if (pages.length === 0) {
			return { success: false, message: 'No content to export' };
		}
		
		// 2. For single page, generate directly with dynamic height
		if (pages.length === 1) {
			return exportAsPdf(container, showToc, 'a4', title);
		}
		
		// 3. For multiple pages, we need to either:
		// a) Print each page separately (user will see multiple print dialogs)
		// b) Generate a single HTML with page breaks
		// 
		// Option (b) is more user-friendly, but requires all pages to be same size
		// Option (a) allows different page heights but more user interaction
		//
		// For now, use option (b) with A4 pages and page breaks
		return exportMultiPagePdf(pages, title);
		
	} catch (e) {
		console.error('PDF export failed:', e);
		return { success: false, message: `PDF export failed: ${e}` };
	}
}

/**
 * Export multiple pages as PDF with page breaks
 */
async function exportMultiPagePdf(
	pages: PdfPage[],
	title: string
): Promise<{ success: boolean; message: string }> {
	// T1: 各页正文合并为临时根元素，KaTeX 样式只算一次注入分页模板 head
	const pageContents = pages.map(page => {
		// Extract body content from each page HTML
		const bodyMatch = page.html.match(/<div class="markdown-body">([\s\S]*?)<\/div>\s*<\/div>\s*<\/div>\s*<\/div>/);
		return bodyMatch ? bodyMatch[1] : '';
	});
	const mergedRoot = document.createElement('div');
	mergedRoot.innerHTML = pageContents.join('\n');
	const katexStyles = await buildKatexExportStyles(mergedRoot);

	return new Promise((resolve) => {
		try {
			// Combine all pages into one HTML with page breaks
			const { mode: themeMode, scheme: themeScheme } = readExportTheme();
			const cssVariables = extractCssVariables();
			
			// Calculate max height for consistency
			const maxHeight = Math.max(...pages.map(p => p.height));
			
			const combinedHtml = `<!DOCTYPE html>
<html lang="zh-CN" data-theme-mode="${themeMode}" data-theme-scheme="${themeScheme}">
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<title>${title}</title>
	<style>
:root {
${cssVariables}
}

${getBaseStyles(themeMode)}

@page {
	size: ${A4_WIDTH}mm ${maxHeight}mm;
	margin: ${MARGIN}mm;
}

@media print {
	.page-break {
		break-before: page;
		page-break-before: always;
	}
	
	html, body {
		height: auto !important;
		overflow: visible !important;
		margin: 0;
		padding: 0;
	}
	
	.markdown-container {
		display: block;
	}
	
	.markdown-body {
		max-width: none;
		padding: 0;
	}
	
	pre, table, figure, img, svg {
		break-inside: avoid;
	}
}
	</style>
	${katexStyles}
</head>
<body>
	<div class="markdown-container">
		<div class="layout-container">
			<div class="viewer-pane">
${pages.map((page, i) => {
	const content = pageContents[i];
	const pageBreakClass = i > 0 ? ' page-break' : '';
	return `				<div class="markdown-body${pageBreakClass}">
${content}
				</div>`;
}).join('\n')}
			</div>
		</div>
	</div>
</body>
</html>`;
			
			// Create hidden iframe for printing
			const iframe = document.createElement('iframe');
			iframe.style.cssText = 'position:fixed;left:-9999px;top:-9999px;width:210mm;height:auto;border:none;';
			document.body.appendChild(iframe);
			
			const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
			if (!iframeDoc) {
				document.body.removeChild(iframe);
				resolve({ success: false, message: 'Failed to create print document' });
				return;
			}
			
			iframeDoc.open();
			iframeDoc.write(combinedHtml);
			iframeDoc.close();
			
			setTimeout(() => {
				try {
					iframe.contentWindow?.focus();
					iframe.contentWindow?.print();
					resolve({ success: true, message: 'Print dialog opened for multi-page PDF' });
				} catch (e) {
					resolve({ success: false, message: `Print failed: ${e}` });
				}
				
				setTimeout(() => {
					document.body.removeChild(iframe);
				}, 1000);
			}, 500);
		} catch (e) {
			resolve({ success: false, message: `PDF export failed: ${e}` });
		}
	});
}
