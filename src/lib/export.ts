import { save } from '@tauri-apps/plugin-dialog';
import { invoke } from '@tauri-apps/api/core';
import { settings } from './stores/settings.svelte.js';
import { i18n } from './i18n';

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
	
	// Remove interactive elements
	clone.querySelectorAll('.toc-sidebar, .toc-container, .editor-pane, .split-bar, .diagram-toggle-btn, .lang-label, .toc-toggle-floating').forEach(el => el.remove());
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
	const themeMode = document.documentElement.getAttribute('data-theme-mode') || 'light';
	const themeScheme = document.documentElement.getAttribute('data-theme-scheme') || 'github-light';
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

// Platform detection (cached)
let currentPlatform: 'windows' | 'macos' | 'linux' | 'unknown' = 'unknown';

/**
 * Detect current platform
 */
export async function detectPlatform(): Promise<'windows' | 'macos' | 'linux' | 'unknown'> {
	if (currentPlatform !== 'unknown') return currentPlatform;
	
	try {
		const ua = navigator.userAgent.toLowerCase();
		if (ua.includes('windows')) {
			currentPlatform = 'windows';
		} else if (ua.includes('mac')) {
			currentPlatform = 'macos';
		} else if (ua.includes('linux')) {
			currentPlatform = 'linux';
		}
	} catch {
		currentPlatform = 'unknown';
	}
	
	return currentPlatform;
}

/**
 * Get platform-specific print instructions
 */
export function getPrintInstructions(): string {
	const platform = currentPlatform;
	const t = i18n.getAll();
	
	switch (platform) {
		case 'windows':
			return t.printInstructionsWindows;
		case 'macos':
			return t.printInstructionsMacos;
		case 'linux':
			return t.printInstructionsLinux;
		default:
			return t.printInstructionsDefault;
	}
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
	return new Promise((resolve) => {
		try {
			const html = generateExportHtml(container, showToc, pageSize, true, title);
			
			const iframe = document.createElement('iframe');
			iframe.style.cssText = 'position:fixed;left:-9999px;top:-9999px;width:0;height:0;border:none;';
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
		} catch (e) {
			resolve({ success: false, message: `PDF export failed: ${e}` });
		}
	});
}

// Page size dimensions in mm
const PAGE_SIZES: Record<string, { width: number; height: number }> = {
	dynamic: { width: 210, height: 0 }, // Height will be calculated
	a4: { width: 210, height: 297 },
	a3: { width: 297, height: 420 },
	letter: { width: 215.9, height: 279.4 },
	legal: { width: 215.9, height: 355.6 },
};

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
 */
function getBaseStyles(theme: string): string {
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
	max-width: 900px;
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

.diagram-chart-layer {
	width: 100%;
}

.diagram-source-layer {
	display: none;
	width: 100%;
}

.diagram-wrapper.show-source .diagram-chart-layer {
	display: none;
}

.diagram-wrapper.show-source .diagram-source-layer {
	display: block;
}

.diagram-toggle-btn {
	position: absolute;
	top: 8px;
	right: 8px;
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
			transition: transform 0.15s ease;
		}
	.lightbox-content img,
	.lightbox-content svg {
		max-width: 95vw;
		max-height: 95vh;
		object-fit: contain;
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

/* Print styles */
@media print {
	.markdown-container {
		display: block;
	}
	
	.layout-container {
		display: flex;
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
}
`;
}

/**
 * Get print-specific CSS for PDF export
 */
function getPrintStyles(pageSize: PdfPageSize): string {
	const size = PAGE_SIZES[pageSize];
	
	if (pageSize === 'dynamic') {
		// Dynamic height will be set via JavaScript
		return `
@page {
	size: 210mm auto;
	margin: 15mm;
}

@media print {
	html, body {
		height: auto !important;
		overflow: visible !important;
	}
	
	.markdown-container {
		display: block;
	}
}
`;
	}

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
 * Calculate dynamic page height based on content
 */
function calculateDynamicHeight(container: HTMLElement): number {
	const contentHeight = container.scrollHeight;
	const pxToMm = contentHeight / 96 * 25.4; // 96 DPI
	return Math.ceil(pxToMm + 30); // Add margins
}

/**
 * Process diagrams for pagination
 */
function processDiagramsForPrint(container: HTMLElement, pageSize: PdfPageSize): void {
	if (pageSize === 'dynamic') return;

	const size = PAGE_SIZES[pageSize];
	const pageHeightMm = size.height - 30; // Subtract margins (15mm * 2)
	const pageHeightPx = pageHeightMm / 25.4 * 96; // Convert to pixels

	const diagrams = container.querySelectorAll('.diagram-wrapper');
	
	diagrams.forEach(diagram => {
		const el = diagram as HTMLElement;
		const height = el.scrollHeight;
		const ratio = height / pageHeightPx;

		if (ratio > 1) {
			// Large diagram: move to new page and scale
			el.classList.add('large-diagram');
			const scale = (pageHeightPx * 0.95) / height;
			el.style.transform = `scale(${scale})`;
			el.style.transformOrigin = 'top left';
			el.style.width = `${100 / scale}%`;
		} else if (ratio > 0.8) {
			// Medium diagram: scale slightly
			const scale = (pageHeightPx * 0.95) / height;
			if (scale < 1) {
				el.style.transform = `scale(${scale})`;
				el.style.transformOrigin = 'top left';
				el.style.width = `${100 / scale}%`;
			}
		}
	});
}

/**
 * Generate complete HTML for export
 */
export function generateExportHtml(
	container: HTMLElement,
	showToc: boolean,
	pageSize: PdfPageSize = 'dynamic',
	forPrint: boolean = false,
	title: string = 'Exported Document'
): string {
	// Clone the container
	const clone = container.cloneNode(true) as HTMLElement;

	// Remove interactive elements (but keep diagram-toggle-btn for HTML export)
	if (forPrint) {
		// For PDF: remove TOC sidebar, diagram toggle buttons, and other interactive elements
		clone.querySelectorAll('.toc-sidebar, .toc-container, .editor-pane, .split-bar, .diagram-toggle-btn, .lang-label, .toc-toggle-floating').forEach(el => el.remove());
	} else {
		// For HTML: keep diagram toggle buttons, remove other interactive elements
		clone.querySelectorAll('.editor-pane, .split-bar, .lang-label, .toc-toggle-floating').forEach(el => el.remove());
	}
	
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

	// Get current theme
	const themeMode = document.documentElement.getAttribute('data-theme-mode') || 'light';
	const themeScheme = document.documentElement.getAttribute('data-theme-scheme') || 'github-light';

	// Extract CSS variables
	const cssVariables = extractCssVariables();

	// Process diagrams for print
	if (forPrint && pageSize !== 'dynamic') {
		processDiagramsForPrint(clone, pageSize);
	}

	// Calculate dynamic height if needed
	let dynamicHeightStyle = '';
	if (forPrint && pageSize === 'dynamic') {
		const height = calculateDynamicHeight(clone);
		dynamicHeightStyle = `@page { size: 210mm ${height}mm; margin: 15mm; }`;
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

			// === Lightbox ===
			var lightboxItems = [];
			var lightboxOverlay = null;
			var currentLightboxIndex = -1;

			function createLightbox() {
				lightboxOverlay = document.createElement('div');
				lightboxOverlay.id = 'lightbox-overlay';
				lightboxOverlay.className = 'lightbox-overlay';
				lightboxOverlay.style.display = 'none';
				lightboxOverlay.innerHTML = '<div class="lightbox-content" id="lightbox-content"></div>'
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
				 lightboxOverlay.addEventListener('wheel', function(e) {
						e.preventDefault();
						var content = document.getElementById('lightbox-content');
						if (!content) return;
						var s = content.style.transform || '';
						var m = s.match(/scale\(([\d.]+)\)/);
						var scale = m ? parseFloat(m[1]) : 1;
						scale += (e.deltaY < 0 ? 0.15 : -0.15);
						scale = Math.max(0.2, Math.min(5, scale));
						content.style.transform = 'scale(' + scale + ')';
					}, { passive: false });
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
				lightboxOverlay.style.display = 'flex';
				document.getElementById('lightbox-prev').style.display = index > 0 ? 'flex' : 'none';
				document.getElementById('lightbox-next').style.display = index < lightboxItems.length - 1 ? 'flex' : 'none';
			}

			function closeLightbox() {
			if (lightboxOverlay) {
			 lightboxOverlay.style.display = 'none';
						var content = document.getElementById('lightbox-content');
						if (content) content.style.transform = '';
					}
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
				var img = wrapper.querySelector('img');
				var svg = wrapper.querySelector('[data-diagram-render="true"] svg');
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

			// Keyboard shortcuts
			document.addEventListener('keydown', function(e) {
				if (e.key === 'Escape') closeLightbox();
				if (lightboxOverlay && lightboxOverlay.style.display !== 'none') {
					if (e.key === 'ArrowLeft') navigateLightbox(-1);
					if (e.key === 'ArrowRight') navigateLightbox(1);
				}
			});
		})();
		</script>`;


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

${getBaseStyles(themeMode)}

${forPrint ? getPrintStyles(pageSize) : ''}

${dynamicHeightStyle}
	</style>
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
	defaultFileName: string
): Promise<boolean> {
	const filePath = await save({
		defaultPath: `${defaultFileName}.html`,
		filters: [{ name: 'HTML', extensions: ['html'] }],
	});

	if (!filePath) return false;

	const html = generateExportHtml(container, showToc, 'dynamic', false, defaultFileName);
	await invoke('save_file_content', { path: filePath, content: html });
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
			return exportAsPdf(container, showToc, 'dynamic', title);
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
	return new Promise((resolve) => {
		try {
			// Combine all pages into one HTML with page breaks
			const themeMode = document.documentElement.getAttribute('data-theme-mode') || 'light';
			const themeScheme = document.documentElement.getAttribute('data-theme-scheme') || 'github-light';
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
</head>
<body>
	<div class="markdown-container">
		<div class="layout-container">
			<div class="viewer-pane">
${pages.map((page, i) => {
	// Extract body content from each page HTML
	const bodyMatch = page.html.match(/<div class="markdown-body">([\s\S]*?)<\/div>\s*<\/div>\s*<\/div>\s*<\/div>/);
	const content = bodyMatch ? bodyMatch[1] : '';
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
			iframe.style.cssText = 'position:fixed;left:-9999px;top:-9999px;width:0;height:0;border:none;';
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
