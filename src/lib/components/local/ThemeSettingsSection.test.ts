// T11：设置页主题配置区（ThemeSettingsSection）组件直测。
// 仓库此前无组件测试轨：这里用 Svelte 5 `mount` API + happy-dom 直测 DOM
// （local-unit 轨，svelte() 插件编译 .svelte）；`@tauri-apps/api/core` 照
// themeApply/titlebarBridge 测试头注范式 mock（settings store 构造与组件
// 的 get_saved_vscode_themes 都走它）。
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { themeSettingsSlice } from '../../stores/slices/themeSettings.svelte.js';
import ThemeSettingsSection from './ThemeSettingsSection.svelte';

// local-unit 轨没有 browser resolve 条件，`import('svelte')` 会落到 server 入口
// （mount 报 lifecycle_function_unavailable）。该轨 svelte 走 Node 原生加载
// （externalize），用文件 URL 直连客户端入口拿到的 mount/unmount/flushSync 与
// 组件编译产物引用的 svelte/internal/client 属同一模块实例（探针已证两处
// flushSync 恒等）；unmount/flushSync 不经 'svelte/internal/client' 具名导入
// 是因其无类型声明，会挂 svelte-check。
const svelteClient = (await import(
	pathToFileURL(resolve(process.cwd(), 'node_modules/svelte/src/index-client.js')).href
)) as {
	mount: (component: unknown, options: { target: Element }) => Record<string, unknown>;
	unmount: (instance: Record<string, unknown>) => unknown;
	flushSync: () => void;
};
const { mount, unmount, flushSync } = svelteClient;

const { invokeMock } = vi.hoisted(() => ({
	invokeMock: vi.fn<(cmd: string, args?: unknown) => Promise<unknown>>(async () => [])
}));
vi.mock('@tauri-apps/api/core', () => ({ invoke: invokeMock }));

// 切片是全局单例，组件测试直接读写它做双向断言；每个用例前回默认态，
// 避免上个用例的 setThemeScheme（含退跟随/mode 变更）串场。
beforeEach(() => {
	invokeMock.mockReset();
	invokeMock.mockImplementation(async () => []);
	localStorage.clear();
	themeSettingsSlice.mode = 'dark';
	themeSettingsSlice.themeSchemes = { light: 'github-light', dark: 'github-dark' };
	themeSettingsSlice.codeThemesByMode = { light: 'auto', dark: 'auto' };
	themeSettingsSlice.followSystem = false;
	themeSettingsSlice.uiThemeSource = 'scheme';
});

let instance: Record<string, unknown> | null = null;
let container: HTMLDivElement | null = null;

const mountComponent = () => {
	container = document.createElement('div');
	document.body.appendChild(container);
	instance = mount(ThemeSettingsSection, { target: container });
	flushSync(); // 挂载即跑 $effect（拉取 VSCode 主题列表），先同步冲一遍
};

afterEach(() => {
	if (instance) unmount(instance);
	instance = null;
	container?.remove();
	container = null;
});

const schemeSelect = () => document.querySelector<HTMLSelectElement>('select[data-testid="scheme-select"]');
const codeSelect = () => document.querySelector<HTMLSelectElement>('select[data-testid="code-select"]');
const followCheckbox = () => document.querySelector<HTMLInputElement>('input[data-testid="follow-system"]');

describe('ThemeSettingsSection（T11 设置页主题配置区）', () => {
	it('渲染 7 个配色方案选项且当前生效项 selected', () => {
		themeSettingsSlice.setThemeScheme('one-dark'); // 方案即模式：one-dark → dark 槽生效
		mountComponent();

		const options = schemeSelect()!.querySelectorAll('option');
		expect(options.length).toBe(7);
		expect(schemeSelect()!.value).toBe('one-dark');
		// 选项 value 来自 7 方案表（settings.themes 透传），抽验首尾两条
		expect(options[0].value).toBe('github-light');
		expect(options[6]!.value).toBe('solarized-dark');
	});

	it('切换配色方案下拉走 setThemeScheme（写入槽位并退跟随系统）', () => {
		themeSettingsSlice.setFollowSystem(true); // 先制造"跟随中"状态
		mountComponent();

		const select = schemeSelect()!;
		select.value = 'monokai';
		select.dispatchEvent(new Event('change', { bubbles: true }));

		expect(themeSettingsSlice.themeSchemes[themeSettingsSlice.mode]).toBe('monokai');
		expect(themeSettingsSlice.mode).toBe('dark');
		expect(themeSettingsSlice.followSystem).toBe(false); // 手动选方案即退出跟随
	});

	it('切换代码主题下拉写入当前模式槽', () => {
		mountComponent();

		const select = codeSelect()!;
		expect(select.value).toBe(themeSettingsSlice.currentCodeTheme); // 初始绑定：'auto'
		expect(select.querySelectorAll('option').length).toBe(3); // 静态 3 项（VSCode 分组空则不渲染）

		select.value = 'dark-modern';
		select.dispatchEvent(new Event('change', { bubbles: true }));
		expect(themeSettingsSlice.codeThemesByMode[themeSettingsSlice.mode]).toBe('dark-modern');
	});

	it('跟随系统开关驱动 setFollowSystem', () => {
		mountComponent();

		const checkbox = followCheckbox()!;
		expect(checkbox.checked).toBe(false);

		checkbox.checked = true;
		checkbox.dispatchEvent(new Event('change', { bubbles: true }));
		expect(themeSettingsSlice.followSystem).toBe(true);
		// 开启后按 happy-dom 缺省系统偏好（非 dark）落浅色槽
		expect(themeSettingsSlice.mode).toBe('light');

		checkbox.checked = false;
		checkbox.dispatchEvent(new Event('change', { bubbles: true }));
		expect(themeSettingsSlice.followSystem).toBe(false);
	});

	it('已导入的 VSCode 代码主题渲染进 optgroup，value 带 vscode: 前缀', async () => {
		invokeMock.mockImplementation(async (cmd: string) =>
			cmd === 'get_saved_vscode_themes' ? ['Nostalgia'] : []
		);
		mountComponent();

		await new Promise((r) => setTimeout(r, 0)); // 等 invoke promise 落地
		flushSync();

		const opt = codeSelect()!.querySelector<HTMLOptionElement>('optgroup option[value="vscode:Nostalgia"]');
		expect(opt).not.toBeNull();
		expect(opt!.textContent).toBe('Nostalgia');
	});
});
