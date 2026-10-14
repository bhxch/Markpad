import { describe, expect, it } from 'vitest';
import { createTocThrottler } from './tocProgressivePublish.js';

describe('createTocThrottler（D37-2，spec 2026-10-13）', () => {
	it('间隔内的 tick 不发布，越过间隔发布一次', () => {
		let clock = 1000;
		let published = 0;
		const t = createTocThrottler(() => published++, { intervalMs: 500, now: () => clock });
		t.tick(); // 距种子(创建时刻=1000) 0ms < 500：不发布
		expect(published).toBe(0);
		clock = 1400;
		t.tick(); // 400ms < 500：不发布
		expect(published).toBe(0);
		clock = 1501;
		t.tick(); // 501ms ≥ 500：发布
		expect(published).toBe(1);
		clock = 1600;
		t.tick(); // 距上次发布 99ms：不发布
		expect(published).toBe(1);
	});

	it('持续 tick 在每个间隔最多发布一次（排空期间 TOC 扫描有界）', () => {
		let clock = 0;
		let published = 0;
		const t = createTocThrottler(() => published++, { intervalMs: 500, now: () => clock });
		for (let i = 0; i < 100; i++) {
			clock += 100; // 10s 内每 100ms 一次批次
			t.tick();
		}
		// 种子后每 500ms 至多一次：10s ≈ 20 次（首 tick 在 100ms < 500 不算）
		expect(published).toBeGreaterThanOrEqual(18);
		expect(published).toBeLessThanOrEqual(21);
	});
});
