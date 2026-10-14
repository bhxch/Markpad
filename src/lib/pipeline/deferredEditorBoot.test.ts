import { describe, expect, it } from 'vitest';
import { bootEditorWhenIdle } from './deferredEditorBoot.js';

type Cancel = () => void;

/** 手摇调度器：记录回调，测试手动触发。 */
function manualScheduler() {
	const pending: Array<{ cb: () => void; cancel: Cancel }> = [];
	const schedule = (cb: () => void): Cancel => {
		const entry = { cb, cancel: () => {
			const i = pending.indexOf(entry);
			if (i >= 0) pending.splice(i, 1);
		} };
		pending.push(entry);
		return entry.cancel;
	};
	return {
		schedule,
		fire(index: number) {
			const entry = pending[index];
			if (!entry) throw new Error('nothing at ' + index);
			entry.cancel();
			entry.cb();
		},
		get size() {
			return pending.length;
		},
	};
}

describe('bootEditorWhenIdle（D37-1，spec 2026-10-13）', () => {
	it('双 rAF 后进入 idle，idle 回调启动编辑器并传递 teardown', () => {
		const raf = manualScheduler();
		const idle = manualScheduler();
		let created = 0;
		let tornDown = 0;
		const cancel = bootEditorWhenIdle(() => {
			created++;
			return () => tornDown++;
		}, {
			raf: (cb) => raf.schedule(cb),
			idle: (cb) => idle.schedule(cb),
		});
		expect(created).toBe(0);
		raf.fire(0); // 第一帧
		expect(idle.size).toBe(0); // 还差一帧
		raf.fire(0); // 第二帧 → 排 idle
		expect(idle.size).toBe(1);
		idle.fire(0);
		expect(created).toBe(1);
		cancel(); // 启动后的 cancel = 编辑器 teardown
		expect(tornDown).toBe(1);
	});

	it('启动前 cancel：create 永不执行，挂起的调度被撤销', () => {
		const raf = manualScheduler();
		const idle = manualScheduler();
		let created = 0;
		const cancel = bootEditorWhenIdle(() => {
			created++;
			return () => {};
		}, {
			raf: (cb) => raf.schedule(cb),
			idle: (cb) => idle.schedule(cb),
		});
		raf.fire(0);
		raf.fire(0);
		expect(idle.size).toBe(1);
		cancel();
		expect(idle.size).toBe(0); // 挂起 idle 被撤销
		expect(raf.size).toBe(0); // 无残留 rAF 回调
		expect(created).toBe(0);
	});

	it('用户输入抢占：pointerdown 立即启动，挂起 idle 被撤销', () => {
		const raf = manualScheduler();
		const idle = manualScheduler();
		const preemptEvents: Array<() => void> = [];
		let preemptCb: ((ev: Event) => void) | null = null;
		let preemptDetached = false;
		let created = 0;
		const cancel = bootEditorWhenIdle(() => {
			created++;
			return () => {};
		}, {
			raf: (cb) => raf.schedule(cb),
			idle: (cb) => idle.schedule(cb),
			preempt: (cb) => {
				preemptCb = cb;
				preemptEvents.push(() => {
					if (!preemptDetached && preemptCb) preemptCb(new Event('pointerdown'));
				});
				return () => {
					preemptDetached = true;
				};
			},
		});
		expect(preemptCb).not.toBeNull();
		raf.fire(0);
		raf.fire(0);
		expect(created).toBe(0);
		preemptEvents[0]();
		expect(created).toBe(1);
		expect(idle.size).toBe(0); // 挂起 idle 被撤销
		preemptEvents[0](); // 启动后监听已摘除（detached），不再重复启动
		expect(created).toBe(1);
		cancel();
		expect(preemptDetached).toBe(true);
	});

	it('idle 平台兜底：idle 调度返回的撤销在启动后被调用', () => {
		const raf = manualScheduler();
		const idle = manualScheduler();
		let created = 0;
		const cancel = bootEditorWhenIdle(() => {
			created++;
			return () => {};
		}, {
			raf: (cb) => raf.schedule(cb),
			idle: (cb) => idle.schedule(cb),
		});
		raf.fire(0);
		raf.fire(0);
		idle.fire(0);
		expect(created).toBe(1);
		// 启动后 raf/idle 队列应已清空（幂等，不会二次启动）
		expect(raf.size).toBe(0);
		expect(idle.size).toBe(0);
		cancel();
		expect(created).toBe(1);
	});
});
