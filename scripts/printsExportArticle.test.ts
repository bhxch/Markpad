import assert from 'node:assert/strict';
import test from 'node:test';

import { offsetOf, readSource, sliceBetween } from './sourceTree.js';

const styles = readSource('src/styles.css');
const viewer = readSource('src/lib/MarkdownViewer.svelte');
const exporter = readSource('src/lib/utils/export.ts');

/** The `@media print` block only — not everything that follows it in the file. */
function extractPrintBlock(source: string): string {
	const start = offsetOf(source, '@media print {');
	let depth = 0;
	for (let i = offsetOf(source, '{', start); i < source.length; i += 1) {
		if (source[i] === '{') depth += 1;
		else if (source[i] === '}') {
			depth -= 1;
			if (depth === 0) return source.slice(start, i + 1);
		}
	}
	throw new Error('unterminated @media print block');
}

const printBlock = extractPrintBlock(styles);
const pdfExport = sliceBetween(exporter, 'export async function exportAsPdf', '\nasync function waitForImages');

test('a PDF is rendered from the document, not from the window', () => {
	// `window.print()` over the live window made the paper whatever was on
	// screen, and every new part of the interface had to be subtracted back out
	// in the print sheet. Fifteen issues over five months were that list missing
	// an entry (#668). The article is built the way the HTML export builds it.
	assert.match(pdfExport, /await buildExportArticle\(/);
	assert.match(pdfExport, /ctx\.printRoot\.replaceChildren\(\.\.\.Array\.from\(article\.root\.childNodes\)\)/);
});

test('the article is taken down when printing ends, not when the command returns', () => {
	// `print_pdf` opens the platform print sheet and returns while it is still
	// up. Clearing the article at that point races the sheet for the page it is
	// about to render, and losing that race prints nothing at all.
	assert.match(pdfExport, /addEventListener\('afterprint', \(\) => ctx\.printRoot\.replaceChildren\(\), \{ once: true \}\)/);
	assert.doesNotMatch(pdfExport, /\} finally \{/);
	// A platform that never sends the event leaves it mounted, so the next
	// export has to start from empty rather than print the last document.
	const reset = offsetOf(pdfExport, 'ctx.printRoot.replaceChildren();');
	assert.ok(reset < offsetOf(pdfExport, 'await buildExportArticle('), 'the reset happens before the new article is built');
});

test('the document is on the page before the print command runs', () => {
	// An image that has not decoded prints as an empty box, which is the
	// failure that looks most like a successful export.
	const wait = offsetOf(pdfExport, 'waitForImages(ctx.printRoot)');
	assert.ok(wait < offsetOf(pdfExport, "invoke('print_pdf')"), 'images decode before the native print');
	assert.ok(wait < offsetOf(pdfExport, "invoke('export_pdf_windows'"), 'and before the Windows PDF writer');
	// An unreachable image must not hold the export open for ever.
	const waitHelper = sliceBetween(exporter, 'async function waitForImages', '\n}');
	assert.match(waitHelper, /setTimeout\(resolve, IMAGE_LOAD_TIMEOUT_MS\)/);
});

test('the print sheet reveals the article and hides everything else', () => {
	// `#app` is `display: contents`, so the app's markup and the print article
	// are siblings. Hiding by structure rather than by name is what keeps a
	// part of the interface added tomorrow off the page.
	assert.match(printBlock, /#app > :not\(#print-root\)\s*\{[^}]*display:\s*none\s*!important;/);
	assert.match(printBlock, /body > :not\(#app\)\s*\{[^}]*display:\s*none\s*!important;/);
	assert.match(printBlock, /#print-root\s*\{[^}]*display:\s*block\s*!important;/);
	// And it is not in the way on screen.
	assert.match(styles.slice(offsetOf(styles, '\n#print-root {')), /#print-root \{\n\tdisplay: none;/);
});

test('the print sheet names no part of the interface', () => {
	// The regression this change exists to prevent: one selector per app part,
	// growing by one every time a part is added, and silently wrong until
	// someone finds their find-bar highlights in a PDF.
	for (const selector of [
		'.custom-title-bar',
		'.tab-area',
		'.window-controls-left',
		'.title-actions-container',
		'.pane.editor-pane',
		'.pane.viewer-pane',
		'.split-bar',
		'.find-bar',
		'.toc-overlay-wrapper',
		'.markpad-find-match',
		'.home-menu-container',
		'.theme-dropdown-container',
	]) {
		assert.doesNotMatch(
			printBlock,
			new RegExp(selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')),
			`${selector} is app state — the printed article cannot contain it, so the print sheet must not mention it`,
		);
	}
});

test('the viewer hands over an article rather than its own preview', () => {
	// D6: the fork's PDF route is `exportAsPdf` in `src/lib/export.ts` — a
	// hidden offscreen iframe carrying the @page sheet — not the upstream
	// print-root mount, which the component has dropped. `functionSource`
	// cannot read `export.ts` (its templates embed a literal `</script>`; see
	// exportContentWidth.test.ts), so the slices anchor on unique declarations.
	const exporter = readSource('src/lib/export.ts');
	assert.match(viewer, /import \{ exportAsHtml, exportAsPdf, type ExportFormat, type PdfPageSize \} from '\.\/export'/);
	const pdf = sliceBetween(exporter, 'export async function exportAsPdf', '\n// Page size dimensions in mm');
	// The print document is generated from the container the viewer hands over
	// (its preview content, not the live window) and printed inside the
	// offscreen iframe — never `window.print()`, whose paper is whatever is on
	// screen.
	// （D24 后续：contentWidth 尾参，spec 2026-10-09-export-restore-and-parity §2 D24；本行修复使 npm test 闸门恢复）
	assert.match(pdf, /await generateExportHtml\(container, showToc, pageSize, true, title, contentWidth\)/);
	assert.match(pdf, /iframe\.contentWindow\?\.print\(\)/);
	assert.doesNotMatch(pdf, /window\.print\(/);
	// And what the generator prints is the article alone: the app chrome is
	// stripped from the clone before rendering, so nothing named after an
	// interface part reaches the print document.
	const generator = sliceBetween(exporter, 'export async function generateExportHtml(', 'export async function exportAsPdfPaginated');
	assert.match(
		generator,
		/clone\.querySelectorAll\('\.toc-sidebar, \.toc-container, \.toc-overlay-wrapper, \.toc-resize-handle, \.editor-pane, \.split-bar[^']*'\)\.forEach\(el => el\.remove\(\)\)/,
		'the print document must be stripped of the app chrome',
	);
	// The preview's own DOM, its fold state and its theme have nothing to do
	// with what prints now, so nothing refreshes or re-themes it for an export.
	assert.doesNotMatch(viewer, /syncPreviewForPrint/);
	assert.doesNotMatch(viewer, /renderDiagramsForPrint/);
});
