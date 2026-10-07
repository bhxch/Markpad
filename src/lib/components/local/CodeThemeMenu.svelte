<!-- 本地组件（T8）：代码高亮主题下拉——静态 3 项 + 已导入 VSCode 主题分组（空则不渲染），
	当前项判定 themeSettingsSlice.currentCodeTheme，选择走 setCodeTheme。结构对齐 ThemeSchemeMenu。 -->
<script lang="ts">
	import { invoke } from '@tauri-apps/api/core';
	import { settings } from '../../stores/settings.svelte.js';
	import { themeSettingsSlice } from '../../stores/slices/themeSettings.svelte.js';

	let { onclose }: { onclose: () => void } = $props();

	// 已导入的 VSCode 代码主题：与上游 theme 菜单同命令，挂载即取一次。
	let savedVscodeThemes = $state<string[]>([]);

	$effect(() => {
		invoke<string[]>('get_saved_vscode_themes')
			.then((themes) => (savedVscodeThemes = themes))
			.catch(console.error);
	});

	function pick(id: string) {
		themeSettingsSlice.setCodeTheme(id);
		onclose();
	}
</script>

<div class="code-menu" role="menu" tabindex="-1">
	{#each settings.codeThemes as row (row.id)}
		<button
			class="code-option {themeSettingsSlice.currentCodeTheme === row.id ? 'selected' : ''}"
			role="menuitem"
			onclick={() => pick(row.id)}>
			{row.name}
			{#if themeSettingsSlice.currentCodeTheme === row.id}<span class="check">✓</span>{/if}
		</button>
	{/each}
	{#if savedVscodeThemes.length > 0}
		<div class="menu-divider"></div>
		<div class="group-label">VSCode 主题</div>
		{#each savedVscodeThemes as name (name)}
			<button
				class="code-option {themeSettingsSlice.currentCodeTheme === `vscode:${name}` ? 'selected' : ''}"
				role="menuitem"
				onclick={() => pick(`vscode:${name}`)}>
				{name}
				{#if themeSettingsSlice.currentCodeTheme === `vscode:${name}`}<span class="check">✓</span>{/if}
			</button>
		{/each}
	{/if}
</div>

<style>
	.code-menu {
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
	.code-option {
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
	.code-option:hover {
		background: var(--color-neutral-muted);
	}
	.code-option.selected {
		font-weight: 600;
	}
	.check {
		color: var(--color-accent-fg);
	}
	.group-label {
		padding: 4px 10px 2px;
		font-size: 11px;
		color: var(--color-fg-muted);
	}
	.menu-divider {
		height: 1px;
		background: var(--color-border-muted);
		margin: 4px 0;
	}
</style>
