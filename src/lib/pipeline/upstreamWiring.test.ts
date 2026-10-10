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

	it('D34：patch effect 挂渐进首屏（plan 分支 + drain + head 富化 + 排空终止）', () => {
		expect(viewerSrc).toMatch(/import \{ planProgressiveRender \} from '\.\/pipeline\/progressiveFirstPaint\.js'/);
		expect(viewerSrc).toMatch(/planProgressiveRender\(sanitized\)/);
		expect(viewerSrc).toMatch(/\.drain\(host,/);
		// D34 修复轮 1（I1）：排空被新 patch 抢占或宿主脱离即终止
		expect(viewerSrc).toMatch(/shouldAbort: \(\) => !host\.isConnected \|\| previewRevision !== revisionOfThisRun/);
		// D34 修复轮 1（C2）：head 首屏切片必须富化
		expect(viewerSrc).toMatch(/enrichBlocks\(patch\.inserted\)/);
		// D34 修复轮 1：对齐 pass 已取消（memo 增量同步取代）
		expect(viewerSrc).not.toMatch(/alignMemo|patchPreviewBlocks\(host, sanitized!\)/);
	});

	it('D34：appendRenderedKeys 追加式导出且被渐进管线调用（C1 memo 增量同步）', () => {
		const bp = readFileSync(join(__dirname, '../utils/blockPatch.ts'), 'utf8');
		expect(bp).toMatch(/export function appendRenderedKeys\(container: Element, elements: Element\[\]\): void/);
		const pf = readFileSync(join(__dirname, './progressiveFirstPaint.ts'), 'utf8');
		expect(pf).toMatch(/appendRenderedKeys\(parent, elements\)/);
	});

	it('D34：DESCEND 选择器与 blockPatch 契约同源（防漂移）', () => {
		const bp = readFileSync(join(__dirname, '../utils/blockPatch.ts'), 'utf8');
		const desc = bp.match(/const DESCENDABLE =([\s\S]*?);/)?.[1] ?? '';
		expect(desc).toContain('.foldable-content-wrapper');
		const pf = readFileSync(join(__dirname, './progressiveFirstPaint.ts'), 'utf8');
		for (const sel of ['.foldable-content-wrapper', '.content-inner', '.markdown-alert', '.markdown-alert-content']) {
			expect(desc).toContain(sel);
			expect(pf).toContain(sel);
		}
	});
});
