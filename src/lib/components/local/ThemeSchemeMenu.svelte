<!-- 本地组件（T8）：配色方案下拉——候选全列、当前项高亮，选择走
	themeSettingsSlice.setThemeScheme（方案即模式+退跟随）。样式自带，不依赖 TitleBar 的 scoped 类。 -->
<script lang="ts">
	import { settings } from '../../stores/settings.svelte.js';
	import { themeSettingsSlice } from '../../stores/slices/themeSettings.svelte.js';
	import { t } from '../../utils/i18n.js';

	let { onclose }: { onclose: () => void } = $props();

	function pick(id: string) {
		themeSettingsSlice.setThemeScheme(id);
		onclose();
	}
</script>

<div class="scheme-menu" role="menu" tabindex="-1">
	{#each settings.themes as row (row.id)}
		<button
			class="scheme-option {themeSettingsSlice.currentSchemeId === row.id ? 'selected' : ''}"
			role="menuitem"
			onclick={() => pick(row.id)}>
			{row.name}
			{#if themeSettingsSlice.currentSchemeId === row.id}<span class="check">✓</span>{/if}
		</button>
	{/each}
	<div class="menu-divider"></div>
	<button
		class="scheme-option {themeSettingsSlice.followSystem ? 'selected' : ''}"
		role="menuitem"
		onclick={() => {
			themeSettingsSlice.setFollowSystem(!themeSettingsSlice.followSystem);
			onclose();
		}}>
		{themeSettingsSlice.followSystem ? '✓ ' : ''}{t('theme.followSystem', settings.language)}
	</button>
</div>

<style>
	.scheme-menu {
		position: absolute;
		top: 100%;
		right: 0;
		margin-top: 4px;
		background: var(--color-canvas-overlay, var(--color-canvas-default));
		border: 1px solid var(--color-border-default);
		border-radius: 6px;
		padding: 4px;
		min-width: 180px;
		z-index: 10000;
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
		display: flex;
		flex-direction: column;
		gap: 1px;
	}
	.scheme-option {
		display: flex;
		justify-content: space-between;
		gap: 12px;
		width: 100%;
		text-align: left;
		padding: 6px 10px;
		border: 0;
		background: none;
		color: var(--color-fg-default);
		cursor: pointer;
		border-radius: 4px;
		font-size: 12px;
	}
	.scheme-option:hover {
		background: var(--color-neutral-muted);
	}
	.scheme-option.selected {
		font-weight: 600;
	}
	.check {
		color: var(--color-accent-fg);
	}
	.menu-divider {
		height: 1px;
		background: var(--color-border-muted);
		margin: 4px 0;
	}
</style>
