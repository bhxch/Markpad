<script lang="ts">
	import { fade, scale } from 'svelte/transition';
	import { i18n, type Locale } from '../i18n';

	export type ExportFormat = 'html' | 'pdf';
	export type PdfPageSize = 'dynamic' | 'a4' | 'a3' | 'letter' | 'legal';

	// Reactive translations
	let t = $state(i18n.getAll());
	let currentLocale = $state(i18n.getLocale());

	function updateTranslations() {
		t = i18n.getAll();
		currentLocale = i18n.getLocale();
	}

	let {
		show,
		onexport,
		oncancel,
	} = $props<{
		show: boolean;
		onexport: (format: ExportFormat, pageSize: PdfPageSize) => void;
		oncancel: () => void;
	}>();

	let format = $state<ExportFormat>('html');
	let pageSize = $state<PdfPageSize>('dynamic');

	const pageSizes: { value: PdfPageSize }[] = [
		{ value: 'dynamic' },
		{ value: 'a4' },
		{ value: 'a3' },
		{ value: 'letter' },
		{ value: 'legal' },
	];

	function getPageSizeLabel(size: PdfPageSize): string {
		switch (size) {
			case 'dynamic': return t.dynamicSinglePage;
			default: return size.toUpperCase();
		}
	}

	let modalContent = $state<HTMLDivElement>();
	let previousActiveElement: HTMLElement | null = null;

	$effect(() => {
		if (show) {
			previousActiveElement = document.activeElement as HTMLElement;
			setTimeout(() => {
				const focusable = modalContent?.querySelector('button.primary') as HTMLElement;
				if (focusable) {
					focusable.focus();
				} else {
					modalContent?.focus();
				}
			}, 50);
		} else if (previousActiveElement) {
			previousActiveElement.focus();
		}
	});

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			e.preventDefault();
			oncancel();
		}
		if (e.key === 'Enter') {
			e.preventDefault();
			handleExport();
		}
	}

	function handleBackdropClick() {
		oncancel();
	}

	function handleExport() {
		onexport(format, pageSize);
	}
</script>

{#if show}
	<div class="modal-backdrop" transition:fade={{ duration: 150 }} onclick={handleBackdropClick} role="presentation">
		<div
			class="modal-content"
			bind:this={modalContent}
			transition:scale={{ duration: 200, start: 0.95 }}
			onclick={(e) => e.stopPropagation()}
			role="dialog"
			aria-modal="true"
			tabindex="-1"
			onkeydown={handleKeydown}>
			<div class="modal-header">
				<h3>{t.export}</h3>
			</div>
			<div class="modal-body">
				<div class="form-group">
					<label class="form-label">{t.exportFormat}</label>
					<div class="radio-group">
						<label class="radio-item">
							<input type="radio" name="format" value="html" bind:group={format} />
							<span>{t.exportHtml}</span>
						</label>
						<label class="radio-item">
							<input type="radio" name="format" value="pdf" bind:group={format} />
							<span>{t.exportPdf}</span>
						</label>
					</div>
				</div>

				{#if format === 'pdf'}
					<div class="form-group">
						<label class="form-label">{t.pdfSize}</label>
						<select class="select-input" bind:value={pageSize}>
							{#each pageSizes as size}
								<option value={size.value}>{getPageSizeLabel(size.value)}</option>
							{/each}
						</select>
					</div>
				{/if}
			</div>
			<div class="modal-footer">
				<button class="modal-btn secondary" onclick={oncancel}>{t.cancel}</button>
				<button class="modal-btn primary" onclick={handleExport}>{t.export}</button>
			</div>
		</div>
	</div>
{/if}

<style>
	.modal-backdrop {
		position: fixed;
		top: 0;
		left: 0;
		right: 0;
		bottom: 0;
		background: rgba(0, 0, 0, 0.4);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 30000;
	}

	.modal-content {
		background: var(--color-canvas-default);
		border: 1px solid var(--color-border-default);
		border-radius: 6px;
		width: 400px;
		max-width: 90vw;
		box-shadow: 0 20px 50px rgba(0, 0, 0, 0.3);
		overflow: hidden;
		font-family: var(--win-font);
	}

	.modal-header {
		padding: 20px 24px 12px 24px;
	}

	.modal-header h3 {
		margin: 0;
		font-size: 16px;
		font-weight: 600;
		color: var(--color-fg-default);
	}

	.modal-body {
		padding: 0 24px 24px 24px;
	}

	.form-group {
		margin-bottom: 16px;
	}

	.form-group:last-child {
		margin-bottom: 0;
	}

	.form-label {
		display: block;
		font-size: 13px;
		font-weight: 500;
		color: var(--color-fg-default);
		margin-bottom: 8px;
	}

	.radio-group {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	.radio-item {
		display: flex;
		align-items: center;
		gap: 8px;
		cursor: pointer;
		font-size: 14px;
		color: var(--color-fg-default);
	}

	.radio-item input[type="radio"] {
		margin: 0;
		cursor: pointer;
	}

	.select-input {
		width: 100%;
		padding: 8px 12px;
		font-size: 14px;
		border: 1px solid var(--color-border-default);
		border-radius: 6px;
		background: var(--color-canvas-default);
		color: var(--color-fg-default);
		cursor: pointer;
		font-family: inherit;
	}

	.select-input:focus {
		outline: none;
		border-color: var(--color-accent-fg);
	}

	.modal-footer {
		padding: 16px 24px;
		background: var(--color-canvas-subtle);
		display: flex;
		align-items: center;
		justify-content: flex-end;
		gap: 8px;
		border-top: 1px solid var(--color-border-muted);
	}

	.modal-btn {
		padding: 6px 16px;
		border-radius: 6px;
		font-size: 14px;
		font-weight: 500;
		cursor: pointer;
		transition: all 0.1s;
		border: 1px solid transparent;
		font-family: inherit;
	}

	.modal-btn.secondary {
		background: transparent;
		color: var(--color-fg-default);
		border-color: var(--color-border-default);
	}

	.modal-btn.secondary:hover {
		background: var(--color-neutral-muted);
	}

	.modal-btn.primary {
		background: #0078d4;
		color: white;
	}

	.modal-btn.primary:hover {
		filter: brightness(1.1);
	}
</style>
