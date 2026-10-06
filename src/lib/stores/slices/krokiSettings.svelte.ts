/**
 * Kroki / 代码主题设置切片（本地独有键）。
 *
 * 包含 localStorage 键：`kroki.host`、`code.theme`。
 * 上游合并会重写 stores/settings.svelte.ts；本切片是本地独有资产（独立文件，零冲突），
 * 合并后在新的 settings.svelte.ts 中重新挂载透传即可恢复这些设置。
 */
export class KrokiSettingsSlice {
	// Kroki 自定义 host（支持自托管）
	krokiHost = $state('https://kroki.io');

	// 代码块主题：'auto' | 'dark-modern' | 'light-modern'
	codeTheme = $state<string>('auto');

	// 持久化统一走 stores/settings.svelte.ts 的 createSettingsPersistence() 注册表
	// （kroki.host / code.theme 两组键均已登记），本切片只承载状态，不直接读写 localStorage。
}

export const krokiSettingsSlice = new KrokiSettingsSlice();
