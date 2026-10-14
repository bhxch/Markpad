/**
 * D37-2（spec 2026-10-13）：排空期间的 TOC 渐进发布节流器。
 *
 * 预览修订号驱动 Toc.svelte 的整树扫描（~5-20ms/次），D34 此前只在排空完成后
 * 发布一次，TOC 在内容全部落定前一直是 head 切片的几条。这里给 onBatch 一个
 * 前缘节流的发布点：每个间隔至多一次扫描，TOC 随内容逐段生长；排空完成的
 * 终态发布（D34，7b45339）保持不动，作为尾随保证——节流器不需要 trailing。
 */
export interface TocThrottler {
	tick(): void;
}

export function createTocThrottler(
	publish: () => void,
	opts?: { intervalMs?: number; now?: () => number },
): TocThrottler {
	const intervalMs = opts?.intervalMs ?? 500;
	const now = opts?.now ?? (() => performance.now());
	// 种子为创建时刻：head 补丁的同步发布刚发生过，首个批次天然落在间隔内。
	let last = now();
	return {
		tick() {
			const t = now();
			if (t - last < intervalMs) return;
			last = t;
			publish();
		},
	};
}
