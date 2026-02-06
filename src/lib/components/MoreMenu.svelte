<script lang="ts">
	import { fly } from 'svelte/transition';
	import type { Component } from 'svelte';

	let {
		actions,
		onaction,
		oncontextmenu
	} = $props<{
		actions: {
			id: string;
			label: string;
			icon: string;
			isActive: boolean;
		}[];
		onaction: (id: string) => void;
		oncontextmenu: (e: MouseEvent, id: string) => void;
	}>();
</script>

<div class="more-menu" transition:fly={{ y: -5, duration: 150 }}>
	{#each actions as action (action.id)}
		<button
			class="menu-item {action.isActive ? 'active' : ''}"
			onclick={() => onaction(action.id)}
			oncontextmenu={(e) => oncontextmenu(e, action.id)}>
			<span class="menu-icon">{@html action.icon}</span>
			<span class="menu-label">{action.label}</span>
		</button>
	{/each}
</div>

<style>
	.more-menu {
		position: absolute;
		top: 100%;
		right: 0;
		margin-top: 4px;
		background: var(--color-canvas-overlay, var(--color-canvas-default));
		border: 1px solid var(--color-border-default);
		border-radius: 6px;
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
		padding: 4px;
		z-index: 10001;
		min-width: 180px;
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.menu-item {
		display: flex;
		align-items: center;
		gap: 8px;
		width: 100%;
		padding: 6px 8px;
		border: none;
		background: transparent;
		color: var(--color-fg-default);
		border-radius: 4px;
		cursor: pointer;
		font-family: inherit;
		font-size: 13px;
		text-align: left;
	}

	.menu-item:hover {
		background: var(--color-canvas-subtle);
	}

	.menu-item.active {
		color: var(--color-accent-fg);
		background: var(--color-canvas-subtle);
	}

	.menu-icon {
		width: 16px;
		height: 16px;
		display: flex;
		align-items: center;
		justify-content: center;
		opacity: 0.8;
	}

	.menu-item:hover .menu-icon {
		opacity: 1;
	}
</style>
