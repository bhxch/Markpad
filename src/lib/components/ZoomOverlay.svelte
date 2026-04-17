<script lang="ts">
	import { fade } from 'svelte/transition';
	import { onMount } from 'svelte';
	import { t } from '../utils/i18n.js';
	import { settings } from '../stores/settings.svelte.js';

	export type ViewableItem = {
		type: 'img' | 'svg';
		src?: string;
		html?: string;
	};

	let { items, initialIndex = 0, onclose } = $props<{
		items: ViewableItem[];
		initialIndex?: number;
		onclose: () => void;
	}>();

	let currentIndex = $state(initialIndex);
	let zoom = $state(1);
	let panX = $state(0);
	let panY = $state(0);
	let isDragging = $state(false);
	let startX = 0;
	let startY = 0;
	let transitioning = $state(false);
	let navigateTimer: ReturnType<typeof setTimeout>;

	const MIN_ZOOM = 0.1;
	const MAX_ZOOM = 10;
	const ZOOM_STEP = 0.15;

	let currentItem = $derived(items[currentIndex]);
	let hasMultiple = $derived(items.length > 1);

	function resetView() {
		zoom = 1;
		panX = 0;
		panY = 0;
	}

	function navigateTo(index: number) {
		if (index < 0 || index >= items.length) return;
		clearTimeout(navigateTimer);
		transitioning = true;
		navigateTimer = setTimeout(() => {
			currentIndex = index;
			resetView();
			setTimeout(() => { transitioning = false; }, 50);
		}, 150);
	}

	function navigatePrev() {
		if (currentIndex > 0) navigateTo(currentIndex - 1);
	}

	function navigateNext() {
		if (currentIndex < items.length - 1) navigateTo(currentIndex + 1);
	}

	function zoomIn() {
		const newZoom = zoom * (1 + ZOOM_STEP);
		if (newZoom <= MAX_ZOOM) zoom = newZoom;
	}

	function zoomOut() {
		const newZoom = zoom * (1 - ZOOM_STEP);
		if (newZoom >= MIN_ZOOM) zoom = newZoom;
	}

	function fitToWindow() {
		zoom = 1;
		panX = 0;
		panY = 0;
	}

	function handleWheel(e: WheelEvent) {
		e.preventDefault();
		const delta = -e.deltaY;
		const factor = delta > 0 ? 1.1 : 0.9;
		const newZoom = zoom * factor;
		if (newZoom >= MIN_ZOOM && newZoom <= MAX_ZOOM) {
			zoom = newZoom;
		}
	}

	function handleMouseDown(e: MouseEvent) {
		if (e.button !== 0) return;
		isDragging = true;
		startX = e.clientX - panX;
		startY = e.clientY - panY;
	}

	function handleMouseMove(e: MouseEvent) {
		if (!isDragging) return;
		panX = e.clientX - startX;
		panY = e.clientY - startY;
	}

	function handleMouseUp() {
		isDragging = false;
	}

	function handleKeydown(e: KeyboardEvent) {
		switch (e.key) {
			case 'Escape':
				onclose();
				break;
			case 'ArrowLeft':
				navigatePrev();
				break;
			case 'ArrowRight':
				navigateNext();
				break;
			case '+':
			case '=':
				zoomIn();
				break;
			case '-':
				zoomOut();
				break;
			case 'r':
			case 'R':
				resetView();
				break;
			case 'f':
			case 'F':
				fitToWindow();
				break;
		}
	}

	onMount(() => {
		window.addEventListener('keydown', handleKeydown);
		return () => window.removeEventListener('keydown', handleKeydown);
	});
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="zoom-overlay" transition:fade={{ duration: 150 }} onclick={onclose} role="presentation">
	<button class="close-btn" onclick={onclose} aria-label={t('common.close', settings.language)}>
		<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
			<line x1="18" y1="6" x2="6" y2="18"></line>
			<line x1="6" y1="6" x2="18" y2="18"></line>
		</svg>
	</button>

	{#if hasMultiple}
		<button
			class="nav-btn nav-prev"
			onclick={(e) => { e.stopPropagation(); navigatePrev(); }}
			disabled={currentIndex === 0}
			aria-label="Previous"
		>
			<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
				<polyline points="15 18 9 12 15 6"></polyline>
			</svg>
		</button>
		<button
			class="nav-btn nav-next"
			onclick={(e) => { e.stopPropagation(); navigateNext(); }}
			disabled={currentIndex === items.length - 1}
			aria-label="Next"
		>
			<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
				<polyline points="9 18 15 12 9 6"></polyline>
			</svg>
		</button>
	{/if}

	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div
		class="zoom-content"
		onclick={(e) => e.stopPropagation()}
		onwheel={handleWheel}
		onmousedown={handleMouseDown}
		onmousemove={handleMouseMove}
		onmouseup={handleMouseUp}
		onmouseleave={handleMouseUp}
		class:transitioning
		style="transform: translate({panX}px, {panY}px) scale({zoom}); cursor: {isDragging ? 'grabbing' : 'grab'}"
	>
		{#if currentItem?.type === 'img' && currentItem.src}
			<img src={currentItem.src} alt="Zoomed view" />
		{:else if currentItem?.type === 'svg' && currentItem.html}
			<div class="svg-container">{@html currentItem.html}</div>
		{/if}
	</div>

	{#if hasMultiple}
		<div class="indicator" onclick={(e) => e.stopPropagation()}>
			{currentIndex + 1} / {items.length}
		</div>
	{/if}
</div>

<style>
	.zoom-overlay {
		position: fixed;
		top: 36px;
		left: 0;
		right: 0;
		bottom: 0;
		background: rgba(0, 0, 0, 0.9);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 50000;
		overflow: hidden;
	}

	.close-btn {
		position: absolute;
		top: 24px;
		right: 24px;
		background: rgba(255, 255, 255, 0.1);
		border: 1px solid rgba(255, 255, 255, 0.1);
		color: white;
		width: 44px;
		height: 44px;
		border-radius: 50%;
		display: flex;
		align-items: center;
		justify-content: center;
		cursor: pointer;
		z-index: 50001;
		transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
	}

	.close-btn:hover {
		background: rgba(255, 255, 255, 0.2);
		transform: scale(1.05);
	}

	.close-btn:active {
		transform: scale(0.95);
	}

	.nav-btn {
		position: absolute;
		top: 50%;
		transform: translateY(-50%);
		background: rgba(255, 255, 255, 0.1);
		border: 1px solid rgba(255, 255, 255, 0.1);
		color: white;
		width: 44px;
		height: 44px;
		border-radius: 50%;
		display: flex;
		align-items: center;
		justify-content: center;
		cursor: pointer;
		z-index: 50001;
		transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
	}

	.nav-btn:hover:not(:disabled) {
		background: rgba(255, 255, 255, 0.2);
		transform: translateY(-50%) scale(1.05);
	}

	.nav-btn:active:not(:disabled) {
		transform: translateY(-50%) scale(0.95);
	}

	.nav-btn:disabled {
		opacity: 0.2;
		cursor: not-allowed;
	}

	.nav-prev {
		left: 24px;
	}

	.nav-next {
		right: 24px;
	}

	.zoom-content {
		display: flex;
		align-items: center;
		justify-content: center;
		user-select: none;
		will-change: transform;
		transform-origin: center center;
		transition: opacity 0.15s ease;
	}

	.zoom-content.transitioning {
		opacity: 0;
	}

	img {
		max-width: 90vw;
		max-height: 85vh;
		object-fit: contain;
		pointer-events: none;
		box-shadow: 0 20px 50px rgba(0, 0, 0, 0.5);
		image-rendering: auto;
		border-radius: 4px;
	}

	.svg-container {
		background: var(--color-canvas-default);
		padding: 32px;
		border-radius: 8px;
		box-shadow: 0 20px 50px rgba(0, 0, 0, 0.5);
		overflow: hidden;
	}

	:global(.svg-container svg) {
		display: block;
		min-width: 400px;
		height: auto;
	}

	.indicator {
		position: absolute;
		bottom: 24px;
		left: 50%;
		transform: translateX(-50%);
		color: rgba(255, 255, 255, 0.7);
		font-size: 13px;
		font-family: var(--win-font, system-ui);
		z-index: 50001;
		user-select: none;
	}
</style>
