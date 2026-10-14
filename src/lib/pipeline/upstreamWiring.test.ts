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
		// D34 最终评审 C-1：渐进仅限宿主首渲——enrichedHosts 已命中时恒走同步增量，
		// 分屏 keystroke 防抖重渲不得重走渐进路径（head-only 壳 patch 会清空首屏以下）
		expect(viewerSrc).toMatch(/sanitized && !enrichedHosts\.has\(host\) \? planProgressiveRender\(sanitized\)/);
		expect(viewerSrc).toMatch(/\.drain\(host,/);
		// D34 修复轮 1（I1）：排空被新 patch 抢占或宿主脱离即终止
		expect(viewerSrc).toMatch(/shouldAbort: \(\) => !host\.isConnected \|\| previewRevision !== revisionOfThisRun/);
		// D34 修复轮 1（C2）：head 首屏切片必须富化
		expect(viewerSrc).toMatch(/enrichBlocks\(patch\.inserted\)/);
		// D34 修复轮 1：对齐 pass 已取消（memo 增量同步取代）
		expect(viewerSrc).not.toMatch(/alignMemo|patchPreviewBlocks\(host, sanitized!\)/);
		// D34 目录修复（真机反馈）：排空批富化收集成 promise，排空+全部批富化完成后
		// 再发布一次修订——预览侧 Toc 依赖 previewRevision 扫 DOM，head 落地时的一次
		// 自增只会让它看到首屏切片的标题（目录缺 96/99 条的回归即此）
		expect(viewerSrc).toMatch(/batchEnrichments\.push\(enrichBlocks\(inserted\)\)/);
		expect(viewerSrc).toMatch(/Promise\.all\(\[headEnrichment, drained, \.\.\.batchEnrichments\]\)[\s\S]{0,120}previewRevision = \+\+previewPatches;/);
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

	it('D37-1：Editor 的 createEditor 经惰性启动排队（防 merge 还原同步启动）', () => {
		const editorSrc = readFileSync(join(__dirname, '../components/Editor.svelte'), 'utf8');
		expect(editorSrc).toMatch(/bootEditorWhenIdle\(createEditor\)/);
		// 同步启动不得回归：createEditor 只能作为惰性启动的实参出现
		expect(editorSrc).not.toMatch(/teardown = createEditor\(\)/);
	});

	it('D37-2：排空 onBatch 经前缘节流发布 TOC 中间修订（防 merge 丢失渐进目录）', () => {
		const viewerSrc = readFileSync(join(__dirname, '../MarkdownViewer.svelte'), 'utf8');
		expect(viewerSrc).toMatch(/createTocThrottler/);
		expect(viewerSrc).toMatch(/tocThrottle\.tick\(\)/);
	});
});
