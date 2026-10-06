<script lang="ts">
	import { settings } from '../../stores/settings.svelte.js';
	import { DIAGRAM_TYPES, type DiagramRenderMode } from '../../diagrams';
</script>

<div class="settings-group">
	<h2>Diagram Render Settings</h2>
	<p class="settings-description">Configure how different diagram types are rendered in the preview.</p>

	<div class="diagram-settings-list">
		{#each DIAGRAM_TYPES as diagram}
			<div class="diagram-setting-item">
				<div class="diagram-info">
					<span class="diagram-name">{diagram.name}</span>
					{#if diagram.description}
						<span class="diagram-desc">{diagram.description}</span>
					{/if}
				</div>
				<div class="diagram-controls">
					<div class="select-wrapper">
						<select
							id="diagram-{diagram.id}"
							value={settings.diagramSettings[diagram.id]}
							onchange={(e) => settings.setDiagramRenderMode(diagram.id, e.currentTarget.value as DiagramRenderMode)}
						>
							{#each diagram.supportedModes as mode}
								<option value={mode}>
									{#if mode === 'local'}
										Local (JS/WASM)
									{:else if mode === 'rust'}
										Local (Rust)
									{:else if mode === 'kroki'}
										Kroki
									{:else}
										Source Code
									{/if}
								</option>
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
					{#if diagram.supportedModes.includes('local') && diagram.localRenderers && diagram.localRenderers.length > 1 && settings.diagramSettings[diagram.id] === 'local'}
						<div class="select-wrapper renderer-select">
							<select
								id="renderer-{diagram.id}"
								value={settings.diagramRendererSettings[diagram.id] || diagram.defaultRenderer}
								onchange={(e) => settings.setDiagramRenderer(diagram.id, e.currentTarget.value)}
							>
								{#each diagram.localRenderers as renderer}
									<option value={renderer.id}>{renderer.name}</option>
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
					{/if}
					{#if diagram.supportedModes.includes('rust') && diagram.rustRenderers && diagram.rustRenderers.length > 1 && settings.diagramSettings[diagram.id] === 'rust'}
						<div class="select-wrapper renderer-select">
							<select
								id="rust-renderer-{diagram.id}"
								value={settings.diagramRustRendererSettings[diagram.id] || diagram.defaultRustRenderer}
								onchange={(e) => settings.setDiagramRustRenderer(diagram.id, e.currentTarget.value)}
							>
								{#each diagram.rustRenderers as renderer}
									<option value={renderer.id}>{renderer.name}</option>
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
					{/if}
				</div>
			</div>
		{/each}
	</div>
</div>

<div class="settings-group">
	<div class="settings-group-header">
		<h2>Kroki Settings</h2>
		<button
			class="reset-text-btn"
			class:disabled={settings.krokiHost === 'https://kroki.io'}
			onclick={() => (settings.krokiHost = 'https://kroki.io')}>
			Reset to default
		</button>
	</div>

	<div class="setting-item">
		<label for="kroki-host">Kroki Host</label>
		<input
			type="url"
			id="kroki-host"
			class="text-input"
			placeholder="https://kroki.io"
			bind:value={settings.krokiHost}
		/>
	</div>
	<p class="setting-hint">自定义 Kroki 服务地址，支持自托管服务。默认使用 https://kroki.io</p>
</div>

<style>
	/* ---- 共享类（从 Settings.svelte 复制，原文件保留） ---- */
	.settings-group h2 {
		font-size: 16px;
		font-weight: 600;
		margin: 0 0 16px 0;
		color: var(--color-fg-default);
	}

	.settings-group-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: 16px;
	}

	.settings-group-header h2 {
		font-size: 16px;
		font-weight: 600;
		margin: 0;
		color: var(--color-fg-default);
	}

	.reset-text-btn {
		background: transparent;
		border: none;
		color: var(--color-fg-muted);
		font-size: 13px;
		cursor: pointer;
		padding: 0;
		transition: all 0.1s;
		text-decoration: none;
	}

	.reset-text-btn:hover:not(.disabled) {
		color: var(--color-accent-fg);
	}

	.reset-text-btn.disabled {
		opacity: 0.5;
		cursor: default;
	}

	.setting-item {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 10px 0;
		border-bottom: 1px solid var(--color-border-muted);
	}

	.setting-item label:first-child {
		font-size: 13px;
		color: var(--color-fg-default);
		display: flex;
		align-items: center;
		height: 100%;
	}

	.select-wrapper {
		position: relative;
		display: inline-flex;
		align-items: center;
	}

	.select-arrow {
		position: absolute;
		right: 10px;
		pointer-events: none;
		color: var(--color-fg-muted);
	}

	.text-input {
		padding: 6px 12px;
		border: 1px solid var(--color-border-default);
		border-radius: 6px;
		background-color: var(--color-canvas-default);
		color: var(--color-fg-default);
		font-size: 13px;
		min-width: 200px;
		flex: 1;
		max-width: 280px;
	}

	.text-input:focus {
		outline: none;
		border-color: var(--color-accent-fg);
	}

	.text-input::placeholder {
		color: var(--color-fg-muted);
	}

	/* ---- Diagrams/Kroki 专属样式（自 Settings.svelte 迁入） ---- */
	.setting-hint {
		font-size: 12px;
		color: var(--color-fg-muted);
		margin: 8px 0 0 0;
		line-height: 1.4;
	}

	.settings-description {
		font-size: 12px;
		color: var(--color-fg-muted);
		margin: -8px 0 16px 0;
		line-height: 1.4;
	}

	.diagram-settings-list {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	.diagram-setting-item {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 8px 0;
		border-bottom: 1px solid var(--color-border-muted);
	}

	.diagram-setting-item:last-child {
		border-bottom: none;
	}

	.diagram-info {
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.diagram-name {
		font-size: 13px;
		color: var(--color-fg-default);
		font-weight: 500;
	}

	.diagram-desc {
		font-size: 11px;
		color: var(--color-fg-muted);
	}

	.diagram-setting-item .select-wrapper select {
		min-width: 140px;
	}

	.diagram-controls {
		display: flex;
		align-items: center;
		gap: 8px;
	}

	.renderer-select select {
		min-width: 160px;
		font-size: 12px;
	}
</style>
