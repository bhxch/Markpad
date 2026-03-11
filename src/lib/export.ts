import { save } from '@tauri-apps/plugin-dialog';
import { invoke } from '@tauri-apps/api/core';
import { settings } from './stores/settings.svelte.js';
import { i18n } from './i18n';

export type ExportFormat = 'html' | 'pdf';
export type PdfPageSize = 'dynamic' | 'a4' | 'a3' | 'letter' | 'legal';

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
 */
function getTreeSitterStyles(): string {
	return `
/* Tree-sitter Syntax Highlighting */
.ts-comment { color: var(--ts-comment, #6A9955); }
.ts-keyword { color: var(--ts-keyword, #569CD6); }
.ts-keyword\\.control { color: var(--ts-keyword-control, #C586C0); }
.ts-string { color: var(--ts-string, #CE9178); }
.ts-string\\.regexp { color: var(--ts-string-regexp, #D16969); }
.ts-number { color: var(--ts-number, #B5CEA8); }
.ts-constant { color: var(--ts-constant, #4FC1FF); }
.ts-constant\\.builtin { color: var(--ts-constant-builtin, #569CD6); }
.ts-boolean { color: var(--ts-boolean, #569CD6); }
.ts-type { color: var(--ts-type, #4EC9B0); }
.ts-type\\.builtin { color: var(--ts-type-builtin, #4EC9B0); }
.ts-function { color: var(--ts-function, #DCDCAA); }
.ts-method { color: var(--ts-method, #DCDCAA); }
.ts-macro { color: var(--ts-macro, #DCDCAA); }
.ts-variable { color: var(--ts-variable, #9CDCFE); }
.ts-variable\\.builtin { color: var(--ts-variable-builtin, #569CD6); }
.ts-parameter { color: var(--ts-parameter, #9CDCFE); }
.ts-property { color: var(--ts-property, #9CDCFE); }
.ts-operator { color: var(--ts-operator, #D4D4D4); }
.ts-punctuation { color: var(--ts-punctuation, #D4D4D4); }
.ts-bracket { color: var(--ts-bracket, #FFD700); }
.ts-constructor { color: var(--ts-constructor, #4EC9B0); }
.ts-namespace { color: var(--ts-namespace, #4EC9B0); }
.ts-tag { color: var(--ts-tag, #569CD6); }
.ts-attribute { color: var(--ts-attribute, #9CDCFE); }
.ts-special { color: var(--ts-special, #C586C0); }
.ts-escape { color: var(--ts-escape, #D7A635); }
`;
}

/**
 * Get the base CSS styles for export
 */
function getBaseStyles(): string {
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
}

.markdown-container {
	display: flex;
	min-height: 100vh;
}

.layout-container {
	display: flex;
	flex: 1;
	position: relative;
}

/* TOC Sidebar - fixed position with independent scrolling */
.toc-sidebar {
	width: 240px;
	flex-shrink: 0;
	border-right: 1px solid var(--color-border-default);
	background: var(--color-canvas-subtle);
	padding: 20px 0;
	position: sticky;
	top: 0;
	height: 100vh;
	overflow-y: auto;
	box-sizing: border-box;
}

.toc-title {
	font-size: 11px;
	font-weight: 600;
	color: var(--color-fg-muted);
	padding: 0 20px 12px;
	letter-spacing: 0.05em;
	text-transform: uppercase;
}

.toc-list {
	padding: 0 12px;
}

.toc-item {
	display: block;
	padding: 4px 8px;
	color: var(--color-fg-muted);
	text-decoration: none;
	font-size: 13px;
	border-radius: 4px;
	margin-bottom: 2px;
	cursor: pointer;
}

.toc-item:hover {
	background: var(--color-neutral-muted);
	color: var(--color-fg-default);
}

.toc-item.level-1 { padding-left: 8px; }
.toc-item.level-2 { padding-left: 20px; }
.toc-item.level-3 { padding-left: 32px; }
.toc-item.level-4 { padding-left: 44px; }

.viewer-pane {
	flex: 1;
	padding: 20px;
	overflow-x: auto;
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

${getTreeSitterStyles()}

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
		clone.querySelectorAll('.toc-sidebar, .editor-pane, .split-bar, .diagram-toggle-btn, .lang-label').forEach(el => el.remove());
	} else {
		// For HTML: keep diagram toggle buttons, remove other interactive elements
		clone.querySelectorAll('.editor-pane, .split-bar, .lang-label').forEach(el => el.remove());
	}
	
	// Remove event handlers
	clone.querySelectorAll('[onclick], [onmousedown], [onwheel]').forEach(el => {
		el.removeAttribute('onclick');
		el.removeAttribute('onmousedown');
		el.removeAttribute('onwheel');
	});

	// For HTML export: Fix TOC items to be proper anchor links
	if (!forPrint && showToc) {
		clone.querySelectorAll('.toc-item').forEach(item => {
			const tocItem = item as HTMLElement;
			const targetId = tocItem.getAttribute('data-target-id');
			if (targetId) {
				// Convert to anchor link
				const link = document.createElement('a');
				link.href = `#${targetId}`;
				link.className = tocItem.className;
				link.textContent = tocItem.textContent;
				link.setAttribute('data-target-id', targetId);
				tocItem.replaceWith(link);
			}
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

	// Add scripts for HTML export (TOC navigation + diagram toggle)
	const htmlScripts = forPrint ? '' : `
<script>
// TOC smooth scrolling
document.querySelectorAll('.toc-item, .toc-sidebar a[data-target-id]').forEach(item => {
	item.addEventListener('click', function(e) {
		e.preventDefault();
		const targetId = this.getAttribute('data-target-id') || this.getAttribute('href')?.substring(1);
		if (targetId) {
			const target = document.getElementById(targetId);
			if (target) {
				target.scrollIntoView({ behavior: 'smooth', block: 'start' });
				history.pushState(null, '', '#' + targetId);
			}
		}
	});
});

// Diagram toggle functionality
document.querySelectorAll('.diagram-toggle-btn').forEach(btn => {
	btn.addEventListener('click', function() {
		const wrapper = this.closest('.diagram-wrapper');
		if (wrapper) {
			wrapper.classList.toggle('show-source');
			const chartLayer = wrapper.querySelector('.diagram-chart-layer');
			const sourceLayer = wrapper.querySelector('.diagram-source-layer');
			if (chartLayer && sourceLayer) {
				if (wrapper.classList.contains('show-source')) {
					chartLayer.style.display = 'none';
					sourceLayer.style.display = 'block';
				} else {
					chartLayer.style.display = 'block';
					sourceLayer.style.display = 'none';
				}
			}
		}
	});
});
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

${getBaseStyles()}

${forPrint ? getPrintStyles(pageSize) : ''}

${dynamicHeightStyle}
	</style>
</head>
<body>
	${clone.outerHTML}
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
