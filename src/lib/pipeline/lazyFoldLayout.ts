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
// resize 重测由 RO 覆盖（rewrap 必触发 content-inner 尺寸变化），无独立 window resize 监听——对 spec §2.3 字面的有意偏离，评审裁定行为等价。
//
// D35（真机缺陷修复）：子集测量的棘轮缺陷——pin 是布局输入（wrapper height =
// var(--fold-content-height)），祖先 wrapper 的实测高度包含后代 pin 参与布局的
// 结果；"清活动集→读活动集"时未晋升后代仍带旧 pin，不同批次读到的部分状态
// 互相污染，pin 会棘轮式偏离真实高度（实测单文档漂移 215K→657K，3 倍幻影
// 高度），且 RO 对已冻结 pin 不再给出纠正事件（真机 +300px 探针零反应）。
// remeasureAll() 恢复上游"清全部→读全部→写全部"的原子全量语义，在排空完成
// 与 resize（防抖）时调用，一次性重建真值基线。
//
// D36（spec 2026-10-13）：promote 与 RO 回调从"重测整个活动集"收窄为"只测本次
// 晋升/尺寸变化的 wrapper"。全量重测的两次全文档 reflow 是打开后滚动第一遍卡顿
// （median 61-104ms，merge 前基线 20ms）与折叠开合延迟（41-873ms）的来源，实测
// 见 docs/perf/2026-10-13-merge前后性能回归调查.md。
import { previewZoomFactor } from '../utils/previewAnchor.js';

const FOLD_WRAPPER_SELECTOR = '.foldable-content-wrapper';
const FOLD_CONTENT_SELECTOR = ':scope > .content-inner';

/** D35： observe/stop 同上游契约；remeasureAll 为全量原子重测（棘轮纠正）。 */
export interface LazyFoldLayoutObservation {
	observe(scope: Element): void;
	stop(): void;
	remeasureAll(): void;
}

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

export function observeLazyFoldLayout(root: HTMLElement, deps: LazyFoldLayoutDeps = {}): LazyFoldLayoutObservation {
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
	// D36（spec 2026-10-13）：窄域测量队列。D29 的 promote/RO 回调曾每次重测整个
	// 活动集（清全部 pin→读全部→写全部 = 两次全文档 reflow），滚动第一遍每步都要为
	// 新晋升者付出全文档代价（实测 median 61-104ms，merge 前基线 20ms）。改为只测
	// 本次晋升/尺寸变化的 wrapper：内容变化→该 wrapper 自己的 RO 事件→本地重测闭环
	// 不变；子集测量的棘轮风险仍由 D35 remeasureAll（排空完成 + resize）兜底。
	const measureSet = new Set<HTMLElement>();
	let frame: number | null = null;

	const runUpdate = () => {
		frame = null;
		if (measureSet.size === 0) return;
		const items = [...measureSet].map((wrapper) => ({ wrapper, content: wrapper.querySelector<HTMLElement>(FOLD_CONTENT_SELECTOR)! }));
		measureSet.clear();
		measureWrappers(root, items);
	};
	const scheduleUpdate = () => {
		if (frame !== null) return;
		if (deps.schedule) {
			deps.schedule(runUpdate); // 注入调度（测试同步执行）：frame 恒为 null，仅作直通
		} else {
			frame = requestAnimationFrame(runUpdate); // 默认 rAF：frame 供去重与 stop() 取消
		}
	};
	const queueMeasure = (wrapper: HTMLElement) => {
		measureSet.add(wrapper);
		scheduleUpdate();
	};

	let ro: ResizeObserver | null = null;
	if (roFactory) {
		ro = roFactory((entries) => {
			// D36：只重测尺寸实际变化的 wrapper（entry.target = content-inner）。
			for (const entry of entries) {
				const wrapper = active.get(entry.target);
				if (wrapper) queueMeasure(wrapper);
			}
		});
	}

	const promote = (wrapper: HTMLElement) => {
		const content = wrapper.querySelector<HTMLElement>(FOLD_CONTENT_SELECTOR);
		if (!content || active.has(content)) return;
		active.set(content, wrapper);
		if (ro) ro.observe(content);
		queueMeasure(wrapper); // D36：只测新晋升者，不重测既有活动成员
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
		if (resizeTimer !== null) clearTimeout(resizeTimer);
		resizeTimer = null;
	};

	// D35：全量原子重测（上游 updateFoldHeights 语义）——清全部 pin → 同一干净布局
	// 批量读 → 批量写。纠正子集测量棘轮固化的错误 pin（真机实测单次调用后跳转
	// 落点恢复 ±常数误差）。成本 = 两次全文档 reflow，只在排空完成与 resize 防抖后发生。
	const remeasureAll = () => {
		const wrappers = [...root.querySelectorAll<HTMLElement>(FOLD_WRAPPER_SELECTOR)];
		measureWrappers(
			root,
			wrappers.flatMap((wrapper) => {
				const content = wrapper.querySelector<HTMLElement>(FOLD_CONTENT_SELECTOR);
				return content ? [{ wrapper, content }] : [];
			}),
		);
	};

	// D35：resize 后未晋升 wrapper 无 RO 观察、pin 会 stale——防抖全量重测。
	let resizeTimer: ReturnType<typeof setTimeout> | null = null;
	const onResize = () => {
		if (resizeTimer !== null) clearTimeout(resizeTimer);
		resizeTimer = setTimeout(() => {
			resizeTimer = null;
			remeasureAll();
		}, 150);
	};
	window.addEventListener('resize', onResize);

	// 上游 foldLayout.ts:130 同位契约：创建即自观察 root。这是冷启动唯一的全量入口——
	// patch effect 声明早于 observation 创建 effect，首次插入全部块时 foldLayout 还是
	// null，observe 全部空转。IO 路径下此处只是入队不测量，晋升仍受视口门控；隐藏宿主
	// （display:none）不产生 isIntersecting，安全。
	observe(root);

	return { observe, stop, remeasureAll };
}
