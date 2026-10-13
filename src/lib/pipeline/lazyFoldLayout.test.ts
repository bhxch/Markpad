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

	it('创建即自观察 root（上游 foldLayout.ts:130 冷启动契约）', () => {
		const { root, wrappers } = makeFixture(3);
		const { deps, observed } = makeDeps();
		const obs = observeLazyFoldLayout(root, deps);
		// patch effect 声明早于 observation 创建 effect，首次插入时 foldLayout 为 null，
		// 观察不到任何块——冷启动全量入口只能靠创建时自观察（上游同位行为）。
		for (const w of wrappers) expect(observed.io).toContain(w);
		obs.stop();
	});

	it('remeasureAll（D35）：全量重写所有 wrapper 的 pin，含未晋升的远端节', () => {
		const { root, wrappers } = makeFixture(4);
		const { deps, ioCallbacks } = makeDeps();
		const obs = observeLazyFoldLayout(root, deps);
		obs.observe(root);
		// 只有第一个晋升（写入 pin），其余保持无 pin（模拟远端未晋升）
		ioCallbacks[0]([{ isIntersecting: true, target: wrappers[0] }]);
		expect(wrappers[0].style.getPropertyValue('--fold-content-height')).not.toBe('');
		expect(wrappers[1].style.getPropertyValue('--fold-content-height')).toBe('');
		obs.remeasureAll();
		for (const w of wrappers) {
			expect(w.style.getPropertyValue('--fold-content-height')).not.toBe('');
		}
		obs.stop();
	});

	it('remeasureAll（D35）：纠错——错误 pin 被同一次干净布局的重测覆盖', () => {
		const { root, wrappers } = makeFixture(3);
		const { deps, ioCallbacks } = makeDeps();
		const obs = observeLazyFoldLayout(root, deps);
		obs.observe(root);
		// 模拟棘轮固化：晋升后手工写入错误 pin
		ioCallbacks[0]([{ isIntersecting: true, target: wrappers[0] }]);
		wrappers[0].style.setProperty('--fold-content-height', '99999px');
		obs.remeasureAll();
		const pin = parseFloat(wrappers[0].style.getPropertyValue('--fold-content-height'));
		expect(pin).not.toBe(99999);
		// 同一干净布局下同构 wrapper 的测量值应彼此一致（读/写分离 + 原子 pass）
		obs.remeasureAll();
		const pins = wrappers.map((w) => w.style.getPropertyValue('--fold-content-height'));
		expect(new Set(pins).size).toBe(1);
		obs.stop();
	});

	it('D36 窄域晋升：晋升 B 不重测已晋升 A 的 pin', () => {
		const { root, wrappers } = makeFixture(3);
		const { deps, ioCallbacks } = makeDeps();
		const obs = observeLazyFoldLayout(root, deps);
		obs.observe(root);
		ioCallbacks[0]([{ isIntersecting: true, target: wrappers[0] }]);
		expect(wrappers[0].style.getPropertyValue('--fold-content-height')).not.toBe('');
		// 哨兵：若后续晋升把 A 一并重测，哨兵会被改写
		wrappers[0].style.setProperty('--fold-content-height', '777px');
		ioCallbacks[0]([{ isIntersecting: true, target: wrappers[1] }]);
		expect(wrappers[0].style.getPropertyValue('--fold-content-height')).toBe('777px');
		expect(wrappers[1].style.getPropertyValue('--fold-content-height')).not.toBe('');
		obs.stop();
	});

	it('D36 窄域 RO：尺寸变化只重写对应 wrapper，不重测其他活动成员', () => {
		const { root, wrappers } = makeFixture(3);
		const { deps, ioCallbacks, roCallbacks } = makeDeps();
		const obs = observeLazyFoldLayout(root, deps);
		obs.observe(root);
		ioCallbacks[0]([
			{ isIntersecting: true, target: wrappers[0] },
			{ isIntersecting: true, target: wrappers[1] },
		]);
		const content0 = wrappers[0].querySelector<HTMLElement>('.content-inner')!;
		const content1 = wrappers[1].querySelector<HTMLElement>('.content-inner')!;
		wrappers[0].style.setProperty('--fold-content-height', '777px');
		wrappers[1].style.setProperty('--fold-content-height', '888px');
		roCallbacks[0]([{ target: content1 }]);
		expect(wrappers[0].style.getPropertyValue('--fold-content-height')).toBe('777px');
		expect(wrappers[1].style.getPropertyValue('--fold-content-height')).not.toBe('888px');
		obs.stop();
	});

	it('D36 滚动静默门控：滚动进行中的晋升推迟测量，静默后补测', () => {
		const { root, wrappers } = makeFixture(2);
		let clock = 1000;
		const { deps, ioCallbacks } = makeDeps();
		const obs = observeLazyFoldLayout(root, { ...deps, now: () => clock });
		vi.useFakeTimers();
		try {
			obs.observe(root);
			window.dispatchEvent(new Event('scroll'));
			ioCallbacks[0]([{ isIntersecting: true, target: wrappers[0] }]);
			// 滚动静默窗内：只入队，不测量（WebKitGTK 平滑滚动期 rect 读数不可靠）
			expect(wrappers[0].style.getPropertyValue('--fold-content-height')).toBe('');
			clock = 1400; // 静默已过 400ms
			vi.advanceTimersByTime(500); // 推迟定时器触发 → 补测
			expect(wrappers[0].style.getPropertyValue('--fold-content-height')).not.toBe('');
		} finally {
			vi.useRealTimers();
			obs.stop();
		}
	});

	it('D36 滚动静默后的晋升立即测量且保持窄域', () => {
		const { root, wrappers } = makeFixture(2);
		let clock = 1000;
		const { deps, ioCallbacks } = makeDeps();
		const obs = observeLazyFoldLayout(root, { ...deps, now: () => clock });
		obs.observe(root);
		window.dispatchEvent(new Event('scroll'));
		clock = 1400; // 距上次滚动已静默 400ms
		ioCallbacks[0]([{ isIntersecting: true, target: wrappers[0] }]);
		expect(wrappers[0].style.getPropertyValue('--fold-content-height')).not.toBe('');
		// 窄域不因门控改变：另一 wrapper 未晋升则无 pin
		expect(wrappers[1].style.getPropertyValue('--fold-content-height')).toBe('');
		obs.stop();
	});

	it('D36 高度守卫：膨胀批次排队自愈，静默后收敛回正确值', () => {
		const { root, wrappers } = makeFixture(2);
		let clock = 10000;
		const { deps, ioCallbacks, roCallbacks } = makeDeps();
		const pinsSum = () => [...root.querySelectorAll<HTMLElement>('.foldable-content-wrapper')].reduce((a, w) => a + (parseFloat(w.style.getPropertyValue('--fold-content-height')) || 0), 0);
		const obs = observeLazyFoldLayout(root, { ...deps, now: () => clock, docHeight: () => 5000 + pinsSum() });
		vi.useFakeTimers();
		try {
			obs.observe(root);
			obs.remeasureAll(); // 基准：lastGood = 5000 + 0
			clock = 20000; // 插入静默已过
			// 模拟 WebKitGTK 瞬态：wrapper[0] 的 content 读数膨胀 500000
			const c0 = wrappers[0].querySelector<HTMLElement>('.content-inner')!;
			(c0 as unknown as { getBoundingClientRect: () => DOMRect }).getBoundingClientRect = () => ({ height: 500000, width: 100, top: 0, left: 0, right: 100, bottom: 500000, x: 0, y: 0, toJSON: () => ({}) } as DOMRect);
			ioCallbacks[0]([{ isIntersecting: true, target: wrappers[0] }]); // 晋升批次读到坏值
			expect(wrappers[0].style.getPropertyValue('--fold-content-height')).toBe('500000px'); // 坏值已写
			// 瞬态过去（读数恢复正常）→ 自愈全量重测收敛
			delete (c0 as unknown as { getBoundingClientRect?: unknown }).getBoundingClientRect;
			clock = 20400;
			vi.advanceTimersByTime(600);
			expect(wrappers[0].style.getPropertyValue('--fold-content-height')).not.toBe('500000px');
		} finally {
			vi.useRealTimers();
			obs.stop();
		}
	});

	it('D36 高度守卫：插入静默窗内不设防（drain 合法增长不触发自愈）', () => {
		const { root, wrappers } = makeFixture(2);
		let clock = 10000;
		const { deps, ioCallbacks } = makeDeps();
		const pinsSum = () => [...root.querySelectorAll<HTMLElement>('.foldable-content-wrapper')].reduce((a, w) => a + (parseFloat(w.style.getPropertyValue('--fold-content-height')) || 0), 0);
		const obs = observeLazyFoldLayout(root, { ...deps, now: () => clock, docHeight: () => 5000 + pinsSum() });
		vi.useFakeTimers();
		try {
			obs.observe(root); // lastInsertAt = 10000
			obs.remeasureAll();
			clock = 10500; // 距插入仅 0.5s
			const c0 = wrappers[0].querySelector<HTMLElement>('.content-inner')!;
			(c0 as unknown as { getBoundingClientRect: () => DOMRect }).getBoundingClientRect = () => ({ height: 500000, width: 100, top: 0, left: 0, right: 100, bottom: 500000, x: 0, y: 0, toJSON: () => ({}) } as DOMRect);
			ioCallbacks[0]([{ isIntersecting: true, target: wrappers[0] }]);
			expect(wrappers[0].style.getPropertyValue('--fold-content-height')).toBe('500000px'); // 不回滚、不自愈
			vi.advanceTimersByTime(1000);
			expect(wrappers[0].style.getPropertyValue('--fold-content-height')).toBe('500000px');
		} finally {
			vi.useRealTimers();
			obs.stop();
		}
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
