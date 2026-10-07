// T3/T4：主题双槽状态契约测试。切片单例经 vi.resetModules 每例重建，
// 不触碰 localStorage（持久化走 settings.svelte.ts 注册表，另有测试覆盖）。
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn(async () => []) }));

beforeEach(() => {
	vi.resetModules();
	localStorage.clear();
	document.documentElement.removeAttribute('data-theme');
	document.documentElement.removeAttribute('data-theme-mode');
	document.documentElement.removeAttribute('data-theme-scheme');
	document.documentElement.removeAttribute('data-code-theme');
});

afterEach(() => {
	vi.unstubAllGlobals();
});

const load = async () => {
	const mod = await import('./themeSettings.svelte.ts');
	return { slice: mod.themeSettingsSlice };
};

describe('主题双槽契约（T3/T4，spec §4 矩阵）', () => {
	it('默认值：深槽 github-dark、浅槽 github-light、代码主题 auto、未跟随', async () => {
		const { slice } = await load();
		expect(slice.themeSchemes).toEqual({ light: 'github-light', dark: 'github-dark' });
		expect(slice.codeThemesByMode).toEqual({ light: 'auto', dark: 'auto' });
		expect(slice.followSystem).toBe(false);
		expect(slice.mode).toBe('dark');
	});

	it('选浅色方案：mode 切 light、写浅槽、深槽不动', async () => {
		const { slice } = await load();
		slice.setThemeScheme('vue');
		expect(slice.mode).toBe('light');
		expect(slice.themeSchemes.light).toBe('vue');
		expect(slice.themeSchemes.dark).toBe('github-dark');
		expect(slice.currentSchemeId).toBe('vue');
	});

	it('深浅两槽各配不同代码主题，互不串扰', async () => {
		const { slice } = await load();
		slice.setThemeScheme('one-dark'); // dark 槽
		slice.setCodeTheme('light-modern'); // 写深槽（当前模式 dark）
		slice.setThemeScheme('github-light'); // 切浅
		slice.setCodeTheme('dark-modern'); // 写浅槽
		expect(slice.codeThemesByMode.dark).toBe('light-modern');
		expect(slice.codeThemesByMode.light).toBe('dark-modern');
		slice.setThemeScheme('monokai'); // 回深
		expect(slice.currentCodeTheme).toBe('light-modern');
	});

	it('手动点选方案自动退出跟随系统（T4）', async () => {
		const { slice } = await load();
		slice.setFollowSystem(true);
		expect(slice.followSystem).toBe(true);
		slice.setThemeScheme('nord');
		expect(slice.followSystem).toBe(false);
	});

	it('setMode（上游下拉 light/dark）切换槽位组合并退出跟随', async () => {
		const { slice } = await load();
		slice.setFollowSystem(true);
		slice.setMode('light');
		expect(slice.followSystem).toBe(false);
		expect(slice.currentSchemeId).toBe('github-light');
	});

	it('auto 代码主题按当前方案明暗解析（merge 前语义）', async () => {
		const { slice } = await load();
		expect(slice.resolveCodeTheme()).toBe('dark-modern');
		slice.setMode('light');
		expect(slice.resolveCodeTheme()).toBe('light-modern');
	});

	it('currentScheme 返回主题表行；uiThemeSource 默认 scheme', async () => {
		const { slice } = await load();
		expect(slice.uiThemeSource).toBe('scheme');
		expect(slice.currentScheme).toEqual({ id: 'github-dark', name: 'GitHub Dark', mode: 'dark' });
		slice.setThemeScheme('solarized-dark');
		expect(slice.currentScheme).toEqual({ id: 'solarized-dark', name: 'Solarized Dark', mode: 'dark' });
	});

	it('themes/codeThemes 静态表随切片迁入，7 方案 3 代码主题', async () => {
		const { slice } = await load();
		expect(slice.themes).toHaveLength(7);
		expect(slice.codeThemes.map((t) => t.id)).toEqual(['auto', 'dark-modern', 'light-modern']);
		expect(slice.themes.map((t) => t.id)).toEqual([
			'github-light', 'github-dark', 'vue', 'one-dark', 'monokai', 'nord', 'solarized-dark',
		]);
	});

	it('表外 id 不落状态（守卫：不认识的方案不得写槽）', async () => {
		const { slice } = await load();
		slice.setThemeScheme('not-a-theme');
		expect(slice.currentSchemeId).toBe('github-dark');
		expect(slice.mode).toBe('dark');
	});

	it('setVscodeUi 记录主题名并切 uiThemeSource', async () => {
		const { slice } = await load();
		slice.setVscodeUi('Ayu Dark');
		expect(slice.uiThemeSource).toBe('vscode');
		expect(slice.vscodeUiName).toBe('Ayu Dark');
	});

	it('开启跟随系统退出 VSCode UI 激活态（T5/T7 裁定：跟随系统回到本地方案体系）', async () => {
		const { slice } = await load();
		slice.setVscodeUi('Ayu Dark');
		slice.setFollowSystem(true);
		expect(slice.followSystem).toBe(true);
		expect(slice.uiThemeSource).toBe('scheme');
	});
});

describe('注册表恢复顺序（T4：followSystem 行须在 mode 行之后 load）', () => {
	// loadPersistedSettings 按注册表数组顺序同步执行。followSystem=true 时
	// setFollowSystem 从 matchMedia 重推导 mode，若它先于 theme.mode 恢复，
	// 存量 mode 会把刚推导的系统值盖回陈旧值（关机期间 OS 翻转过即触发）。
	it('存量 followSystem=true：关机期间系统翻浅，启动后 mode=light 而非陈旧 dark', async () => {
		localStorage.setItem('theme.mode', 'dark');
		localStorage.setItem('theme.followSystem', 'true');
		// 系统现为浅色（matches:false）；监听桩只需可安装/退订。
		vi.stubGlobal('matchMedia', () => ({
			matches: false,
			addEventListener: () => {},
			removeEventListener: () => {},
		}));
		const { SettingsStore } = await import('../settings.svelte.ts');
		const store = new SettingsStore();
		try {
			expect(store.themeFollowSystem).toBe(true);
			// 正确顺序：theme.mode 先恢复（dark），theme.followSystem 后 load 并以系统值重推导。
			expect(store.themeMode).toBe('light');
		} finally {
			store.dispose();
		}
	});

	it('存量 followSystem=false：mode 保持存量（顺序对调不伤手动选择）', async () => {
		localStorage.setItem('theme.mode', 'dark');
		localStorage.setItem('theme.followSystem', 'false');
		const { SettingsStore } = await import('../settings.svelte.ts');
		const store = new SettingsStore();
		try {
			expect(store.themeFollowSystem).toBe(false);
			expect(store.themeMode).toBe('dark');
		} finally {
			store.dispose();
		}
	});
});
