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

	/** 从 localStorage 恢复（键名与历史版本保持一致）；须在响应式上下文之外、持久化 effect 建立之前调用 */
	load() {
		if (typeof localStorage === 'undefined') return;

		const savedKrokiHost = localStorage.getItem('kroki.host');
		const savedCodeTheme = localStorage.getItem('code.theme');

		if (savedKrokiHost !== null) this.krokiHost = savedKrokiHost;
		if (savedCodeTheme !== null) this.codeTheme = savedCodeTheme;
	}

	/** 持久化到 localStorage（键名不变）；须在 $effect 内调用以建立响应依赖 */
	persist() {
		if (typeof localStorage === 'undefined') return;

		localStorage.setItem('kroki.host', this.krokiHost);
		localStorage.setItem('code.theme', this.codeTheme);
	}
}

export const krokiSettingsSlice = new KrokiSettingsSlice();
