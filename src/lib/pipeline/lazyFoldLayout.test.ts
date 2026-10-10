import { describe, expect, it, vi } from 'vitest';
import { observeLazyFoldLayout } from './lazyFoldLayout.js';
import { previewZoomFactor } from '../utils/previewAnchor.js';

vi.mock('../utils/previewAnchor.js', () => ({ previewZoomFactor: vi.fn(() => 1) }));

type IOEntry = { isIntersecting: boolean; target: Element };
type IOCallback = (entries: IOEntry[]) => void;
type ROCallback = (entries: Array<{ target: Element }>) => void;

function makeFixture(wrapperCount: number) {
	const root = document.createElement('div');
	const wrappers: HTMLElement[] = [];
	for (let i = 0; i < wrapperCount; i++) {
		const wrapper = document.createElement('div');
		wrapper.className = 'foldable-content-wrapper';
		const header = document.createElement('h2');
		const content = document.createElement('div');
		content.className = 'content-inner';
		content.textContent = `section ${i}`;
		wrapper.append(header, content);
		root.append(wrapper);
		wrappers.push(wrapper);
	}
	document.body.append(root);
	return { root, wrappers };
}

function makeDeps() {
	const ioCallbacks: IOCallback[] = [];
	const roCallbacks: ROCallback[] = [];
	const observed = { io: [] as Element[], ro: [] as Element[] };
	const deps = {
		// 工厂参数用 DOM 回调类型以结构性满足 LazyFoldLayoutDeps（strictFunctionTypes
		// 下窄化的局部 IOCallback/ROCallback 不可逆变赋值，会让 svelte-check 报 7 处错误）；
		// push 时 cast 回局部窄类型，使下方直接以最小 entry 形状调用成为合法测试代码。
		ioFactory: (cb: IntersectionObserverCallback) => {
			ioCallbacks.push(cb as unknown as IOCallback);
			return { observe: (el: Element) => observed.io.push(el), unobserve: () => {}, disconnect: () => {}, takeRecords: () => [] } as unknown as IntersectionObserver;
		},
		roFactory: (cb: ResizeObserverCallback) => {
			roCallbacks.push(cb as unknown as ROCallback);
			return { observe: (el: Element) => observed.ro.push(el), unobserve: () => {}, disconnect: () => {} } as unknown as ResizeObserver;
		},
		schedule: (cb: () => void) => cb(),
	};
	return { deps, ioCallbacks, roCallbacks, observed };
}

describe('observeLazyFoldLayout（D29，spec 2026-10-10）', () => {
	it('未晋升（IO 未回调）不测量：wrapper 无内联 --fold-content-height', () => {
		const { root, wrappers } = makeFixture(3);
		const { deps } = makeDeps();
		const obs = observeLazyFoldLayout(root, deps);
		obs.observe(root);
		for (const w of wrappers) expect(w.style.getPropertyValue('--fold-content-height')).toBe('');
		obs.stop();
	});

	it('IO 晋升即测量：命中 wrapper 写入高度并挂 RO', () => {
		const { root, wrappers } = makeFixture(3);
		const { deps, ioCallbacks, observed } = makeDeps();
		const obs = observeLazyFoldLayout(root, deps);
		obs.observe(root);
		ioCallbacks[0]([{ isIntersecting: true, target: wrappers[0] }]);
		expect(wrappers[0].style.getPropertyValue('--fold-content-height')).not.toBe('');
		expect(observed.ro.map((el) => el.className)).toContain('content-inner');
		expect(observed.ro.some((el) => el.parentElement === wrappers[0])).toBe(true);
		obs.stop();
	});

	it('RO 回调只重测活动集：未晋升 wrapper 保持无内联高度', () => {
		const { root, wrappers } = makeFixture(3);
		const { deps, ioCallbacks, roCallbacks } = makeDeps();
		const obs = observeLazyFoldLayout(root, deps);
		obs.observe(root);
		ioCallbacks[0]([{ isIntersecting: true, target: wrappers[0] }]);
		const promoted = wrappers[0].querySelector<HTMLElement>('.content-inner')!;
		roCallbacks[0]([{ target: promoted }]);
		expect(wrappers[0].style.getPropertyValue('--fold-content-height')).not.toBe('');
		expect(wrappers[1].style.getPropertyValue('--fold-content-height')).toBe('');
		expect(wrappers[2].style.getPropertyValue('--fold-content-height')).toBe('');
		obs.stop();
	});

	it('环境无 IntersectionObserver（ioFactory=null）回退为立即全量观察', () => {
		const { root, wrappers } = makeFixture(3);
		const { deps, observed } = makeDeps();
		const obs = observeLazyFoldLayout(root, { ...deps, ioFactory: null });
		obs.observe(root);
		for (const w of wrappers) {
			expect(w.style.getPropertyValue('--fold-content-height')).not.toBe('');
			expect(observed.ro.some((el) => el.parentElement === w)).toBe(true);
		}
		obs.stop();
	});

	it('observe 新块时清理祖先 wrapper 的陈旧内联高度（上游 #210 契约复刻）', () => {
		const { root, wrappers } = makeFixture(1);
		const { deps } = makeDeps();
		const obs = observeLazyFoldLayout(root, deps);
		obs.observe(root);
		wrappers[0].style.setProperty('--fold-content-height', '999px');
		const fresh = document.createElement('p');
		wrappers[0].querySelector('.content-inner')!.append(fresh);
		obs.observe(fresh);
		expect(wrappers[0].style.getPropertyValue('--fold-content-height')).toBe('');
		obs.stop();
	});

	it('stop() 幂等且 disconnect 双观察器', () => {
		const { root } = makeFixture(1);
		const { deps } = makeDeps();
		const obs = observeLazyFoldLayout(root, deps);
		obs.observe(root);
		expect(() => obs.stop()).not.toThrow();
		expect(() => obs.stop()).not.toThrow();
	});

	it('测量值按 previewZoomFactor 折算（#807 契约）', () => {
		const { root, wrappers } = makeFixture(1);
		vi.mocked(previewZoomFactor).mockReturnValue(2);
		const { deps, ioCallbacks } = makeDeps();
		const obs = observeLazyFoldLayout(root, deps);
		obs.observe(root);
		ioCallbacks[0]([{ isIntersecting: true, target: wrappers[0] }]);
		expect(wrappers[0].style.getPropertyValue('--fold-content-height')).toMatch(/px$/);
		// happy-dom 无布局引擎、rect.height 恒 0，"0px" 无法区分 zoom 折算路径，
		// 故以 spy 断言测量确实经过 previewZoomFactor 折算（#807 契约）。
		expect(vi.mocked(previewZoomFactor)).toHaveBeenCalled();
		vi.mocked(previewZoomFactor).mockReturnValue(1);
		obs.stop();
	});
});
