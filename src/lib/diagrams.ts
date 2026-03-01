/**
 * 图表渲染类型定义
 */

export type DiagramRenderMode = 'local' | 'kroki' | 'source';

export interface DiagramType {
	id: string;
	name: string;
	supportedModes: DiagramRenderMode[];
	defaultMode: DiagramRenderMode;
	description?: string;
}

/**
 * 支持的图表类型及其渲染方式
 * 
 * local: 本地 Web 渲染 (JS/WASM)
 * kroki: Kroki 服务渲染
 * source: 显示源码
 */
export const DIAGRAM_TYPES: DiagramType[] = [
	{
		id: 'mermaid',
		name: 'Mermaid',
		supportedModes: ['local', 'kroki', 'source'],
		defaultMode: 'local',
		description: '流程图、时序图、甘特图等'
	},
	{
		id: 'graphviz',
		name: 'GraphViz (DOT)',
		supportedModes: ['kroki', 'source'],
		defaultMode: 'kroki',
		description: '有向图和无向图'
	},
	{
		id: 'plantuml',
		name: 'PlantUML',
		supportedModes: ['kroki', 'source'],
		defaultMode: 'kroki',
		description: 'UML 图表'
	},
	{
		id: 'c4plantuml',
		name: 'C4 PlantUML',
		supportedModes: ['kroki', 'source'],
		defaultMode: 'kroki',
		description: 'C4 架构图'
	},
	{
		id: 'ditaa',
		name: 'Ditaa',
		supportedModes: ['kroki', 'source'],
		defaultMode: 'kroki',
		description: 'ASCII 艺术转图片'
	},
	{
		id: 'excalidraw',
		name: 'Excalidraw',
		supportedModes: ['kroki', 'source'],
		defaultMode: 'kroki',
		description: '手绘风格图表'
	},
	{
		id: 'blockdiag',
		name: 'BlockDiag',
		supportedModes: ['kroki', 'source'],
		defaultMode: 'kroki',
		description: '块状图'
	},
	{
		id: 'nwdiag',
		name: 'NwDiag',
		supportedModes: ['kroki', 'source'],
		defaultMode: 'kroki',
		description: '网络拓扑图'
	},
	{
		id: 'actdiag',
		name: 'ActDiag',
		supportedModes: ['kroki', 'source'],
		defaultMode: 'kroki',
		description: '活动图'
	},
	{
		id: 'seqdiag',
		name: 'SeqDiag',
		supportedModes: ['kroki', 'source'],
		defaultMode: 'kroki',
		description: '序列图'
	},
	{
		id: 'erd',
		name: 'ERD',
		supportedModes: ['kroki', 'source'],
		defaultMode: 'kroki',
		description: '实体关系图'
	},
	{
		id: 'nomnoml',
		name: 'Nomnoml',
		supportedModes: ['kroki', 'source'],
		defaultMode: 'kroki',
		description: 'UML 图表'
	},
	{
		id: 'bpmn',
		name: 'BPMN',
		supportedModes: ['kroki', 'source'],
		defaultMode: 'kroki',
		description: '业务流程图'
	},
	{
		id: 'pikchr',
		name: 'Pikchr',
		supportedModes: ['kroki', 'source'],
		defaultMode: 'kroki',
		description: '简单图表'
	},
	{
		id: 'svgbob',
		name: 'Svgbob',
		supportedModes: ['kroki', 'source'],
		defaultMode: 'kroki',
		description: 'ASCII 艺术转 SVG'
	},
	{
		id: 'vega',
		name: 'Vega',
		supportedModes: ['kroki', 'source'],
		defaultMode: 'kroki',
		description: '可视化规范'
	},
	{
		id: 'vegalite',
		name: 'Vega-Lite',
		supportedModes: ['kroki', 'source'],
		defaultMode: 'kroki',
		description: '高级可视化语法'
	}
];

// 语言别名映射
export const DIAGRAM_ALIASES: Record<string, string> = {
	'dot': 'graphviz'
};

// 获取默认设置
export function getDefaultDiagramSettings(): Record<string, DiagramRenderMode> {
	const settings: Record<string, DiagramRenderMode> = {};
	for (const diagram of DIAGRAM_TYPES) {
		settings[diagram.id] = diagram.defaultMode;
	}
	return settings;
}

// 根据语言 ID 获取图表类型
export function getDiagramType(langId: string): DiagramType | undefined {
	const normalizedId = DIAGRAM_ALIASES[langId] || langId;
	return DIAGRAM_TYPES.find(d => d.id === normalizedId);
}

// Kroki 支持的语言列表（不包含 mermaid）
export const KROKI_LANGUAGES = [
	'plantuml', 'c4plantuml', 
	'graphviz', 'dot', 
	'ditaa', 
	'excalidraw', 
	'blockdiag', 'nwdiag', 'actdiag', 'seqdiag', 
	'erd', 'nomnoml', 'bpmn', 'pikchr', 'svgbob', 'vega', 'vegalite'
];
