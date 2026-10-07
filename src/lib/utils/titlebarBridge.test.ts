// T9: 右键手势（titlebarBridge.ts）的底层是 store 层 placement 变更。
// 本测试只覆盖 store 层边界：setTitlebarToolbarActionPlacement 生效、
// 持久化注册表登记 titlebar.toolbarPlacement；DOM 委托本身（closest/
// preventDefault 分支）不在其列，由 svelte-check 类型面与手动验证兜底。
// runes 模块只能在 vitest local-unit 轨编译，node:test/tsx 轨跑不了。
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn(async () => []) }));

beforeEach(() => {
	vi.resetModules();
	localStorage.clear();
});

const load = async () => await import('../stores/settings.svelte.ts');

describe('titlebarToolbar placement（T9 右键手势的底层）', () => {
	it('setTitlebarToolbarActionPlacement 变更后 placement 含该 id 新值，注册表登记 titlebar.toolbarPlacement', async () => {
		const { settings, createSettingsPersistence } = await load();

		// toc 默认在溢出菜单：右键移到栏上、再移回，都落在同一 setter 上。
		expect(settings.titlebarToolbarPlacement.toc).toBe('menu');
		settings.setTitlebarToolbarActionPlacement('toc', 'bar');
		expect(settings.titlebarToolbarPlacement.toc).toBe('bar');
		settings.setTitlebarToolbarActionPlacement('toc', 'menu');
		expect(settings.titlebarToolbarPlacement.toc).toBe('menu');

		// 右键手势与 Settings 页共用同一持久化注册表键。
		const keys = createSettingsPersistence().map((entry) => entry.key);
		expect(keys).toContain('titlebar.toolbarPlacement');
	});
});
