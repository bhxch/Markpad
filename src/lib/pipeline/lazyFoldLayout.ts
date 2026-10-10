// D29（spec 2026-10-10 §2）：fold 高度的惰性测量。
// 逻辑源自上游 src/lib/utils/foldLayout.ts（#210 读/写分离契约、#807 zoom 除法），
// 本模块以相同接口（observe/stop）惰性化：
//  - observe(scope) 只把 wrapper 交给 IntersectionObserver 排队（待观察集合）；
//  - 临近视口才晋升：挂 ResizeObserver 并立即测量该 wrapper；
//  - 未晋升 wrapper 无内联 --fold-content-height，按上游 CSS 契约以 auto 布局，
//    显示天然正确（foldLayout.ts:29-37 注释），仅折叠动画平滑度延后；
//  - 测量域收窄为活动集（已晋升 wrapper），任何 RO 回调不再触发全文档 reflow。
// merge 注意：上游若改 fold CSS 契约（--fold-content-height / zoom / transition
// 抑制），必须同步本文件——lazyFoldLayout.test.ts 与 upstreamWiring.test.ts 是验收依据。
import { previewZoomFactor } from '../utils/previewAnchor.js';
import type { FoldLayoutObservation } from '../utils/foldLayout.js';

const FOLD_WRAPPER_SELECTOR = '.foldable-content-wrapper';
const FOLD_CONTENT_SELECTOR = ':scope > .content-inner';

export interface LazyFoldLayoutDeps {
	// null = 环境无 IntersectionObserver：回退为立即全量观察（上游行为）。
	// undefined = 用全局构造器（生产路径）。
	ioFactory?: ((cb: IntersectionObserverCallback) => IntersectionObserver) | null;
	roFactory?: ((cb: ResizeObserverCallback) => ResizeObserver) | null;
	// 默认 requestAnimationFrame 批处理；测试注入同步执行。
	schedule?: (cb: () => void) => void;
}

interface WrapperWithContent {
	wrapper: HTMLElement;
	content: HTMLElement;
}

// 与上游 foldLayout.ts updateFoldHeights 相同的读/写分离纪律，测量域收窄为入参清单。
function measureWrappers(root: HTMLElement, items: WrapperWithContent[]) {
	const pending: WrapperWithContent[] = [];
	for (const item of items) {
		if (!item.content) continue;
		item.wrapper.style.transition = 'none';
		item.wrapper.style.removeProperty('--fold-content-height');
		pending.push(item);
	}
	if (pending.length === 0) return;

	const zoom = previewZoomFactor(root);
	const heights = pending.map(({ content }) => content.getBoundingClientRect().height / zoom);
	pending.forEach(({ wrapper }, index) => {
		wrapper.style.setProperty('--fold-content-height', `${heights[index]}px`);
	});
	void root.offsetHeight;
	for (const { wrapper } of pending) {
		wrapper.style.transition = '';
	}
}

export function observeLazyFoldLayout(root: HTMLElement, deps: LazyFoldLayoutDeps = {}): FoldLayoutObservation {
	const resolveIO = (): ((cb: IntersectionObserverCallback) => IntersectionObserver) | null =>
		deps.ioFactory !== undefined
			? deps.ioFactory
			: typeof IntersectionObserver !== 'undefined'
				? (cb) => new IntersectionObserver(cb, { root: null, rootMargin: '100% 0px' })
				: null;
	const resolveRO = (): ((cb: ResizeObserverCallback) => ResizeObserver) | null =>
		deps.roFactory !== undefined
			? deps.roFactory
			: typeof ResizeObserver !== 'undefined'
				? (cb) => new ResizeObserver(cb)
				: null;

	const ioFactory = resolveIO();
	const roFactory = resolveRO();
	const active = new Map<Element, HTMLElement>(); // content-inner -> wrapper（活动集）
	let frame: number | null = null;

	const runUpdate = () => {
		frame = null;
		measureWrappers(root, [...active.values()].map((wrapper) => ({ wrapper, content: wrapper.querySelector<HTMLElement>(FOLD_CONTENT_SELECTOR)! })));
	};
	const scheduleUpdate = () => {
		if (frame !== null) return;
		if (deps.schedule) {
			deps.schedule(runUpdate); // 注入调度（测试同步执行）：frame 恒为 null，仅作直通
		} else {
			frame = requestAnimationFrame(runUpdate); // 默认 rAF：frame 供去重与 stop() 取消
		}
	};

	let ro: ResizeObserver | null = null;
	if (roFactory) {
		ro = roFactory(() => scheduleUpdate());
	}

	const promote = (wrapper: HTMLElement) => {
		if (active.has(wrapper.querySelector<HTMLElement>(FOLD_CONTENT_SELECTOR)!)) return;
		const content = wrapper.querySelector<HTMLElement>(FOLD_CONTENT_SELECTOR);
		if (!content) return;
		active.set(content, wrapper);
		if (ro) ro.observe(content);
		scheduleUpdate();
	};

	const observer = ioFactory
		? ioFactory((entries) => {
			for (const entry of entries) {
				if (entry.isIntersecting && entry.target instanceof HTMLElement) promote(entry.target);
			}
		})
		: null;

	const observe = (scope: Element) => {
		// 上游 #210 契约复刻：新块插入后，其祖先 wrapper 钉着的旧高度对不上新内容，
		// 清成 auto 让布局立即正确，晋升测量会再发布准确值。
		for (let element = scope.parentElement; element; element = element.parentElement) {
			if (element.matches(FOLD_WRAPPER_SELECTOR)) {
				element.style.removeProperty('--fold-content-height');
			}
		}

		const wrappers: HTMLElement[] = [];
		if (scope instanceof HTMLElement && scope.matches(FOLD_WRAPPER_SELECTOR)) wrappers.push(scope);
		wrappers.push(...scope.querySelectorAll<HTMLElement>(FOLD_WRAPPER_SELECTOR));

		for (const wrapper of wrappers) {
			if (observer) observer.observe(wrapper);
			else promote(wrapper); // 回退：无 IO 环境立即全量晋升（上游行为）
		}
		scheduleUpdate();
	};

	const stop = () => {
		observer?.disconnect();
		ro?.disconnect();
		if (frame !== null) cancelAnimationFrame(frame);
		frame = null;
	};

	return { observe, stop };
}
