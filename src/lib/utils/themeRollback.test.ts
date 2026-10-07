// T6-fix（GUI 实测缺陷防回归）：上游 theme effect 误追踪主题切片 → 选配色方案
// 被"回弹"到陈旧 settings.theme（上游 theme=light 选暗色方案弹回 light，反向同理；
// VSCode 主题激活时选方案 uiThemeSource 被拉回 vscode）。
//
// 构造（真实咬合，非 mock 重放）：themeRollback.host.svelte.ts 以 $effect.root 复刻
// MarkdownViewer.svelte 上游 theme effect 的确切形态——effect 读 settings.theme 并调
// syncMermaidTheme + applyAppearanceTheme（两者内部读 themeSettingsSlice 响应式状态，
// themeApply.applyTheme 还会写切片）——然后 flushSync 后 setThemeScheme('one-dark')
// （方案即模式：写 mode+scheme 槽）再 flush，断言 data-theme-scheme/mode 落为
// one-dark/dark 且 effect 未重放（未被陈旧 settings.theme 回滚）。
import { describe, it, expect, beforeEach, afterEach, beforeAll, vi } from 'vitest';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

// local-unit 轨没有 browser resolve 条件，`import('svelte')` 落 server 入口
// （其 untrack 是无抑制力的透传、flushSync 报 lifecycle_function_unavailable）。
// 用文件 URL 直连客户端入口，与编译产物引用的 svelte/internal/client 同一模块
// 实例（范式沿 ThemeSettingsSection.test.ts）。在 beforeAll 懒加载而非模块级
// TLA：模块级顶层 await 会把测试文件求值挂起，期间（store 构造 effect 的）
// 动态导入会被模块运行器按在途环提前兑现部分命名空间，diagrams 模块体不执行
// 落入永久 TDZ（实测）。
let untrack: <T>(fn: () => T) => T;
let flushSync: () => void;

const { invokeMock, initializeSpy } = vi.hoisted(() => ({
	invokeMock: vi.fn<(cmd: string, args?: unknown) => Promise<unknown>>(async () => []),
	// mermaid initialize 间谍：applyTheme→syncMermaidTheme 显式补偿链的证据。
	initializeSpy: vi.fn()
}));
vi.mock('@tauri-apps/api/core', () => ({ invoke: invokeMock }));
// mermaid 只在 ensureMermaidInitialized 显式调用时才 import；mock 真实包，
// 使 syncMermaidTheme 能真实走到 initialize 分支（getMermaid() 非 null）。
vi.mock('mermaid', () => ({
	default: { initialize: initializeSpy, render: vi.fn(async () => ({ svg: '' })) }
}));

import { settings } from '../stores/settings.svelte.js';
import { themeSettingsSlice } from '../stores/slices/themeSettings.svelte.js';

beforeEach(() => {
	invokeMock.mockReset();
	invokeMock.mockImplementation(async () => []);
	initializeSpy.mockClear();
	localStorage.clear();
	// 切片是全局单例，逐用例回默认态，避免上一用例的方案选择串场。
	settings.theme = 'light';
	themeSettingsSlice.mode = 'light';
	themeSettingsSlice.themeSchemes = { light: 'github-light', dark: 'github-dark' };
	themeSettingsSlice.codeThemesByMode = { light: 'auto', dark: 'auto' };
	themeSettingsSlice.followSystem = false;
	themeSettingsSlice.uiThemeSource = 'scheme';
	const root = document.documentElement;
	for (const attr of ['data-theme', 'data-theme-mode', 'data-theme-type', 'data-theme-scheme', 'data-code-theme']) {
		root.removeAttribute(attr);
	}
});

const tick = () => new Promise((r) => setTimeout(r, 0));

beforeAll(async () => {
	const client = (await import(
		pathToFileURL(resolve(process.cwd(), 'node_modules/svelte/src/index-client.js')).href
	)) as { untrack: <T>(fn: () => T) => T; flushSync: () => void };
	untrack = client.untrack;
	flushSync = client.flushSync;
});

// host 生命周期：断言失败会跳过用例内的 dispose，未销毁的 effect（携带被追踪的
// 切片读）会泄漏进后续用例——flush 时重放并污染 mermaid 间谍。统一在 afterEach 回收。
import type { ThemeEffectHost } from './themeRollback.host.svelte.js';
const liveHosts: ThemeEffectHost[] = [];
const spawnHost = async () => {
	const { createThemeEffectHost } = await import('./themeRollback.host.svelte.ts');
	const host = createThemeEffectHost(untrack);
	liveHosts.push(host);
	return host;
};

afterEach(() => {
	for (const host of liveHosts) host.dispose();
	liveHosts.length = 0;
});

describe('上游 theme effect 不回滚配色方案选择（T6-fix）', () => {
	it('上游 theme=light 时选暗色方案：mode/scheme 落地不被回弹，effect 不重放', async () => {
		const host = await spawnHost();
		flushSync(); // 初始执行一次：theme=light → applyAppearanceTheme('light')
		expect(host.runs).toBe(1);
		expect(themeSettingsSlice.mode).toBe('light');

		// GUI 复现链：标题栏/设置页选 One Dark（方案即模式 → mode='dark'）
		themeSettingsSlice.setThemeScheme('one-dark');
		flushSync();

		// 未修复时：切片读被误追踪 → effect 重放（runs=2）→
		// applyAppearanceTheme('light')→setMode('light') 把方案弹回浅色。
		expect(host.runs).toBe(1);
		expect(themeSettingsSlice.mode).toBe('dark');
		expect(themeSettingsSlice.currentSchemeId).toBe('one-dark');
		const root = document.documentElement;
		expect(root.getAttribute('data-theme-scheme')).toBe('one-dark');
		expect(root.getAttribute('data-theme-mode')).toBe('dark');
		// 上游下拉的选择本身不被修复路径改动。
		expect(settings.theme).toBe('light');

	});

	it('上游 theme=dark 时选亮色方案：双向同理不回弹', async () => {
		settings.theme = 'dark';
		const host = await spawnHost();
		flushSync();
		expect(themeSettingsSlice.mode).toBe('dark'); // applyAppearanceTheme('dark')

		themeSettingsSlice.setThemeScheme('vue'); // 亮色方案 → mode='light'
		flushSync();

		expect(host.runs).toBe(1);
		expect(themeSettingsSlice.mode).toBe('light');
		expect(themeSettingsSlice.currentSchemeId).toBe('vue');
		const root = document.documentElement;
		expect(root.getAttribute('data-theme-scheme')).toBe('vue');
		expect(root.getAttribute('data-theme-mode')).toBe('light');

	});

	it('VSCode UI 主题激活时选方案：uiThemeSource 退回 scheme 且不被拉回 vscode', async () => {
		const host = await spawnHost();
		flushSync();

		themeSettingsSlice.setVscodeUi('Monokai Pro');
		flushSync();
		expect(themeSettingsSlice.uiThemeSource).toBe('vscode');

		themeSettingsSlice.setThemeScheme('one-dark');
		flushSync();

		expect(host.runs).toBe(1);
		expect(themeSettingsSlice.uiThemeSource).toBe('scheme');
		expect(themeSettingsSlice.currentSchemeId).toBe('one-dark');

	});
});

describe('applyTheme→syncMermaidTheme 显式补偿链（T6-fix）', () => {
	it('任一切片主题态变化重放 applyTheme 后，mermaid 单例配置随属性同步刷新', async () => {
		const { applyTheme } = await import('./themeApply.js');
		const { ensureMermaidInitialized, getMermaid } = await import('../pipeline/diagrams.js');
		await ensureMermaidInitialized(); // 预载单例（真实 app 由 onMount 承担）
		expect(getMermaid()).not.toBeNull();
		initializeSpy.mockClear(); // 只看后续重放的再同步

		themeSettingsSlice.setThemeScheme('one-dark'); // 方案即模式 → dark
		applyTheme(); // settings store 的 applyTheme effect 在切片变化时重放到这里
		await tick(); // 钩子同步执行；tick 只为隔离 store effect 的异步 flush

		expect(initializeSpy).toHaveBeenCalled();
		const config = initializeSpy.mock.calls.at(-1)?.[0] as { theme?: string } | undefined;
		expect(config?.theme).toBe('dark'); // 暗色方案 → mermaid 'dark'

		// 再切亮色方案：同链路取到 'default'（mermaid 浅色词汇）
		themeSettingsSlice.setThemeScheme('vue');
		applyTheme();
		await tick();
		const config2 = initializeSpy.mock.calls.at(-1)?.[0] as { theme?: string } | undefined;
		expect(config2?.theme).toBe('default');
	});
});
