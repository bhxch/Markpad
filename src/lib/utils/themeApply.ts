/**
 * 主题属性唯一写者（spec T6）：scheme 态写 data-theme / data-theme-mode /
 * data-theme-scheme / data-theme-type / data-code-theme，vscode 态写
 * data-theme（并带出 data-theme-mode、移除 data-theme-scheme），
 * 全部只从这里落 DOM（data-theme-type 的 vscode 探测发布除外，见 utils/theme.ts）。
 * 此前上游 MarkdownViewer 与本地 settings.applyTheme 双写者并存、
 * 本地 scheme 块特异性恒胜导致上游主题选择从不生效（spec §3.2-3）。
 */
import { themeSettingsSlice } from '../stores/slices/themeSettings.svelte.js';

let systemWatcherDisposer: (() => void) | null = null;

export function applyTheme(): void {
	if (typeof document === 'undefined') return;
	const root = document.documentElement;
	const slice = themeSettingsSlice;

	if (slice.uiThemeSource === 'vscode') {
		// T7: VSCode UI 主题生效时不设 data-theme-scheme——本地 scheme CSS 块
		// 特异性 (0,3,0) 高于上游块，恒设会使 VSCode UI 永远被盖（历史缺陷）。
		root.setAttribute('data-theme', 'vscode');
		// data-theme-mode 始终是当前生效明暗：VSCode 主题由 utils/theme.ts 在解析
		// .vsix 时发布 data-theme-type（其真实明暗），未发布时退回切片当前模式。
		root.setAttribute('data-theme-mode', root.getAttribute('data-theme-type') || slice.mode);
		root.removeAttribute('data-theme-scheme');
	} else {
		root.setAttribute('data-theme', slice.mode);
		root.setAttribute('data-theme-mode', slice.mode);
		root.setAttribute('data-theme-scheme', slice.currentSchemeId);
		// T6 收编点：上游 MarkdownViewer 原在此直写/删除 data-theme-type（system 分支
		// 删除是为防 vscode 主题的探测值残留进 mermaid 的 system 明暗判定）。改由
		// themeApply 同步为当前生效明暗，currentMermaidTheme/resolveMermaidTheme 语义不变。
		root.setAttribute('data-theme-type', slice.mode);
	}
	root.setAttribute('data-code-theme', slice.resolveCodeTheme());
}

/** 跟随系统：prefers-color-scheme 变化时切槽位组合（T4）。重复安装幂等。 */
export function installSystemThemeWatcher(): () => void {
	if (systemWatcherDisposer || typeof matchMedia === 'undefined') return () => {};
	const mq = matchMedia('(prefers-color-scheme: dark)');
	const onChange = () => {
		if (themeSettingsSlice.followSystem) {
			themeSettingsSlice.mode = mq.matches ? 'dark' : 'light';
			applyTheme();
		}
	};
	mq.addEventListener('change', onChange);
	systemWatcherDisposer = () => {
		mq.removeEventListener('change', onChange);
		systemWatcherDisposer = null;
	};
	return systemWatcherDisposer;
}

/** T7（Task 5 实装）：vscode:<name> 代码主题的 --ts-* 注入；本任务先立接口。 */
export async function buildVscodeCodeThemeStyle(_name: string): Promise<string> {
	return '';
}
