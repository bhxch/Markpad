/**
 * 主题双槽设置切片（本地独有键，spec T3/T4）。
 *
 * 深浅两个模式各记住一套配色方案与代码主题，切换明暗即切换整套组合；
 * 另承载"跟随系统"开关与 UI 主题来源裁决（本地方案表 vs 导入的 VSCode 主题）。
 * 包含 localStorage 键：`theme.schemes`、`theme.codeThemes`、`theme.followSystem`、`theme.mode`
 * （旧单值键 `theme.scheme` / `code.theme` 退役，不迁移数据）。
 * 上游合并会重写 stores/settings.svelte.ts；本切片是本地独有资产（独立文件，零冲突），
 * 合并后在新的 settings.svelte.ts 中重新挂载透传即可恢复这些设置。
 */
export type ThemeMode = 'light' | 'dark';

/**
 * C1 写穿钩子：本地动作（四个 set 路径）同步回写上游 `settings.theme` 字段。
 *
 * why：不写穿则 MarkdownViewer 的 theme effect 每次重启都重放持久化的
 * settings.theme（默认 'system'），经 applyAppearanceTheme 把 followSystem/mode
 * 拉回，T4"手动选择退出跟随"跨重启失效（spec 2026-10-07-theme-restore §C1）。
 * 由 settings.svelte.ts 构造器在 loadPersistedSettings 之后接线——注册表 load
 * 恢复持久化值的路径不得触发写穿（接线行见 settings.svelte.ts 构造器）。
 * 本切片不 import settings store：settings→slice 已是依赖方向，反向即成环。
 */
let onLocalMutation: ((theme: string) => void) | null = null;

export function setLocalThemeWriter(fn: (theme: string) => void): void {
	onLocalMutation = fn;
}

/** 主题表行：id 同时是 styles.css `data-theme-scheme` 选择器的键。 */
export interface ThemeRow {
	id: string;
	name: string;
	mode: ThemeMode;
}

export class ThemeSettingsSlice {
	// 当前生效明暗。跟随系统开启时由系统偏好驱动，手动选方案/模式时写死。
	mode = $state<ThemeMode>('dark');

	// 配色方案双槽：每种明暗各记一套主题表 id，切模式不丢另一侧的选择。
	themeSchemes = $state<{ light: string; dark: string }>({ light: 'github-light', dark: 'github-dark' });

	// 代码主题双槽：'auto' | 'dark-modern' | 'light-modern'（'vscode:<name>' 为 Task 5 扩展位）。
	codeThemesByMode = $state<{ light: string; dark: string }>({ light: 'auto', dark: 'auto' });

	// 跟随系统：开启时 prefers-color-scheme 变化即切槽位组合（监听在 utils/themeApply）。
	followSystem = $state(false);

	// UI 主题来源：本地方案表（scheme）或导入的 VSCode 主题（vscode）。
	uiThemeSource = $state<'scheme' | 'vscode'>('scheme');

	// uiThemeSource==='vscode' 时的主题名。
	vscodeUiName = $state('');

	// 7 方案静态表（原 settings.svelte.ts 迁入，id/name/mode 不变）。
	themes: ThemeRow[] = [
		{ id: 'github-light', name: 'GitHub Light', mode: 'light' },
		{ id: 'github-dark', name: 'GitHub Dark', mode: 'dark' },
		{ id: 'vue', name: 'Vue', mode: 'light' },
		{ id: 'one-dark', name: 'One Dark', mode: 'dark' },
		{ id: 'monokai', name: 'Monokai', mode: 'dark' },
		{ id: 'nord', name: 'Nord', mode: 'dark' },
		{ id: 'solarized-dark', name: 'Solarized Dark', mode: 'dark' }
	];

	// 代码主题静态 3 项（原 settings.svelte.ts 迁入）。
	codeThemes: { id: string; name: string }[] = [
		{ id: 'auto', name: '跟随全局主题' },
		{ id: 'dark-modern', name: 'VSCode Dark Modern' },
		{ id: 'light-modern', name: 'VSCode Light Modern' }
	];

	// 持久化统一走 stores/settings.svelte.ts 的 createSettingsPersistence() 注册表
	// （theme.schemes / theme.codeThemes / theme.followSystem / theme.mode 四组键），
	// 本切片只承载状态与访问器，不直接读写 localStorage。

	get currentSchemeId(): string {
		return this.themeSchemes[this.mode];
	}

	get currentCodeTheme(): string {
		return this.codeThemesByMode[this.mode];
	}

	/**
	 * 当前代码主题的显示名（Minor1：原 TitleBar $derived 下沉为单一实现）。
	 * 'auto' 行返回 null，由消费端以 t('toolbar.codeThemeAuto') 渲染
	 * （Minor5b：静态表的中文名退役为数据，界面文案走 i18n）；
	 * `vscode:<name>` 扩展位不在表内，剥前缀显示导入名。
	 */
	get currentCodeThemeName(): string | null {
		const v = this.currentCodeTheme;
		if (v === 'auto') return null;
		return this.codeThemes.find((c) => c.id === v)?.name ?? v.replace(/^vscode:/, '');
	}

	/** deferred：注册表 load 的槽值白名单——方案槽只接受主题表内 id。 */
	isKnownSchemeId(id: string): boolean {
		return this.themes.some((t) => t.id === id);
	}

	/** deferred：代码主题槽白名单——'auto'|内置两项|'vscode:*' 动态前缀。 */
	isKnownCodeThemeId(id: string): boolean {
		return id === 'auto' || id === 'dark-modern' || id === 'light-modern' || id.startsWith('vscode:');
	}

	/** 当前方案的主题表行；表外 id（如损坏的存量数据）回退 github-dark，与旧 applyTheme 一致。 */
	get currentScheme(): ThemeRow {
		return this.themes.find((t) => t.id === this.currentSchemeId) ?? this.themes[1];
	}

	// 方案即模式：写入当前明暗对应的槽，并退出跟随系统。
	setThemeScheme(id: string) {
		const row = this.themes.find((t) => t.id === id);
		if (!row) return; // 表外 id 不落状态：应用不了的方案不能占据槽位
		this.mode = row.mode;
		this.themeSchemes[this.mode] = id;
		this.followSystem = false;
		this.uiThemeSource = 'scheme';
		onLocalMutation?.(row.mode); // C1 写穿：按方案明暗回写 settings.theme
	}

	// 写当前模式的代码主题槽（不动 mode/跟随）。
	setCodeTheme(id: string) {
		this.codeThemesByMode[this.mode] = id;
	}

	setMode(mode: ThemeMode) {
		this.mode = mode;
		this.followSystem = false;
		this.uiThemeSource = 'scheme';
		onLocalMutation?.(mode); // C1 写穿
	}

	setFollowSystem(on: boolean) {
		this.followSystem = on;
		if (on) {
			// T5/T7 裁定：跟随系统=回到本地方案体系、由深/浅槽位驱动，与导入的
			// VSCode UI 主题互斥；不退激活态则 applyTheme 恒走 vscode 分支，
			// 开启"跟随系统"对 UI 无任何可见变化。
			this.uiThemeSource = 'scheme';
			// matchMedia 判空防 SSR/不可用环境；不可用时取浅色缺省。
			const mq = typeof matchMedia === 'function' ? matchMedia('(prefers-color-scheme: dark)') : null;
			this.mode = mq?.matches ? 'dark' : 'light';
		}
		// C1 写穿：开启回写 'system'；关闭按当前 mode 回写（重启重放即还原本选择）。
		onLocalMutation?.(on ? 'system' : this.mode);
	}

	// uiThemeSource←'vscode'；明暗由 utils/theme.ts 解析 .vsix 后经 data-theme-type 发布。
	setVscodeUi(name: string) {
		this.vscodeUiName = name;
		this.uiThemeSource = 'vscode';
		onLocalMutation?.(`vscode:${name}`); // C1 写穿
	}

	/**
	 * I2：删除 VSCode 主题时调用——两槽中值恰为 `vscode:<name>` 的槽回落 'auto'
	 * （直接字段赋值，不经写穿：代码主题不映射 settings.theme）。currentCodeTheme
	 * 受影响时由 settings store 的 applyTheme effect 自动重放 data-code-theme。
	 */
	pruneDeletedVscodeCodeTheme(name: string) {
		const id = `vscode:${name}`;
		for (const mode of ['light', 'dark'] as const) {
			if (this.codeThemesByMode[mode] === id) this.codeThemesByMode[mode] = 'auto';
		}
	}

	// auto 按模式解析为具体代码主题（merge 前语义，供高亮管线与 themeApply 共用）。
	// T7 语义补全：UI 主题选的是 VSCode 主题时，auto 的代码高亮跟随它——历史上
	// 导入的 VSCode 主题直接作用于代码块着色（用户裁决"vscode 主题给代码高亮用"）；
	// 双槽下显式选择的代码主题（dark/light-modern/另一个 vscode 主题）仍然优先。
	resolveCodeTheme(mode: ThemeMode = this.mode): string {
		const v = this.codeThemesByMode[mode];
		if (v !== 'auto') return v;
		if (this.uiThemeSource === 'vscode' && this.vscodeUiName) return `vscode:${this.vscodeUiName}`;
		return mode === 'dark' ? 'dark-modern' : 'light-modern';
	}
}

export const themeSettingsSlice = new ThemeSettingsSlice();
