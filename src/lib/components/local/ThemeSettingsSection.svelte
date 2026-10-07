<!-- 本地组件（T11）：设置页主题配置区——配色方案下拉（7 方案表）、代码主题下拉
	（静态 3 项 + 已导入 VSCode 主题分组，value 带 `vscode:` 前缀）、跟随系统开关。
	读写全部走 themeSettingsSlice（currentSchemeId/currentCodeTheme/followSystem +
	setThemeScheme/setCodeTheme/setFollowSystem），与标题栏菜单共用同一状态源。
	结构对齐 DiagramSettingsSection：settings-group/setting-item 标记类 +
	共享样式类复制进 scoped <style>（Settings.svelte 的 scoped 类进不来）。 -->
<script lang="ts">
	import { invoke } from '@tauri-apps/api/core';
	import { settings } from '../../stores/settings.svelte.js';
	import { themeSettingsSlice } from '../../stores/slices/themeSettings.svelte.js';
	import { t } from '../../utils/i18n.js';

	// 已导入的 VSCode 代码主题：与标题栏 CodeThemeMenu 同命令，挂载即取一次。
	let savedVscodeThemes = $state<string[]>([]);

	$effect(() => {
		invoke<string[]>('get_saved_vscode_themes')
			.then((themes) => (savedVscodeThemes = themes))
			.catch(console.error);
	});
</script>

<div class="settings-group">
	<h2>{t('toolbar.themeScheme', settings.language)}</h2>

	<div class="setting-item">
		<label for="theme-scheme-select">{t('toolbar.themeScheme', settings.language)}</label>
		<div class="select-wrapper">
			<select
				id="theme-scheme-select"
				data-testid="scheme-select"
				value={themeSettingsSlice.currentSchemeId}
				onchange={(e) => themeSettingsSlice.setThemeScheme(e.currentTarget.value)}
			>
				{#each settings.themes as th (th.id)}
					<option value={th.id}>{th.name}</option>
				{/each}
			</select>
			<svg
				class="select-arrow"
				width="12"
				height="12"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="2"
				stroke-linecap="round"
				stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>
		</div>
	</div>

	<div class="setting-item">
		<label for="theme-code-select">{t('toolbar.codeTheme', settings.language)}</label>
		<div class="select-wrapper">
			<select
				id="theme-code-select"
				data-testid="code-select"
				value={themeSettingsSlice.currentCodeTheme}
				onchange={(e) => themeSettingsSlice.setCodeTheme(e.currentTarget.value)}
			>
				{#each settings.codeThemes as ct (ct.id)}
					<option value={ct.id}>{ct.name}</option>
				{/each}
				{#if savedVscodeThemes.length > 0}
					<optgroup label={t('settings.vsCodeThemes', settings.language)}>
						{#each savedVscodeThemes as name (name)}
							<option value={`vscode:${name}`}>{name}</option>
						{/each}
					</optgroup>
				{/if}
			</select>
			<svg
				class="select-arrow"
				width="12"
				height="12"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="2"
				stroke-linecap="round"
				stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>
		</div>
	</div>

	<div class="setting-item">
		<label for="theme-follow-system">{t('theme.followSystem', settings.language)}</label>
		<label class="toggle">
			<input
				id="theme-follow-system"
				data-testid="follow-system"
				type="checkbox"
				checked={themeSettingsSlice.followSystem}
				onchange={(e) => themeSettingsSlice.setFollowSystem(e.currentTarget.checked)}
			/>
			<span class="toggle-slider"></span>
		</label>
	</div>
</div>

<style>
	/* ---- 共享类（从 Settings.svelte 复制，原文件保留；同 DiagramSettingsSection 先例） ---- */
	.settings-group h2 {
		font-size: 16px;
		font-weight: 600;
		margin: 0 0 16px 0;
		color: var(--color-fg-default);
	}

	.setting-item {
		display: flex;
		align-items: center;
		column-gap: 12px;
		padding: 10px 0;
		border-bottom: 1px solid var(--color-border-muted);
		position: relative;
	}

	.setting-item label:first-child {
		font-size: 13px;
		color: var(--color-fg-default);
		display: flex;
		align-items: center;
		height: 100%;
		flex: 0 1 auto;
		/* 独立挂载（组件测试）时无 Settings 面板提供该变量，172px 为面板内同值兜底。 */
		min-width: var(--settings-label-column, 172px);
	}

	.setting-item:last-child {
		border-bottom: none;
	}

	.select-wrapper {
		position: relative;
		display: inline-flex;
		align-items: center;
		width: 220px;
		flex: 0 1 auto;
		min-width: 0;
	}

	.select-arrow {
		position: absolute;
		right: 10px;
		pointer-events: none;
		color: var(--color-fg-muted);
	}

	.setting-item select {
		padding: 6px 32px 6px 12px;
		border: 1px solid var(--color-border-default);
		border-radius: 6px;
		background-color: var(--color-canvas-default);
		color: var(--color-fg-default);
		font-size: 13px;
		width: 100%;
		min-width: 140px;
		cursor: pointer;
		appearance: none;
		-webkit-appearance: none;
		-moz-appearance: none;
	}

	.setting-item select option,
	.setting-item select optgroup {
		background-color: var(--color-canvas-default);
		color: var(--color-fg-default);
	}

	.setting-item select:focus {
		outline: none;
		border-color: var(--color-accent-fg);
	}

	.toggle {
		position: relative;
		display: inline-block;
		width: 40px;
		height: 20px;
		cursor: pointer;
	}

	.toggle input {
		opacity: 0;
		width: 0;
		height: 0;
	}

	.toggle-slider {
		position: absolute;
		cursor: pointer;
		top: 0;
		left: 0;
		right: 0;
		bottom: 0;
		background-color: transparent;
		border: 1px solid var(--color-fg-muted);
		transition:
			background-color 0.2s,
			border-color 0.2s;
		border-radius: 20px;
	}

	.toggle-slider:before {
		position: absolute;
		content: '';
		height: 12px;
		width: 12px;
		left: 3px;
		bottom: 3px;
		background-color: #abb2bf;
		transition:
			transform 0.2s cubic-bezier(0.16, 1, 0.3, 1),
			height 0.2s,
			width 0.2s,
			left 0.2s,
			bottom 0.2s,
			background-color 0.2s;
		border-radius: 50%;
	}

	.toggle input:checked + .toggle-slider {
		background-color: var(--color-accent-fg);
		border-color: var(--color-accent-fg);
	}

	.toggle input:checked + .toggle-slider:before {
		transform: translateX(20px);
		background-color: #fff;
	}
</style>
