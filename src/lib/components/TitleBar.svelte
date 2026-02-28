<script lang="ts">
	import { getCurrentWindow } from '@tauri-apps/api/window';
	import { invoke } from '@tauri-apps/api/core';
	import { fly, slide } from 'svelte/transition';
	import { flip } from 'svelte/animate';
	import iconUrl from '../../assets/icon.png';
	import TabList from './TabList.svelte';
	import MoreMenu from './MoreMenu.svelte';
	import { tabManager } from '../stores/tabs.svelte.js';
	import { settings } from '../stores/settings.svelte.js';

	let {
		isFocused,
		isScrolled,
		currentFile,
		liveMode,

		windowTitle,
		showHome,
		onselectFile,
		onnewFile,
		onopenFile,
		onsaveFile,
		onsaveFileAs,
		onexit,
		ontoggleHome,
		ononpenFileLocation,
		ontoggleLiveMode,

		ontoggleEdit,
		ontoggleSplit,
		isEditing,
		ondetach,
		ontabclick,
		zoomLevel,
		onresetZoom,
		oncloseTab,
		isScrollSynced,
		ontoggleSync,
		ontoggleMetadata,
		showMetadata,
		hasMetadata,
		ontoggleToc,
		showToc,
		isFullWidth,
		ontoggleFullWidth,
		onopenSettings,
	} = $props<{
		isFocused: boolean;
		isScrolled: boolean;
		currentFile: string;
		liveMode: boolean;

		windowTitle: string;
		showHome: boolean;
		onselectFile: () => void;
		onnewFile?: () => void;
		onopenFile?: () => void;
		onsaveFile?: () => void;
		onsaveFileAs?: () => void;
		onexit?: () => void;
		ontoggleHome: () => void;
		ononpenFileLocation: () => void;
		ontoggleLiveMode: () => void;

		ontoggleEdit: () => void;
		ontoggleSplit?: () => void;
		isEditing: boolean;
		ondetach: (tabId: string) => void;
		ontabclick?: () => void;
		zoomLevel?: number;
		onresetZoom?: () => void;

		oncloseTab?: (id: string) => void;
		isScrollSynced?: boolean;
		ontoggleSync?: () => void;
		ontoggleMetadata?: () => void;
		showMetadata?: boolean;
		hasMetadata?: boolean;
		ontoggleToc?: () => void;
		showToc?: boolean;
		isFullWidth?: boolean;
		ontoggleFullWidth?: () => void;
		onopenSettings?: () => void;
	}>();

	const appWindow = getCurrentWindow();

	// DEBUG: Set this to true to simulate macOS traffic lights on Windows
	const DEBUG_MACOS = false;

	const isMac = typeof navigator !== 'undefined' && (navigator.userAgent.includes('Macintosh') || DEBUG_MACOS);

	let isWin11 = $state(false);
	let showMoreMenu = $state(false);

	$effect(() => {
		invoke('is_win11')
			.then((res) => {
				isWin11 = res as boolean;
			})
			.catch(() => {
				isWin11 = false;
			});
	});

	let tooltip = $state({
		visible: false,
		text: '',
		shortcut: '',
		x: 0,
		y: 0,
		align: 'center' as 'left' | 'center' | 'right',
	});

	function showTooltip(e: MouseEvent, text: string, shortcutKey: string = '') {
		if (showMoreMenu) return; // Don't show tooltip if menu is open
		
		const target = e.currentTarget as HTMLElement;
		const rect = target.getBoundingClientRect();
		const modifier = isMac ? 'Cmd' : 'Ctrl';
		const windowWidth = window.innerWidth;
		const edgeThreshold = 100;

		tooltip.text = text;
		tooltip.shortcut = shortcutKey ? `${modifier}+${shortcutKey}` : '';

		if (rect.left < edgeThreshold) {
			tooltip.align = 'left';
			tooltip.x = rect.left;
		} else if (rect.right > windowWidth - edgeThreshold) {
			tooltip.align = 'right';
			tooltip.x = rect.right;
		} else {
			tooltip.align = 'center';
			tooltip.x = rect.left + rect.width / 2;
		}

		tooltip.y = rect.bottom + 8;
		tooltip.visible = true;
	}

	function hideTooltip() {
		tooltip.visible = false;
	}

	function cycleThemeScheme() {
		const schemes = settings.themes.map(t => t.id);
		const currentIdx = schemes.indexOf(settings.themeScheme);
		const nextIdx = (currentIdx + 1) % schemes.length;
		settings.setThemeScheme(schemes[nextIdx]);
	}

	function cycleCodeTheme() {
		const themes = ['auto', 'dark-modern', 'light-modern'];
		const currentIdx = themes.indexOf(settings.codeTheme);
		const nextIdx = (currentIdx + 1) % themes.length;
		settings.codeTheme = themes[nextIdx];
	}

	function getCodeThemeLabel() {
		switch (settings.codeTheme) {
			case 'auto': return 'Auto';
			case 'dark-modern': return 'Dark';
			case 'light-modern': return 'Light';
			default: return 'Auto';
		}
	}

	// Definition of all possible actions
	type ActionDef = {
		id: string;
		label: string;
		icon: string; // SVG string
		handler: () => void;
		isActive?: boolean;
		shortcut?: string;
	};

	let allActions = $derived.by(() => {
		const actions: Record<string, ActionDef> = {};

		if (zoomLevel && zoomLevel !== 100) {
			actions['zoom'] = {
				id: 'zoom',
				label: `Reset Zoom (${zoomLevel}%)`,
				icon: `<span style="font-size:11px;font-weight:600">${zoomLevel}%</span>`, // Special case for zoom text
				handler: () => onresetZoom?.()
			};
		}

		if (currentFile && !showHome) {
			actions['open_loc'] = {
				id: 'open_loc',
				label: 'Open File Location',
				icon: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path><polyline points="15 13 18 13 18 10"></polyline><line x1="14" y1="14" x2="18" y2="10"></line></svg>`,
				handler: ononpenFileLocation
			};

			const ext = currentFile.split('.').pop()?.toLowerCase() || '';
			const isMarkdown = ['md', 'markdown', 'mdown', 'mkd'].includes(ext);

			if (isMarkdown) {
				actions['split'] = {
					id: 'split',
					label: 'Toggle Split View',
					icon: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><polyline points="16 17 21 12 16 7"></polyline><line x1="21" y1="12" x2="9" y2="12"></line><rect x="13" y="2" width="9" height="20" rx="2" ry="2" transform="rotate(0 13 2)"></rect></svg>`,
					handler: () => ontoggleSplit?.(),
					isActive: tabManager.activeTab?.isSplit,
					shortcut: 'H'
				};

				if (tabManager.activeTab?.isSplit) {
					actions['sync'] = {
						id: 'sync',
						label: 'Toggle Scroll Sync',
						icon: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path></svg>`,
						handler: () => ontoggleSync?.(),
						isActive: isScrollSynced
					};
				} else if (!isEditing) {
					actions['live'] = {
						id: 'live',
						label: 'Toggle Live Mode',
						icon: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0z" /><circle cx="12" cy="12" r="3" /></svg>`,
						handler: ontoggleLiveMode,
						isActive: liveMode
					};
				}

				if (hasMetadata) {
					actions['metadata'] = {
						id: 'metadata',
						label: 'Toggle Metadata',
						icon: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>`,
						handler: () => ontoggleMetadata?.(),
						isActive: showMetadata
					};
				}

				actions['toc'] = {
					id: 'toc',
					label: 'Toggle Table of Contents',
					icon: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="8" y1="6" x2="21" y2="6"></line><line x1="8" y1="12" x2="21" y2="12"></line><line x1="8" y1="18" x2="21" y2="18"></line><line x1="3" y1="6" x2="3.01" y2="6"></line><line x1="3" y1="12" x2="3.01" y2="12"></line><line x1="3" y1="18" x2="3.01" y2="18"></line></svg>`,
					handler: () => ontoggleToc?.(),
					isActive: showToc
				};

				if (!tabManager.activeTab?.isSplit) {
					actions['edit'] = {
						id: 'edit',
						label: 'Edit File',
						icon: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9" /><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" /></svg>`,
						handler: ontoggleEdit,
						isActive: isEditing,
						shortcut: 'E'
					};
				}
			}
		}

		actions['theme_scheme'] = {
			id: 'theme_scheme',
			label: `Theme: ${settings.themeScheme}`,
			icon: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="13.5" cy="6.5" r=".5" fill="currentColor"/><circle cx="17.5" cy="10.5" r=".5" fill="currentColor"/><circle cx="8.5" cy="7.5" r=".5" fill="currentColor"/><circle cx="6.5" cy="12.5" r=".5" fill="currentColor"/><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.688-1.688h1.938c3.105 0 5.625-2.52 5.625-5.625 0-4.62-4.62-8.75-10-8.75Z"/></svg>`,
			handler: cycleThemeScheme
		};

		actions['code_theme'] = {
			id: 'code_theme',
			label: `Code Theme: ${getCodeThemeLabel()}`,
			icon: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>`,
			handler: cycleCodeTheme
		};

		// Full-width toggle from upstream
		actions['full_width'] = {
			id: 'full_width',
			label: isFullWidth ? 'Exit Full Width' : 'Full Width',
			icon: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 3H3v18h18V3z"/><path d="M3 9h18"/><path d="M3 15h18"/></svg>`,
			handler: () => ontoggleFullWidth?.(),
			isActive: isFullWidth
		};

		// Settings from upstream
		actions['settings'] = {
			id: 'settings',
			label: 'Settings',
			icon: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>`,
			handler: () => onopenSettings?.()
		};

		return actions;
	});

	let visibleActions = $derived.by(() => {
		const result: ActionDef[] = [];
		// 1. Zoom is always visible if active
		if (allActions['zoom']) result.push(allActions['zoom']);

		// 2. Iterate through visible layout preference
		settings.toolbarLayout.visible.forEach(id => {
			if (allActions[id] && id !== 'zoom') {
				result.push(allActions[id]);
			}
		});
		
		return result;
	});

	let hiddenActions = $derived.by(() => {
		const result: ActionDef[] = [];
		// Iterate through hidden layout preference
		settings.toolbarLayout.hidden.forEach(id => {
			if (allActions[id] && id !== 'zoom') {
				result.push(allActions[id]);
			}
		});
		// Also add any actions that exist but aren't in either list (defaults to hidden or visible? Let's say visible to be safe, but here we check orphans)
		// Actually, constructor ensures all known IDs are in the list. Dynamic IDs like zoom are handled separately.
		return result;
	});

	function handleActionMove(e: MouseEvent, id: string, target: 'visible' | 'hidden') {
		e.preventDefault();
		settings.moveToolbarAction(id, target);
		showMoreMenu = false;
	}
</script>

<div class="custom-title-bar {isScrolled ? 'scrolled' : ''} {!isMac ? 'windows' : ''}">
	{#if !isMac && !isWin11}
		<div class="window-top-border"></div>
	{/if}
	<div class="window-controls-left" data-tauri-drag-region>
		{#if isMac}
			<div class="macos-traffic-lights" class:visible={isMac}>
				<button class="mac-btn mac-close" onclick={() => appWindow.close()} aria-label="Close">
					<svg width="6" height="6" viewBox="0 0 6 6" class="mac-icon"
						><path d="M0.5 0.5L5.5 5.5M5.5 0.5L0.5 5.5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" /></svg>
				</button>
				<button class="mac-btn mac-minimize" onclick={() => appWindow.minimize()} aria-label="Minimize">
					<svg width="6" height="6" viewBox="0 0 6 6" class="mac-icon"><path d="M0.5 3H5.5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" /></svg>
				</button>
				<button class="mac-btn mac-maximize" onclick={() => appWindow.toggleMaximize()} aria-label="Maximize">
					<svg width="6" height="6" viewBox="0 0 6 6" class="mac-icon"><path d="M0.5 3H5.5M3 0.5V5.5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" /></svg>
				</button>
			</div>
		{/if}
		<button class="icon-home-btn {showHome ? 'active' : ''}" onclick={ontoggleHome} aria-label="Home" onmouseenter={(e) => showTooltip(e, 'Home')} onmouseleave={hideTooltip}>
			<img src={iconUrl} alt="icon" class="window-icon" />
		</button>
	</div>

	{#if tabManager.tabs.length > 0}
		<div class="tab-area">
			<TabList onnewTab={() => tabManager.addNewTab()} {ondetach} {showHome} {ontabclick} {oncloseTab} />
		</div>
	{:else}
		<div class="window-title-container" data-tauri-drag-region>
			<div class="window-title {isFocused ? 'focused' : 'unfocused'}" data-tauri-drag-region>
				<span class="title-text" data-tauri-drag-region>
					{windowTitle}
				</span>
			</div>
		</div>
	{/if}

	<div class="title-actions" data-tauri-drag-region>
		{#each visibleActions as action (action.id)}
			<div animate:flip={{ duration: 250 }} class="action-btn-wrapper">
				{#if action.id === 'zoom'}
					<button
						class="zoom-indicator"
						onclick={action.handler}
						transition:fly={{ y: -10, duration: 150 }}
						aria-label={action.label}
						onmouseenter={(e) => showTooltip(e, action.label)}
						onmouseleave={hideTooltip}>
						{@html action.icon}
					</button>
				{:else}
					<button
						class="title-action-btn {action.isActive ? 'active' : ''}"
						onclick={action.handler}
						oncontextmenu={(e) => handleActionMove(e, action.id, 'hidden')}
						aria-label={action.label}
						onmouseenter={(e) => showTooltip(e, action.label, action.shortcut)}
						onmouseleave={hideTooltip}
						transition:fly={{ x: 10, duration: 200 }}>
						{@html action.icon}
					</button>
				{/if}
			</div>
		{/each}

		{#if hiddenActions.length > 0}
			<div class="action-btn-wrapper relative">
				<button
					class="title-action-btn {showMoreMenu ? 'active' : ''}"
					onclick={() => (showMoreMenu = !showMoreMenu)}
					aria-label="More Actions"
					title="More Actions"
					onmouseenter={(e) => showTooltip(e, 'More Actions')}
					onmouseleave={hideTooltip}>
					<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/></svg>
				</button>
				{#if showMoreMenu}
					<MoreMenu
						actions={hiddenActions}
						onaction={(id) => {
							allActions[id]?.handler();
							showMoreMenu = false;
						}}
						oncontextmenu={(e, id) => handleActionMove(e, id, 'visible')} />
				{/if}
			</div>
		{/if}
	</div>

	<div class="window-controls-right" data-tauri-drag-region>
		{#if !isMac}
			<button class="control-btn" onclick={() => appWindow.minimize()} aria-label="Minimize">
				<svg width="12" height="12" viewBox="0 0 12 12"><rect fill="currentColor" width="10" height="1" x="1" y="6" /></svg>
			</button>
			<button class="control-btn" onclick={() => appWindow.toggleMaximize()} aria-label="Maximize">
				<svg width="12" height="12" viewBox="0 0 12 12"><rect fill="none" stroke="currentColor" stroke-width="1" width="9" height="9" x="1.5" y="1.5" /></svg>
			</button>
			<button
				class="control-btn close-btn"
				onclick={() => {
					console.log('Close button clicked');
					appWindow.close();
				}}
				aria-label="Close">
				<svg width="12" height="12" viewBox="0 0 12 12"><path fill="currentColor" d="M11 1.7L10.3 1 6 5.3 1.7 1 1 1.7 5.3 6 1 10.3 1.7 11 6 6.7 10.3 11 11 10.3 6.7 6z" /></svg>
			</button>
		{/if}
	</div>
</div>

<div class="custom-tooltip {tooltip.visible ? 'visible' : ''} align-{tooltip.align}" style="left: {tooltip.x}px; top: {tooltip.y}px;">
	<span class="tooltip-text">{tooltip.text}</span>
	{#if tooltip.shortcut}
		<span class="tooltip-shortcut">{tooltip.shortcut}</span>
	{/if}
</div>

<style>
	.custom-title-bar {
		height: 36px;
		background-color: var(--color-canvas-default);
		display: flex;
		justify-content: space-between;
		align-items: center;
		user-select: none;
		position: fixed;
		top: 0;
		left: 0;
		right: 0;
		z-index: 9999;
		font-family: var(--win-font);
		border-bottom: 1px solid transparent;
		transition: border-color 0.2s;
	}

	.window-top-border {
		position: absolute;
		top: 0;
		left: 0;
		right: 0;
		height: 1px;
		background-color: var(--color-window-border-top);
		z-index: 10002;
		pointer-events: none;
	}

	.custom-title-bar.scrolled {
		border-bottom-color: var(--color-border-muted);
	}

	.tab-area {
		display: flex;
		flex: 1;
		height: 100%;
		overflow: hidden;
		min-width: 0;
	}

	.window-controls-left {
		display: flex;
		align-items: center;
		padding-left: 10px;
		gap: 12px;
		position: relative;
		z-index: 10000;
	}

	.title-actions {
		display: flex;
		gap: 4px;
		margin-right: 8px;
		margin-left: auto;
		z-index: 10000;
	}

	.action-btn-wrapper.relative {
		position: relative;
	}

	.actions-wrapper {
		display: flex;
		gap: 4px;
	}

	.title-action-btn {
		width: 28px;
		height: 28px;
		display: flex;
		justify-content: center;
		align-items: center;
		background: transparent;
		border: none;
		color: var(--color-fg-muted);
		border-radius: 4px;
		cursor: pointer;
		transition: all 0.1s;
	}

	.title-action-btn.active {
		color: var(--color-accent-fg);
		background: var(--color-canvas-subtle);
	}

	.title-action-btn:hover {
		background: var(--color-canvas-subtle);
		color: var(--color-fg-default);
	}

	.window-icon {
		width: 16px;
		height: 16px;
		opacity: 0.8;
	}

	@media (prefers-color-scheme: light) {
		.window-icon {
			filter: grayscale(1) brightness(0.2);
			opacity: 0.6;
		}
	}

	.icon-home-btn {
		background: transparent;
		border: none;
		padding: 4px;
		margin: -4px;
		border-radius: 4px;
		display: flex;
		align-items: center;
		justify-content: center;
		cursor: pointer;
		transition: background 0.1s;
	}

	.icon-home-btn:hover,
	.icon-home-btn.active {
		background: var(--color-canvas-subtle);
	}

	.window-title-container {
		position: absolute;
		left: 0;
		right: 0;
		top: 0;
		bottom: 0;
		display: flex;
		justify-content: center;
		align-items: center;
		z-index: 5;
	}

	.window-title {
		font-size: 12px;
		transition: opacity 0.2s;
		white-space: nowrap;
		overflow: hidden;
		max-width: 50%;
		display: flex;
	}

	.window-title.focused {
		opacity: 0.8;
		color: var(--color-fg-default);
	}

	.window-title.unfocused {
		opacity: 0.4;
		color: var(--color-fg-default);
	}

	.window-controls-right {
		display: flex;
		height: 100%;
		position: relative;
		z-index: 10000;
	}

	.control-btn {
		width: 46px;
		height: 32px;
		display: flex;
		justify-content: center;
		align-items: center;
		background: transparent;
		border: none;
		color: var(--color-fg-default);
		opacity: 0.8;
		cursor: default;
		transition: all 0.1s;
	}

	.control-btn:hover {
		background: var(--color-canvas-subtle);
		opacity: 1;
	}

	.close-btn:hover {
		background: #e81123 !important;
	}

	.zoom-indicator {
		background: var(--color-canvas-subtle);
		color: var(--color-fg-muted);
		border: 1px solid var(--color-border-default);
		border-radius: 4px;
		padding: 2px 8px;
		font-size: 11px;
		cursor: pointer;
		margin-right: 8px;
		display: flex;
		align-items: center;
		height: 24px;
		align-self: center;
		transition: all 0.1s;
	}

	.zoom-indicator:hover {
		background: var(--color-btn-hover-bg);
		color: var(--color-fg-default);
		border-color: var(--color-border-muted);
	}

	/* macOS Traffic Lights */
	.macos-traffic-lights {
		display: flex;
		gap: 8px;
		margin-right: 12px;
		align-items: center;
		padding-left: 2px;
	}

	.mac-btn {
		width: 12px;
		height: 12px;
		border-radius: 50%;
		border: 1px solid rgba(0, 0, 0, 0.1);
		display: flex;
		justify-content: center;
		align-items: center;
		padding: 0;
		cursor: default;
		outline: none;
		position: relative;
		overflow: hidden;
	}

	.mac-close {
		background-color: #ff5f57;
		border-color: #e0443e;
	}

	.mac-minimize {
		background-color: #febc2e;
		border-color: #d3a125;
	}

	.mac-maximize {
		background-color: #28c840;
		border-color: #1ca431;
	}

	.mac-icon {
		opacity: 0;
		color: #4d0000;
		transition: opacity 0.1s;
	}

	.mac-minimize .mac-icon {
		color: #995700;
	}

	.mac-maximize .mac-icon {
		color: #006500;
	}

	.macos-traffic-lights:hover .mac-icon {
		opacity: 0.6;
	}

	.mac-btn:active {
		filter: brightness(0.9);
	}

	.custom-tooltip {
		position: fixed;
		background: var(--color-canvas-overlay);
		color: var(--color-fg-default);
		padding: 4px 8px;
		border-radius: 6px;
		font-size: 11px;
		font-family: var(--win-font), 'Segoe UI', sans-serif;
		pointer-events: none;
		z-index: 10005;
		transform: translateX(-50%) translateY(-4px);
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
		border: 1px solid var(--color-border-default);
		display: flex;
		flex-direction: column;
		align-items: center;
		white-space: nowrap;
		gap: 2px;
		opacity: 0;
		transition:
			opacity 0.15s ease,
			transform 0.15s ease,
			width 0.2s cubic-bezier(0.2, 0, 0.2, 1),
			height 0.2s cubic-bezier(0.2, 0, 0.2, 1);
	}

	/* Alignment Base Transforms (Hidden State) */
	.custom-tooltip.align-center {
		transform: translateX(-50%) translateY(-4px);
	}
	.custom-tooltip.align-left {
		transform: translateX(0) translateY(-4px);
		align-items: flex-start;
	}
	.custom-tooltip.align-right {
		transform: translateX(-100%) translateY(-4px);
		align-items: flex-end;
	}

	/* Alignment Visible Transforms */
	.custom-tooltip.visible {
		opacity: 1;
	}
	.custom-tooltip.visible.align-center {
		transform: translateX(-50%) translateY(0);
	}
	.custom-tooltip.visible.align-left {
		transform: translateX(0) translateY(0);
	}
	.custom-tooltip.visible.align-right {
		transform: translateX(-100%) translateY(0);
	}

	.tooltip-shortcut {
		color: var(--color-fg-muted);
		font-size: 10px;
		font-family: inherit;
	}
</style>
