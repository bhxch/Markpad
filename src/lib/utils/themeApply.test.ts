// T6：data-theme / data-theme-mode / data-theme-scheme / data-code-theme
// 四属性唯一写者的行为测试。断言 scheme 态与 vscode 态的属性差异
// （vscode 态不设 data-theme-scheme 是 T7 双用途特异性修复的前提）。
import { describe, it, expect, beforeEach, vi } from 'vitest';

// T7：mock 实例经 vi.hoisted 提升共享，各测试可改写 invoke 分支实现
// （默认返回 []，保持 T6 既有用例不受影响）。
const { invokeMock } = vi.hoisted(() => ({
	invokeMock: vi.fn<(cmd: string, args?: unknown) => Promise<unknown>>(async () => [])
}));
vi.mock('@tauri-apps/api/core', () => ({ invoke: invokeMock }));

beforeEach(() => {
	vi.resetModules();
	invokeMock.mockReset();
	invokeMock.mockImplementation(async () => []);
	document.head
		.querySelectorAll('style[id^="ts-vscode-theme-"]')
		.forEach((el) => el.remove());
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
		// T6 收编后由 themeApply 同步发布（currentMermaidTheme 的 system 判定消费）。
		expect(root.getAttribute('data-theme-type')).toBe('dark');
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

describe('applyAppearanceTheme 上游下拉语义化（T5）', () => {
	// C1：以下均模拟"启动阶段结束后的用户动作"——先 markHydrated 推进过首播恢复槽。
	it("light/dark：应用对应槽位方案并退出跟随", async () => {
		const { applyAppearanceTheme, markHydrated } = await import('./themeBridge.js');
		const { themeSettingsSlice } = await import('../stores/slices/themeSettings.svelte.js');
		markHydrated();
		themeSettingsSlice.setFollowSystem(true);
		applyAppearanceTheme('light');
		expect(themeSettingsSlice.followSystem).toBe(false);
		expect(themeSettingsSlice.mode).toBe('light');
		expect(themeSettingsSlice.currentSchemeId).toBe('github-light');
	});
	it('system：开启跟随', async () => {
		const { applyAppearanceTheme, markHydrated } = await import('./themeBridge.js');
		const { themeSettingsSlice } = await import('../stores/slices/themeSettings.svelte.js');
		markHydrated();
		applyAppearanceTheme('system');
		expect(themeSettingsSlice.followSystem).toBe(true);
	});
	it('vscode:<name>：uiThemeSource 切 vscode', async () => {
		const { applyAppearanceTheme, markHydrated } = await import('./themeBridge.js');
		const { themeSettingsSlice } = await import('../stores/slices/themeSettings.svelte.js');
		markHydrated();
		applyAppearanceTheme('vscode:Monokai Pro');
		expect(themeSettingsSlice.uiThemeSource).toBe('vscode');
		expect(themeSettingsSlice.vscodeUiName).toBe('Monokai Pro');
	});
	it('vscode 激活态下 system：退 uiThemeSource←scheme 且开启跟随（T5/T7 裁定）', async () => {
		const { applyAppearanceTheme, markHydrated } = await import('./themeBridge.js');
		const { themeSettingsSlice } = await import('../stores/slices/themeSettings.svelte.js');
		markHydrated();
		applyAppearanceTheme('vscode:Monokai Pro');
		applyAppearanceTheme('system');
		expect(themeSettingsSlice.uiThemeSource).toBe('scheme');
		expect(themeSettingsSlice.followSystem).toBe(true);
	});
});

// C1（spec 2026-10-07-theme-restore §Critical-1）：启动重放不得改写用户状态。
// 持久化的 settings.theme 在每次重启都被 MarkdownViewer 的 theme effect 重放
// （theme='system' 时旧实现 setFollowSystem(true) 强制开跟随并把 mode 拉回系统值），
// T4"手动选择退出跟随"的裁决因此跨重启失效。恢复语义：hydrate 前的重放只落 DOM
// 属性（applyTheme），不改切片状态；首播完成后自推进 hydrate，其后是真实用户动作。
describe('applyAppearanceTheme 启动恢复语义（C1）', () => {
	it('未 hydrate 首播 system：不强制开跟随、mode 保持持久化值，DOM 按切片落', async () => {
		const { applyAppearanceTheme } = await import('./themeBridge.js');
		const { themeSettingsSlice } = await import('../stores/slices/themeSettings.svelte.js');
		// 模拟注册表 load 后的持久化切片状态：用户手动选过方案（退出跟随 T4）、深色。
		themeSettingsSlice.followSystem = false;
		themeSettingsSlice.mode = 'dark';
		themeSettingsSlice.themeSchemes = { light: 'github-light', dark: 'one-dark' };

		applyAppearanceTheme('system'); // 重启重放 settings.theme='system'

		expect(themeSettingsSlice.followSystem).toBe(false);
		expect(themeSettingsSlice.mode).toBe('dark');
		const root = document.documentElement;
		expect(root.getAttribute('data-theme')).toBe('dark');
		expect(root.getAttribute('data-theme-mode')).toBe('dark');
		expect(root.getAttribute('data-theme-scheme')).toBe('one-dark');
	});

	it('未 hydrate 首播 light/dark：不调 setMode，mode 以持久化值为准', async () => {
		const { applyAppearanceTheme } = await import('./themeBridge.js');
		const { themeSettingsSlice } = await import('../stores/slices/themeSettings.svelte.js');
		themeSettingsSlice.followSystem = true;
		themeSettingsSlice.mode = 'dark';

		applyAppearanceTheme('light'); // 陈旧 settings.theme='light' 的重启重放

		expect(themeSettingsSlice.followSystem).toBe(true); // 跟随状态不被重放推翻
		expect(themeSettingsSlice.mode).toBe('dark');
		expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
	});

	it('首播恢复完成后自推进 hydrate：后续 system 走用户语义（现状行为）', async () => {
		const { applyAppearanceTheme } = await import('./themeBridge.js');
		const { themeSettingsSlice } = await import('../stores/slices/themeSettings.svelte.js');
		applyAppearanceTheme('light'); // 首播（恢复语义，消费 hydrate 槽）

		themeSettingsSlice.followSystem = false;
		applyAppearanceTheme('system'); // 真实用户动作

		expect(themeSettingsSlice.followSystem).toBe(true);
	});

	it('markHydrated 显式推进后：system 走断言语义（现状行为）', async () => {
		const { applyAppearanceTheme, markHydrated } = await import('./themeBridge.js');
		const { themeSettingsSlice } = await import('../stores/slices/themeSettings.svelte.js');
		markHydrated();
		applyAppearanceTheme('system');
		expect(themeSettingsSlice.followSystem).toBe(true);
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

describe('buildVscodeCodeThemeStyle（T7）', () => {
	it('由 tokenColors 生成 --ts-* 注入，未命中 token 回落当前主题（不产空变量）', async () => {
		invokeMock.mockImplementation(async (cmd: string) =>
			cmd === 'read_vscode_theme'
				? JSON.stringify({
						name: 'Test',
						type: 'dark',
						tokenColors: [
							{ scope: ['comment'], settings: { foreground: '#ABCDEF', fontStyle: 'italic' } },
							{ scope: ['keyword'], settings: { foreground: '#123456' } },
							{ scope: ['string'], settings: { foreground: '#654321' } }
						]
					})
				: '[]'
		);
		const { buildVscodeCodeThemeStyle } = await import('./themeApply.js');
		const style = await buildVscodeCodeThemeStyle('Test');
		expect(style).toContain(':root[data-code-theme="vscode:Test"]');
		expect(style.startsWith(':root')).toBe(true); // 裸规则文本（C1：不含 <style> 包裹）
		expect(style).not.toContain('<style');
		expect(style).toMatch(/--ts-comment:\s*#ABCDEF/i);
		expect(style).toMatch(/--ts-keyword:\s*#123456/i);
		expect(style).toContain('font-style: italic'); // fontStyle 保留
	});

	it('tokenColors 全不命中映射时返回空串（CSS 回落当前主题）', async () => {
		invokeMock.mockImplementation(async (cmd: string) =>
			cmd === 'read_vscode_theme'
				? JSON.stringify({
						tokenColors: [{ scope: 'editor.foreground', settings: { foreground: '#FFFFFF' } }]
					})
				: '[]'
		);
		const { buildVscodeCodeThemeStyle } = await import('./themeApply.js');
		await expect(buildVscodeCodeThemeStyle('NoHit')).resolves.toBe('');
	});

	it('invoke 失败或 JSON 损坏时返回空串不抛错', async () => {
		const { buildVscodeCodeThemeStyle } = await import('./themeApply.js');
		invokeMock.mockImplementation(async () => {
			throw new Error('boom');
		});
		await expect(buildVscodeCodeThemeStyle('Broken')).resolves.toBe('');
		invokeMock.mockImplementation(async () => 'not json');
		await expect(buildVscodeCodeThemeStyle('Broken')).resolves.toBe('');
	});

	it('泛 scope 回退：仅泛化 scope 时 keyword-control/string-regexp 取泛色（逼近 TextMate 祖先继承）', async () => {
		invokeMock.mockImplementation(async (cmd: string) =>
			cmd === 'read_vscode_theme'
				? JSON.stringify({
						tokenColors: [
							{ scope: 'keyword', settings: { foreground: '#020002' } },
							{ scope: 'string', settings: { foreground: '#020004' } }
						]
					})
				: '[]'
		);
		const { buildVscodeCodeThemeStyle } = await import('./themeApply.js');
		const style = await buildVscodeCodeThemeStyle('Generic');
		expect(style).toMatch(/--ts-keyword-control:\s*#020002/i);
		expect(style).toMatch(/--ts-string-regexp:\s*#020004/i);
	});

	it('映射覆盖 styles.css --ts-* 变量全集（27 个，一个不多一个不少）', async () => {
		// 规则按具体 scope 在前、泛 scope 在后排列（与真实 .vsix 的排列惯例一致，
		// 也让泛回退候选不被泛规则截胡：keyword.control/keyword、string.regexp/string）。
		const rules: { scope: string[]; settings: { foreground: string } }[] = [
			{ scope: ['constant.language.boolean'], settings: { foreground: '#010016' } },
			{ scope: ['variable.language'], settings: { foreground: '#010017' } },
			{ scope: ['constant.language'], settings: { foreground: '#010015' } },
			{ scope: ['comment'], settings: { foreground: '#010001' } },
			{ scope: ['keyword.control'], settings: { foreground: '#010003' } },
			{ scope: ['keyword'], settings: { foreground: '#010002' } },
			{ scope: ['string.regexp'], settings: { foreground: '#010005' } },
			{ scope: ['string'], settings: { foreground: '#010004' } },
			{ scope: ['constant.numeric'], settings: { foreground: '#010006' } },
			{ scope: ['constant'], settings: { foreground: '#010007' } },
			{ scope: ['entity.name.type'], settings: { foreground: '#010008' } },
			{ scope: ['support.type'], settings: { foreground: '#010009' } },
			{ scope: ['entity.name.function.method'], settings: { foreground: '#010010' } },
			{ scope: ['entity.name.function.macro'], settings: { foreground: '#010011' } },
			{ scope: ['entity.name.function.constructor'], settings: { foreground: '#010012' } },
			{ scope: ['entity.name.function'], settings: { foreground: '#010013' } },
			{ scope: ['support.function'], settings: { foreground: '#010014' } },
			{ scope: ['variable'], settings: { foreground: '#010018' } },
			{ scope: ['variable.parameter'], settings: { foreground: '#010019' } },
			{ scope: ['variable.other.property'], settings: { foreground: '#010020' } },
			{ scope: ['keyword.operator'], settings: { foreground: '#010021' } },
			{ scope: ['punctuation.definition.bracket'], settings: { foreground: '#010022' } },
			{ scope: ['punctuation'], settings: { foreground: '#010023' } },
			{ scope: ['entity.name.namespace'], settings: { foreground: '#010024' } },
			{ scope: ['entity.name.tag'], settings: { foreground: '#010025' } },
			{ scope: ['entity.other.attribute-name'], settings: { foreground: '#010026' } },
			{ scope: ['constant.character.escape'], settings: { foreground: '#010027' } }
		];
		invokeMock.mockImplementation(async (cmd: string) =>
			cmd === 'read_vscode_theme' ? JSON.stringify({ tokenColors: rules }) : '[]'
		);
		const { buildVscodeCodeThemeStyle } = await import('./themeApply.js');
		const style = await buildVscodeCodeThemeStyle('Full');
		const found = new Set(style.match(/--ts-[a-z-]+/g) ?? []);
		expect(found.size).toBe(27);
	});
});

describe('applyTheme 的 vscode 代码主题注入（T7）', () => {
	const tick = () => new Promise((r) => setTimeout(r, 0));
	const injected = () => document.head.querySelectorAll('style[id^="ts-vscode-theme-"]');

	it('codeTheme 为 vscode:<name> 时 fire-and-forget 挂载 style 标签且幂等', async () => {
		invokeMock.mockImplementation(async (cmd: string) =>
			cmd === 'read_vscode_theme'
				? JSON.stringify({
						tokenColors: [{ scope: 'comment', settings: { foreground: '#ABCDEF' } }]
					})
				: '[]'
		);
		const { slice, applyTheme } = await load();
		slice.setCodeTheme('vscode:Test');
		applyTheme();
		await tick();
		const id = 'ts-vscode-theme-vscode:Test';
		const el = document.getElementById(id);
		expect(el).not.toBeNull();
		expect(el?.innerHTML).toContain('--ts-comment: #ABCDEF');
		// CSSOM 级防回归（C1）：双重 <style> 包裹会让样式表首条规则的
		// selectorText 变成 '<style>:root…'（以 '<' 开头非法、整条规则被浏览器
		// 丢弃），而字符串包含断言对此免疫——故必须断言规则真实可解析。
		const sheet = (el as HTMLStyleElement | null)?.sheet as CSSStyleSheet | null | undefined;
		const first = sheet?.cssRules?.[0] as CSSStyleRule | undefined;
		expect(first?.selectorText).toBe(':root[data-code-theme="vscode:Test"]');
		expect(document.documentElement.getAttribute('data-code-theme')).toBe('vscode:Test');
		// 再次 applyTheme 不重复插入。
		applyTheme();
		await tick();
		expect(injected()).toHaveLength(1);
	});

	it('codeTheme 非 vscode 形态时不注入', async () => {
		const { slice, applyTheme } = await load();
		slice.setCodeTheme('dark-modern');
		applyTheme();
		await tick();
		expect(injected()).toHaveLength(0);
	});

	it('invoke 失败时静默（不挂载、不抛未处理拒绝）', async () => {
		const { slice, applyTheme } = await load();
		slice.setCodeTheme('vscode:Broken');
		applyTheme();
		await tick();
		expect(injected()).toHaveLength(0);
	});
});

