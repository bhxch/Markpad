/**
 * 上游"更改主题"下拉到本地双槽模型的语义桥（spec T5；T6 属性收编入口）。
 * 上游机制（settings.theme 字段、save_theme 持久化、启动外观）原样保留，
 * 只把"落到 DOM 属性"这一步收编到 themeApply 唯一写者。
 * T5/T7 裁定：'system' 经 slice.setFollowSystem 退 uiThemeSource←scheme——
 * 跟随系统是明确的模式选择，回到本地方案槽位驱动，与 VSCode UI 主题互斥。
 */
import { themeSettingsSlice } from '../stores/slices/themeSettings.svelte.js';
import { applyTheme } from './themeApply.js';

/**
 * C1 启动恢复语义的 hydrate 闸门：未 hydrate 前（= 首播前）的 applyAppearanceTheme
 * 重放都是"启动恢复"，只落 DOM 属性（applyTheme）、不改切片状态。
 *
 * why：持久化的 settings.theme 每次重启都被 MarkdownViewer 的 theme effect 重放；
 * 若走用户语义，theme='system' 会 setFollowSystem(true) 强制开跟随、'light'/'dark'
 * 会 setMode 覆盖持久化 mode，T4"手动选择退出跟随"跨重启失效。
 *
 * 实现说明（与任务稿的偏差）：任务稿把 markHydrated 放在 settings 构造器
 * loadPersistedSettings 之后——但真实时序是模块求值（构造器）→ 组件挂载 → effect
 * flush（首播），构造器置位会使首播永远轮不到恢复语义、修复失效。故改为**首播
 * 恢复完成后在此自置位**（首次调用即消费恢复槽；首播必经本函数），markHydrated
 * 仍导出供测试显式推进。跨窗口 storage 同步到达前首播已完成（挂载 flush 早于
 * 后续任务），不受影响。
 */
let hydrated = false;

export function markHydrated(): void {
	hydrated = true;
}

export function applyAppearanceTheme(theme: string): void {
	const restore = !hydrated;
	hydrated = true; // 首次调用即过启动阶段，此后全部按用户语义
	if (theme === 'system') {
		// restore：跟随状态以持久化 theme.followSystem 为准（watcher 已按其工作），
		// 不强制开跟随；用户语义：明确的模式选择，开启跟随。
		if (!restore) themeSettingsSlice.setFollowSystem(true);
	} else if (theme === 'light' || theme === 'dark') {
		// restore：mode 以持久化 theme.mode 为准；用户语义：切换模式并退跟随。
		if (!restore) themeSettingsSlice.setMode(theme);
	} else if (theme.startsWith('vscode:')) {
		// restore 与用户语义一致：恢复 uiThemeSource（写穿钩子在该路径无害——
		// 重放的正是当前 settings.theme 值，幂等）。dataset 由
		// parseAndApplyVscodeTheme/themeApply 落（含明暗探测）。
		themeSettingsSlice.setVscodeUi(theme.slice('vscode:'.length));
		return;
	} else {
		return;
	}
	applyTheme();
}
