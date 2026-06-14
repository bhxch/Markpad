<script lang="ts">
	import MarkdownViewer from '$lib/MarkdownViewer.svelte';
	import { onMount } from 'svelte';
	import '../styles.css';

	// Expose snapdom for tauri-plugin-connector screenshot fallback
	onMount(async () => {
		try {
			const mod = await import('@zumer/snapdom');
			(window as any).snapdom = mod.snapdom;
		} catch {}
	});
</script>

<MarkdownViewer />
