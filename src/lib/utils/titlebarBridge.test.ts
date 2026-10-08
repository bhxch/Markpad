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

// I1（spec 2026-10-07-theme-restore §Important-1）：T8 把 theme_scheme/code_theme
// 的默认 placement 从 menu 改 bar，存量用户表里两键仍是 'menu'——若不迁移，恢复
// 栏上常驻只对全新安装生效。存量表与旧默认表完全一致（= 未自定义过）时重置为新
// 默认；任意键偏离（真自定义过）则不动。
describe('I1: 存量 placement 一次性迁移', () => {
	const legacyPlacement = async () => {
		const { DEFAULT_TITLEBAR_TOOLBAR_PLACEMENT } = await import('./titlebarToolbar.js');
		const legacy: Record<string, string> = { ...DEFAULT_TITLEBAR_TOOLBAR_PLACEMENT };
		legacy.theme_scheme = 'menu';
		legacy.code_theme = 'menu';
		return legacy;
	};

	it('存量恰为旧默认表：重置为新默认（theme_scheme/code_theme 回 bar）', async () => {
		// 先 seed 后 import：settings 单例在模块求值时构造，构造顺序决定 load 所见。
		localStorage.setItem('titlebar.toolbarPlacement', JSON.stringify(await legacyPlacement()));

		const { settings } = await load();
		expect(settings.titlebarToolbarPlacement.theme_scheme).toBe('bar');
		expect(settings.titlebarToolbarPlacement.code_theme).toBe('bar');
	});

	it('用户自定义过（zen 偏离旧默认）：保持不动，theme 两键不重置', async () => {
		const customized = await legacyPlacement();
		customized.zen = 'bar'; // 唯一偏离：用户把 zen（默认 menu）移上了栏
		localStorage.setItem('titlebar.toolbarPlacement', JSON.stringify(customized));

		const { settings } = await load();
		expect(settings.titlebarToolbarPlacement.zen).toBe('bar');
		expect(settings.titlebarToolbarPlacement.theme_scheme).toBe('menu');
		expect(settings.titlebarToolbarPlacement.code_theme).toBe('menu');
	});

	it('空存量（键不存在）：默认表（theme 两键本就 bar）', async () => {
		const { DEFAULT_TITLEBAR_TOOLBAR_PLACEMENT } = await import('./titlebarToolbar.js');
		const { settings } = await load();
		expect(settings.titlebarToolbarPlacement).toEqual(DEFAULT_TITLEBAR_TOOLBAR_PLACEMENT);
	});
});

// D20（spec 2026-10-09-titlebar-placement-migration-marker-design）：I1 的内容
// 全等判定分不清"存量未自定义"与"真实自定义恰与旧默认表全等"——用户把
// theme_scheme/code_theme 右键移回 menu 后，净表与旧默认表逐键全等，无标记时
// 每次启动都被误重置（实测复现：重启即回栏上）。迁移机会一次性化：首次评估后
// 落标记键，此后以标记为准，内容判定不再参与。
describe('I1b: 迁移一次性化（D20 迁移标记）', () => {
	const legacyPlacement = async () => {
		const { DEFAULT_TITLEBAR_TOOLBAR_PLACEMENT } = await import('./titlebarToolbar.js');
		const legacy: Record<string, string> = { ...DEFAULT_TITLEBAR_TOOLBAR_PLACEMENT };
		legacy.theme_scheme = 'menu';
		legacy.code_theme = 'menu';
		return legacy;
	};

	it('首次评估（无标记）仍按内容迁移：旧默认表重置为新默认，并落迁移标记', async () => {
		localStorage.setItem('titlebar.toolbarPlacement', JSON.stringify(await legacyPlacement()));

		const { settings } = await load();
		expect(settings.titlebarToolbarPlacement.theme_scheme).toBe('bar');
		expect(settings.titlebarToolbarPlacement.code_theme).toBe('bar');
		expect(localStorage.getItem('titlebar.placementMigrated')).toBe('true');
	});

	it('标记已存在：与旧默认表全等的真实自定义不再被重置（theme 两键保持在 menu）', async () => {
		localStorage.setItem('titlebar.toolbarPlacement', JSON.stringify(await legacyPlacement()));
		localStorage.setItem('titlebar.placementMigrated', 'true');

		const { settings } = await load();
		expect(settings.titlebarToolbarPlacement.theme_scheme).toBe('menu');
		expect(settings.titlebarToolbarPlacement.code_theme).toBe('menu');
	});

	it('非旧默认的自定义同样消耗一次性机会：评估后落标记', async () => {
		const customized = await legacyPlacement();
		customized.zen = 'bar';
		localStorage.setItem('titlebar.toolbarPlacement', JSON.stringify(customized));

		const { settings } = await load();
		expect(settings.titlebarToolbarPlacement.zen).toBe('bar');
		expect(localStorage.getItem('titlebar.placementMigrated')).toBe('true');
	});
});
