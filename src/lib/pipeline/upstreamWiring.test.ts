import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const viewerSrc = readFileSync(join(__dirname, '../MarkdownViewer.svelte'), 'utf8');
const sessionSrc = readFileSync(join(__dirname, '../sessions/documentSession.svelte.ts'), 'utf8');
const windowSessionSrc = readFileSync(join(__dirname, '../sessions/windowSession.svelte.ts'), 'utf8');

describe('上游文件本地接线存在性（D29/D30/D31/D32，spec 2026-10-10）', () => {
	it('D30：effect 以 analyzeEnrichmentNeed 守卫图表分发与富化', () => {
		expect(viewerSrc).toMatch(/import \{ analyzeEnrichmentNeed \} from '\.\/pipeline\/enrichPrecheck\.js'/);
		expect(viewerSrc).toMatch(/const enrichmentNeed = analyzeEnrichmentNeed\(htmlContent\)/);
		expect(viewerSrc).toMatch(/if \(enrichmentNeed\.diagrams\) \{[\s\S]*?renderDiagramBlocks/);
		expect(viewerSrc).toMatch(/enrichmentNeed\.code \|\| enrichmentNeed\.math \|\| enrichmentNeed\.diagrams/);
	});

	it('D29：fold 观察换用本地惰性实现（Task 4 完成后转绿）', () => {
		expect(viewerSrc).toMatch(/observeLazyFoldLayout\(host\)/);
	});

	it('D31：loadMarkdown 挂同内容短路守卫（Task 5 完成后转绿）', () => {
		expect(sessionSrc).toMatch(/import \{ isIdenticalRenderSkippable \} from '\.\.\/pipeline\/openFastPath\.js'/);
		expect(sessionSrc).toMatch(/isIdenticalRenderSkippable\(receiving, content/);
	});

	it('D32：恢复循环活动 tab 优先（Task 6 完成后转绿）', () => {
		expect(windowSessionSrc).toMatch(/D32 接线/);
		expect(windowSessionSrc).toMatch(/orderedTabs/);
	});
});
