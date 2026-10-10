import { describe, expect, it } from 'vitest';
import { planProgressiveRender } from './progressiveFirstPaint.js';

const SOURCEPOS = /\s+data-sourcepos="[^"]*"/g;

/** 构造 sanitized 形态：h1 头 + wrapper(header+content-inner>children) */
function makeDoc(sectionBlocks: number[][], loose = 0): DocumentFragment {
	const frag = document.createDocumentFragment();
	const h1 = document.createElement('h1');
	h1.className = 'foldable-header';
	h1.setAttribute('data-sourcepos', '1:1-1:5');
	h1.textContent = 'title';
	frag.append(h1);
	const wrapper = document.createElement('div');
	wrapper.className = 'foldable-content-wrapper';
	wrapper.setAttribute('data-sourcepos', '1:1-99:9');
	const header = document.createElement('h2');
	header.className = 'foldable-header';
	const inner = document.createElement('div');
	inner.className = 'content-inner';
	for (const count of sectionBlocks) {
		const w = document.createElement('div');
		w.className = 'foldable-content-wrapper';
		const h = document.createElement('h3');
		h.className = 'foldable-header';
		w.append(h);
		const ci = document.createElement('div');
		ci.className = 'content-inner';
		for (let i = 0; i < Number(count); i++) {
			const p = document.createElement('p');
			p.setAttribute('data-sourcepos', '2:1-2:9');
			p.textContent = `block ${w.tagName}${i}`;
			ci.append(p);
		}
		w.append(ci);
		inner.append(w);
	}
	for (let i = 0; i < loose; i++) inner.append(document.createElement('p'));
	wrapper.append(header, inner);
	frag.append(wrapper);
	return frag;
}

function unitsOf(frag: DocumentFragment): number {
	// 与模块同口径粗算：仅为测试阈值守卫，不复制 walk
	return frag.querySelectorAll('*').length;
}

describe('planProgressiveRender（D34，spec 2026-10-10-progressive-first-paint）', () => {
	it('单元数 ≤ 阈值返回 null（小文档同步路径）', () => {
		const frag = makeDoc([[1, 2]]);
		expect(planProgressiveRender(frag, { threshold: 60 })).toBeNull();
	});

	it('大文档返回 head + units；head 含首屏切片，超切点容器为壳（content-inner 为空）', () => {
		const frag = makeDoc([[3], [3], [3], [3], [3], [3], [3], [3], [3], [3]]);
		const plan = planProgressiveRender(frag, { headUnits: 7, threshold: 20 });
		expect(plan).not.toBeNull();
		const headHost = document.createElement('div');
		headHost.append(plan!.head);
		// 首屏切片：head 内 wrapper 的 content-inner 只含切点前单元，其后为空壳
		const inner = headHost.querySelector('.foldable-content-wrapper > .content-inner')!;
		const childWrappers = [...inner.children].filter((c) => c.classList.contains('foldable-content-wrapper'));
		expect(childWrappers.length).toBeGreaterThan(0);
		const empties = childWrappers.filter((w) => w.querySelector('.content-inner')?.children.length === 0);
		expect(empties.length).toBeGreaterThan(0);
		expect(plan!.units.length).toBeGreaterThan(0);
	});

	it('drain 全量落地：parentPath 解析正确（嵌套 wrapper），文档顺序不乱', async () => {
		const frag = makeDoc([[2], [2], [2], [2], [2], [2], [2], [2]]);
		const plan = planProgressiveRender(frag, { headUnits: 6, threshold: 20 })!;
		const host = document.createElement('div');
		document.body.append(host);
		host.append(plan.head); // D34：drain 契约前提是 host 已含 head（真实接线由 patchPreviewBlocks 先行落地）
		const inserted: Element[][] = [];
		await plan.drain(host, { budgetMs: 0, schedule: (cb) => cb(), onBatch: (b) => inserted.push([...b]) });
		const inner = host.querySelector('.foldable-content-wrapper > .content-inner')!;
		const texts = [...inner.querySelectorAll('p')].map((p) => p.textContent);
		// 8 节 × 2 段 = 16 段全量落地，文档顺序不乱（brief 原稿期望 8 项，系按 4 节笔误）
		expect(texts).toEqual([
			'block DIV0', 'block DIV1', 'block DIV0', 'block DIV1',
			'block DIV0', 'block DIV1', 'block DIV0', 'block DIV1',
			'block DIV0', 'block DIV1', 'block DIV0', 'block DIV1',
			'block DIV0', 'block DIV1', 'block DIV0', 'block DIV1',
		]);
		expect(inserted.length).toBeGreaterThan(0);
		host.remove();
	});

	it('drain 中 host 脱离 DOM 即终止且 promise 仍 resolve', async () => {
		const frag = makeDoc([[2], [2], [2], [2], [2], [2], [2], [2], [2], [2]]);
		const plan = planProgressiveRender(frag, { headUnits: 3, threshold: 20 })!;
		const host = document.createElement('div');
		document.body.append(host);
		host.append(plan.head); // D34：drain 契约前提是 host 已含 head（真实接线由 patchPreviewBlocks 先行落地）
		let batches = 0;
		const p = plan.drain(host, { budgetMs: 0, schedule: (cb) => queueMicrotask(cb), onBatch: () => batches++ });
		host.remove();
		await expect(p).resolves.toBeUndefined();
		expect(batches).toBeLessThan(plan.units.length);
	});

	it('克隆键与源一致（outerHTML 去 sourcepos 逐字节相等）', async () => {
		const frag = makeDoc([[2], [2], [2], [2], [2], [2], [2], [2]]);
		const plan = planProgressiveRender(frag, { headUnits: 6, threshold: 20 })!;
		const host = document.createElement('div');
		document.body.append(host);
		host.append(plan.head); // D34：drain 契约前提是 host 已含 head（真实接线由 patchPreviewBlocks 先行落地）
		await plan.drain(host, { budgetMs: 0, schedule: (cb) => cb() });
		// 源（frag 中尚存的 shell 对应物）vs 落地克隆：逐 wrapper 比对键
		const srcWrappers = [...frag.querySelectorAll('.foldable-content-wrapper')];
		const liveWrappers = [...host.querySelectorAll('.foldable-content-wrapper')];
		expect(liveWrappers.length).toBe(srcWrappers.length);
		for (let i = 0; i < srcWrappers.length; i++) {
			expect(liveWrappers[i].outerHTML.replace(SOURCEPOS, '')).toBe(srcWrappers[i].outerHTML.replace(SOURCEPOS, ''));
		}
		host.remove();
	});

	it('drain 遵守 budgetMs（注入同步 schedule 计帧）', async () => {
		const frag = makeDoc([[2], [2], [2], [2], [2], [2], [2], [2], [2], [2], [2], [2]]);
		const plan = planProgressiveRender(frag, { headUnits: 6, threshold: 20 })!;
		const host = document.createElement('div');
		document.body.append(host);
		host.append(plan.head); // D34：drain 契约前提是 host 已含 head（真实接线由 patchPreviewBlocks 先行落地）
		let frames = 0;
		await plan.drain(host, { budgetMs: -1, schedule: (cb) => { frames++; queueMicrotask(cb); } });
		// budgetMs=-1：每单元一帧，保证预算机制真实生效
		expect(frames).toBeGreaterThan(2);
		host.remove();
	});
});
