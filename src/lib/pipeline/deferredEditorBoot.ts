/**
 * D37-1（spec 2026-10-13）：split/编辑器 Monaco 的惰性启动。
 *
 * Editor.svelte 的 onMount 动态 import monaco 后同步 createEditor()——4.4MB
 * chunk 求值（~360ms/窗口）+ 在大文档模型上的创建/首渲排在打开关键路径上，
 * 实测一次 ~1.3s 主线程冻结阻塞预览排空。本模块把 createEditor 推迟到
 * 首帧绘制后的空闲点（rAF×2 → requestIdleCallback，timeout 兜底），用户
 * 输入（pointerdown/keydown，capture）立即抢占启动；Editor 现有契约已把
 * "editor 未创建"视为常态（动态 import 窗口），惰性化只是延长该窗口。
 *
 * merge 注意：Editor.svelte 只保留一行接线（bootEditorWhenIdle(createEditor)），
 * 调度逻辑必须留在本文件——lazyFoldLayout/upstreamWiring.test.ts 是接线验收。
 */
export interface EditorBootDeps {
	/** 默认 requestAnimationFrame；返回撤销函数。 */
	raf?: (cb: () => void) => () => void;
	/** 默认 requestIdleCallback({ timeout })，缺失时 setTimeout(idleTimeoutMs) 兜底。 */
	idle?: (cb: () => void) => () => void;
	/** 默认 window pointerdown+keydown capture；返回撤销函数。 */
	preempt?: (cb: () => void) => () => void;
	idleTimeoutMs?: number;
}

/**
 * 把 `create`（返回编辑器 teardown）推迟到空闲点执行；返回的取消函数在启动前
 * 撤销整个调度，启动后等价于编辑器 teardown。幂等。
 */
export function bootEditorWhenIdle(create: () => () => void, deps: EditorBootDeps = {}): () => void {
	const idleTimeoutMs = deps.idleTimeoutMs ?? 4000;
	const raf =
		deps.raf ??
		((cb: () => void) => {
			const id = requestAnimationFrame(cb);
			return () => cancelAnimationFrame(id);
		});
	const idle =
		deps.idle ??
		((cb: () => void) => {
			// 真空闲优先（timeout 只是饥饿上界）：排空进行中主线常忙，rIC 会等到
			// 排空结束后的第一个空档才启动编辑器——boot 的 ~1s 单体任务不插进
			// 排空中间。无 rIC 的环境退化为定时兜底。
			const w = window as Window & { requestIdleCallback?: (cb: () => void, opts: { timeout: number }) => number; cancelIdleCallback?: (id: number) => void };
			if (typeof w.requestIdleCallback === 'function') {
				const id = w.requestIdleCallback(cb, { timeout: idleTimeoutMs });
				return () => w.cancelIdleCallback?.(id);
			}
			const id = setTimeout(cb, idleTimeoutMs / 2);
			return () => clearTimeout(id);
		});
	const preempt =
		deps.preempt ??
		((cb: () => void) => {
			window.addEventListener('pointerdown', cb, { capture: true, passive: true });
			window.addEventListener('keydown', cb, { capture: true });
			return () => {
				window.removeEventListener('pointerdown', cb, { capture: true });
				window.removeEventListener('keydown', cb, { capture: true });
			};
		});

	let cancelled = false;
	let booted = false;
	let teardown: (() => void) | null = null;
	let cancelIdle: (() => void) | null = null;
	const detachPreempt = preempt(onPreempt);

	function boot() {
		if (cancelled || booted) return;
		booted = true;
		detachPreempt();
		if (cancelIdle !== null) {
			cancelIdle();
			cancelIdle = null;
		}
		teardown = create();
	}

	function onPreempt() {
		boot();
	}

	function onSecondFrame() {
		if (cancelled || booted) return;
		cancelIdle = idle(boot);
	}

	function onFirstFrame() {
		if (cancelled || booted) return;
		const cancelSecond = raf(onSecondFrame);
		// 第二帧前的抢占/取消：boot/cancel 会把状态置位，回调里再判空跑。
		void cancelSecond;
	}

	const cancelFirst = raf(onFirstFrame);

	return () => {
		if (cancelled) {
			// 已取消过：幂等重入，仅重复 teardown（Editor cleanup 只调一次，防御性）。
			teardown?.();
			return;
		}
		cancelled = true;
		cancelFirst();
		detachPreempt();
		if (cancelIdle !== null) cancelIdle();
		if (booted) teardown?.();
	};
}
