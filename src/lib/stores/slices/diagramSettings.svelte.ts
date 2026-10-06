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

	// 持久化统一走 stores/settings.svelte.ts 的 createSettingsPersistence() 注册表
	// （diagram.settings / diagram.rendererSettings / diagram.rustRendererSettings 三组键均已登记），
	// 本切片只承载状态与访问器，不直接读写 localStorage。

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
