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
	// C1 写穿用例 stub 过 matchMedia，逐用例回收防泄漏。
	vi.unstubAllGlobals();
});

describe('上游 theme effect 不回滚配色方案选择（T6-fix）', () => {
	// C1 写穿后语义更新：本地动作 setThemeScheme 回写 settings.theme（T4 跨重启成立），
	// theme effect 因此"按设计"重放一次（runs+1）；重放的 applyAppearanceTheme(新 theme)
	// 落 setMode(同明暗)，与用户选择一致——断言核心仍是"方案不被回滚"。
	it('上游 theme=light 时选暗色方案：mode/scheme 落地不被回弹，settings.theme 写穿', async () => {
		const host = await spawnHost();
		flushSync(); // 初始执行一次：theme=light → applyAppearanceTheme('light')
		expect(host.runs).toBe(1);
		expect(themeSettingsSlice.mode).toBe('light');

		// GUI 复现链：标题栏/设置页选 One Dark（方案即模式 → mode='dark'）
		themeSettingsSlice.setThemeScheme('one-dark');
		flushSync();

		// 未修复时：切片读被误追踪 → effect 重放后 applyAppearanceTheme('light')
		// →setMode('light') 把方案弹回浅色。C1 写穿使 effect 有意重放（runs=2），
		// 但重放收到的是写穿后的 'dark'，不回滚。
		expect(host.runs).toBe(2);
		expect(themeSettingsSlice.mode).toBe('dark');
		expect(themeSettingsSlice.currentSchemeId).toBe('one-dark');
		const root = document.documentElement;
		expect(root.getAttribute('data-theme-scheme')).toBe('one-dark');
		expect(root.getAttribute('data-theme-mode')).toBe('dark');
		// C1 写穿：本地动作同步回写上游 theme 字段（T4 手动选择跨重启成立的依据）。
		expect(settings.theme).toBe('dark');

	});

	it('上游 theme=dark 时选亮色方案：双向同理不回弹', async () => {
		settings.theme = 'dark';
		themeSettingsSlice.mode = 'dark'; // 持久化态：手动选择过的深色
		const host = await spawnHost();
		flushSync();
		expect(themeSettingsSlice.mode).toBe('dark');

		themeSettingsSlice.setThemeScheme('vue'); // 亮色方案 → mode='light'
		flushSync();

		expect(host.runs).toBe(2); // 写穿 theme='light' 后按设计重放
		expect(themeSettingsSlice.mode).toBe('light');
		expect(themeSettingsSlice.currentSchemeId).toBe('vue');
		expect(settings.theme).toBe('light');
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
		expect(settings.theme).toBe('vscode:Monokai Pro'); // C1 写穿

		themeSettingsSlice.setThemeScheme('one-dark');
		flushSync();

		// 写穿两次 theme 变更（vscode:X、dark）→ 重放 3 次；重放的 setMode('dark')
		// 与用户选择一致，不回滚方案、不把 uiThemeSource 拉回 vscode。
		expect(host.runs).toBe(3);
		expect(themeSettingsSlice.uiThemeSource).toBe('scheme');
		expect(themeSettingsSlice.currentSchemeId).toBe('one-dark');

	});
});

// C1：本地动作写穿 settings.theme 的状态机契约（store 在本文件 import 时构造、
// 构造器已接线写穿钩子；接线在 loadPersistedSettings 之后，恢复路径不写穿）。
describe('C1 写穿：本地动作同步回写 settings.theme', () => {
	it('setFollowSystem(true) → "system"；setFollowSystem(false) → 当前 mode', () => {
		themeSettingsSlice.setFollowSystem(true);
		expect(settings.theme).toBe('system');

		themeSettingsSlice.setFollowSystem(false);
		expect(settings.theme).toBe(themeSettingsSlice.mode);
		expect(['light', 'dark']).toContain(settings.theme);
	});

	it("setThemeScheme('one-dark') → 'dark'（按方案明暗写）", () => {
		themeSettingsSlice.setThemeScheme('one-dark');
		expect(settings.theme).toBe('dark');
	});

	it("setMode('light') → 'light'；setVscodeUi → 'vscode:<name>'", () => {
		themeSettingsSlice.setMode('light');
		expect(settings.theme).toBe('light');

		themeSettingsSlice.setVscodeUi('Ayu Dark');
		expect(settings.theme).toBe('vscode:Ayu Dark');
	});

	it('注册表 load 恢复路径不写穿（钩子接线于 loadPersistedSettings 之后）', async () => {
		const { writeStoredSetting, SettingsStore } = await import('../stores/settings.svelte.js');
		localStorage.clear();
		writeStoredSetting('theme', 'light');
		writeStoredSetting('theme.followSystem', 'true');
		vi.stubGlobal('matchMedia', () => ({
			matches: false,
			addEventListener: () => {},
			removeEventListener: () => {},
		}));
		const store = new SettingsStore();
		try {
			// 存量 load（followSystem=true 经 setFollowSystem 恢复）不得回写 theme 键：
			// 写穿只覆盖用户动作路径，持久化恢复以存量值为准。
			expect(store.theme).toBe('light');
			expect(localStorage.getItem('theme')).toBe('light');
			expect(store.themeFollowSystem).toBe(true);
		} finally {
			store.dispose();
			localStorage.clear();
		}
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
