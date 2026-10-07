<script lang="ts">
	import MarkdownViewer from '$lib/MarkdownViewer.svelte';
	import { onMount } from 'svelte';
	import '../styles.css';

	// Expose snapdom for tauri-plugin-connector screenshot fallback, and the
	// export pipeline for the tauri-connector e2e driver (scripts/export-e2e.mjs).
	// Both are pure DOM/string surfaces with no IPC of their own; the e2e driver
	// only exists in dev-connector builds.
	onMount(async () => {
		try {
			const mod = await import('@zumer/snapdom');
			(window as any).snapdom = mod.snapdom;
		} catch {}
		try {
			const exp = await import('$lib/export');
			(window as any).__markpadExport = { generateExportHtml: exp.generateExportHtml };
		} catch {}
	});
</script>

<MarkdownViewer />
