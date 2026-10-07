/**
 * 上游"更改主题"下拉到本地双槽模型的语义桥（spec T5；T6 属性收编入口）。
 * 上游机制（settings.theme 字段、save_theme 持久化、启动外观）原样保留，
 * 只把"落到 DOM 属性"这一步收编到 themeApply 唯一写者。
 * T5/T7 裁定：'system' 经 slice.setFollowSystem 退 uiThemeSource←scheme——
 * 跟随系统是明确的模式选择，回到本地方案槽位驱动，与 VSCode UI 主题互斥。
 */
import { themeSettingsSlice } from '../stores/slices/themeSettings.svelte.js';
import { applyTheme } from './themeApply.js';

export function applyAppearanceTheme(theme: string): void {
	if (theme === 'system') {
		themeSettingsSlice.setFollowSystem(true);
	} else if (theme === 'light' || theme === 'dark') {
		themeSettingsSlice.setMode(theme);
	} else if (theme.startsWith('vscode:')) {
		themeSettingsSlice.setVscodeUi(theme.slice('vscode:'.length));
		return; // dataset 由 parseAndApplyVscodeTheme/themeApply 落（含明暗探测）
	} else {
		return;
	}
	applyTheme();
}
