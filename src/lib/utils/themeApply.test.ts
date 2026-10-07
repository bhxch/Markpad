// T6：data-theme / data-theme-mode / data-theme-scheme / data-code-theme
// 四属性唯一写者的行为测试。断言 scheme 态与 vscode 态的属性差异
// （vscode 态不设 data-theme-scheme 是 T7 双用途特异性修复的前提）。
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn(async () => []) }));

beforeEach(() => {
	vi.resetModules();
	localStorage.clear();
	const root = document.documentElement;
	root.removeAttribute('data-theme');
	root.removeAttribute('data-theme-mode');
	root.removeAttribute('data-theme-type');
	root.removeAttribute('data-theme-scheme');
	root.removeAttribute('data-code-theme');
});

const load = async () => {
	const mod = await import('../stores/slices/themeSettings.svelte.ts');
	const apply = await import('./themeApply.js');
	return { slice: mod.themeSettingsSlice, applyTheme: apply.applyTheme, install: apply.installSystemThemeWatcher };
};

describe('applyTheme 属性唯一写者（T6）', () => {
	it('scheme 态：设 data-theme=<mode>、data-theme-mode、data-theme-scheme、data-code-theme', async () => {
		const { slice, applyTheme } = await load();
		slice.setThemeScheme('one-dark');
		applyTheme();
		const root = document.documentElement;
		expect(root.getAttribute('data-theme')).toBe('dark');
		expect(root.getAttribute('data-theme-mode')).toBe('dark');
		expect(root.getAttribute('data-theme-scheme')).toBe('one-dark');
		expect(root.getAttribute('data-code-theme')).toBe('dark-modern');
	});

	it('vscode UI 态：data-theme=vscode、移除 data-theme-scheme（T7 双用途的特异性修复点）', async () => {
		const { slice, applyTheme } = await load();
		slice.setThemeScheme('one-dark'); // 先留下 scheme 残留属性
		slice.setVscodeUi('My Theme');
		applyTheme();
		const root = document.documentElement;
		expect(root.getAttribute('data-theme')).toBe('vscode');
		expect(root.hasAttribute('data-theme-scheme')).toBe(false);
	});

	it('vscode 态 data-theme-mode 取已发布的 data-theme-type（当前生效明暗）', async () => {
		const { slice, applyTheme } = await load();
		document.documentElement.setAttribute('data-theme-type', 'light');
		slice.setVscodeUi('Light Theme');
		applyTheme();
		expect(document.documentElement.getAttribute('data-theme-mode')).toBe('light');
	});

	it('浅色 scheme：data-theme=light、auto 代码主题解析为 light-modern', async () => {
		const { slice, applyTheme } = await load();
		slice.setThemeScheme('vue');
		applyTheme();
		const root = document.documentElement;
		expect(root.getAttribute('data-theme')).toBe('light');
		expect(root.getAttribute('data-theme-scheme')).toBe('vue');
		expect(root.getAttribute('data-code-theme')).toBe('light-modern');
	});
});

describe('installSystemThemeWatcher（T4）', () => {
	it('重复安装幂等，返回可用的退订函数', async () => {
		const { install } = await load();
		const dispose1 = install();
		const dispose2 = install();
		expect(typeof dispose1).toBe('function');
		expect(typeof dispose2).toBe('function');
		dispose1();
		dispose2();
		// 退订后再装是新的一次安装（disposer 已清空）。
		const dispose3 = install();
		expect(typeof dispose3).toBe('function');
		dispose3();
	});
});
