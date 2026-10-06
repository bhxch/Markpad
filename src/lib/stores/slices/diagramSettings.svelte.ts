import type { DiagramRenderMode } from '../../diagrams';
import {
	getDefaultDiagramSettings,
	getDefaultRendererSettings,
	getDefaultRustRendererSettings,
	getDiagramType
} from '../../diagrams';

/**
 * 图表渲染设置切片（本地独有键）。
 *
 * 包含 localStorage 键：`diagram.settings`、`diagram.rendererSettings`、`diagram.rustRendererSettings`，
 * 以及 getDiagramRenderMode/getDiagramRenderer/getDiagramRustRenderer 等取值 helper。
 * 上游合并会重写 stores/settings.svelte.ts；本切片是本地独有资产（独立文件，零冲突），
 * 合并后在新的 settings.svelte.ts 中重新挂载透传即可恢复这些设置。
 */
export class DiagramSettingsSlice {
	// 图表渲染设置：每种图表的渲染模式
	diagramSettings = $state<Record<string, DiagramRenderMode>>(getDefaultDiagramSettings());

	// 图表渲染器选择：每种图表使用的本地渲染库 (JS/WASM)
	diagramRendererSettings = $state<Record<string, string>>(getDefaultRendererSettings());

	// 图表 Rust 渲染器选择：每种图表使用的 Rust 渲染库
	diagramRustRendererSettings = $state<Record<string, string>>(getDefaultRustRendererSettings());

	/** 从 localStorage 恢复（键名与历史版本保持一致，缺省键与默认值合并）；须在持久化 effect 建立之前调用 */
	load() {
		if (typeof localStorage === 'undefined') return;

		const savedDiagramSettings = localStorage.getItem('diagram.settings');
		const savedDiagramRendererSettings = localStorage.getItem('diagram.rendererSettings');
		const savedDiagramRustRendererSettings = localStorage.getItem('diagram.rustRendererSettings');

		if (savedDiagramSettings !== null) {
			try {
				const parsed = JSON.parse(savedDiagramSettings);
				// Merge with defaults to ensure all diagram types exist
				this.diagramSettings = { ...getDefaultDiagramSettings(), ...parsed };
			} catch (e) {
				console.error('Failed to parse diagram settings', e);
			}
		}
		if (savedDiagramRendererSettings !== null) {
			try {
				const parsed = JSON.parse(savedDiagramRendererSettings);
				// Merge with defaults
				this.diagramRendererSettings = { ...getDefaultRendererSettings(), ...parsed };
			} catch (e) {
				console.error('Failed to parse diagram renderer settings', e);
			}
		}
		if (savedDiagramRustRendererSettings !== null) {
			try {
				const parsed = JSON.parse(savedDiagramRustRendererSettings);
				// Merge with defaults
				this.diagramRustRendererSettings = { ...getDefaultRustRendererSettings(), ...parsed };
			} catch (e) {
				console.error('Failed to parse diagram rust renderer settings', e);
			}
		}
	}

	/** 持久化到 localStorage（键名不变）；须在 $effect 内调用以建立响应依赖 */
	persist() {
		if (typeof localStorage === 'undefined') return;

		localStorage.setItem('diagram.settings', JSON.stringify(this.diagramSettings));
		localStorage.setItem('diagram.rendererSettings', JSON.stringify(this.diagramRendererSettings));
		localStorage.setItem('diagram.rustRendererSettings', JSON.stringify(this.diagramRustRendererSettings));
	}

	setDiagramRenderMode(diagramId: string, mode: DiagramRenderMode) {
		this.diagramSettings[diagramId] = mode;
	}

	getDiagramRenderMode(diagramId: string): DiagramRenderMode {
		// First check if user has a saved setting
		if (this.diagramSettings[diagramId]) {
			return this.diagramSettings[diagramId];
		}
		// Fallback to default mode from DIAGRAM_TYPES
		const diagramType = getDiagramType(diagramId);
		return diagramType?.defaultMode || 'kroki';
	}

	setDiagramRenderer(diagramId: string, rendererId: string) {
		this.diagramRendererSettings[diagramId] = rendererId;
	}

	getDiagramRenderer(diagramId: string): string {
		return this.diagramRendererSettings[diagramId] || '';
	}

	setDiagramRustRenderer(diagramId: string, rendererId: string) {
		this.diagramRustRendererSettings[diagramId] = rendererId;
	}

	getDiagramRustRenderer(diagramId: string): string {
		return this.diagramRustRendererSettings[diagramId] || '';
	}
}

export const diagramSettingsSlice = new DiagramSettingsSlice();
