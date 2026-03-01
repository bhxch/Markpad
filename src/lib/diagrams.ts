/**
 * 图表渲染类型定义
 */

export type DiagramRenderMode = 'local' | 'kroki' | 'source';

export interface LocalRenderer {
	id: string;
	name: string;
	package: string;
	description?: string;
}

export interface DiagramType {
	id: string;
	name: string;
	supportedModes: DiagramRenderMode[];
	defaultMode: DiagramRenderMode;
	localRenderers?: LocalRenderer[];  // 可用的本地渲染库
	defaultRenderer?: string;  // 默认使用的本地渲染库 ID
	description?: string;
}

/**
 * 本地渲染库定义
 */
export const LOCAL_RENDERERS = {
	// GraphViz 渲染库
	'viz-js': {
		id: 'viz-js',
		name: '@viz-js/viz',
		package: '@viz-js/viz',
		description: 'GraphViz WASM 版本'
	},
	'hpcc-wasm': {
		id: 'hpcc-wasm',
		name: '@hpcc-js/wasm-graphviz',
		package: '@hpcc-js/wasm-graphviz',
		description: 'HPCC GraphViz WASM'
	},
	// nomnoml 渲染库
	'nomnoml-js': {
		id: 'nomnoml-js',
		name: 'nomnoml',
		package: 'nomnoml',
		description: 'Nomnoml 官方 JS 库'
	},
	// Vega/Vega-Lite 渲染库
	'vega-embed': {
		id: 'vega-embed',
		name: 'vega-embed',
		package: 'vega-embed',
		description: 'Vega 官方嵌入库'
	},
	// svgbob 渲染库
	'svgbob-wasm': {
		id: 'svgbob-wasm',
		name: 'svgbob-wasm',
		package: 'svgbob-wasm',
		description: 'Svgbob WASM 版本'
	},
	// BPMN 渲染库
	'bpmn-js': {
		id: 'bpmn-js',
		name: 'bpmn-js',
		package: 'bpmn-js',
		description: 'BPMN.io 官方库'
	},
	// Mermaid 渲染库
	'mermaid-js': {
		id: 'mermaid-js',
		name: 'mermaid',
		package: 'mermaid',
		description: 'Mermaid 官方 JS 库'
	}
} as const;

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
		localRenderers: [LOCAL_RENDERERS['mermaid-js']],
		defaultRenderer: 'mermaid-js',
		description: '流程图、时序图、甘特图等'
	},
	{
		id: 'graphviz',
		name: 'GraphViz (DOT)',
		supportedModes: ['local', 'kroki', 'source'],
		defaultMode: 'local',
		localRenderers: [LOCAL_RENDERERS['viz-js'], LOCAL_RENDERERS['hpcc-wasm']],
		defaultRenderer: 'viz-js',
		description: '有向图和无向图'
	},
	{
		id: 'plantuml',
		name: 'PlantUML',
		supportedModes: ['kroki', 'source'],
		defaultMode: 'kroki',
		description: 'UML 图表（需要 Kroki 服务）'
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
		supportedModes: ['local', 'kroki', 'source'],
		defaultMode: 'local',
		localRenderers: [LOCAL_RENDERERS['nomnoml-js']],
		defaultRenderer: 'nomnoml-js',
		description: 'UML 图表'
	},
	{
		id: 'bpmn',
		name: 'BPMN',
		supportedModes: ['local', 'kroki', 'source'],
		defaultMode: 'local',
		localRenderers: [LOCAL_RENDERERS['bpmn-js']],
		defaultRenderer: 'bpmn-js',
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
		supportedModes: ['local', 'kroki', 'source'],
		defaultMode: 'local',
		localRenderers: [LOCAL_RENDERERS['svgbob-wasm']],
		defaultRenderer: 'svgbob-wasm',
		description: 'ASCII 艺术转 SVG'
	},
	{
		id: 'vega',
		name: 'Vega',
		supportedModes: ['local', 'kroki', 'source'],
		defaultMode: 'local',
		localRenderers: [LOCAL_RENDERERS['vega-embed']],
		defaultRenderer: 'vega-embed',
		description: '可视化规范'
	},
	{
		id: 'vegalite',
		name: 'Vega-Lite',
		supportedModes: ['local', 'kroki', 'source'],
		defaultMode: 'local',
		localRenderers: [LOCAL_RENDERERS['vega-embed']],
		defaultRenderer: 'vega-embed',
		description: '高级可视化语法'
	}
];

// 语言别名映射
export const DIAGRAM_ALIASES: Record<string, string> = {
	'dot': 'graphviz',
	'vega-lite': 'vegalite'
};

// 获取默认设置
export function getDefaultDiagramSettings(): Record<string, DiagramRenderMode> {
	const settings: Record<string, DiagramRenderMode> = {};
	for (const diagram of DIAGRAM_TYPES) {
		settings[diagram.id] = diagram.defaultMode;
	}
	return settings;
}

// 获取默认渲染器设置
export function getDefaultRendererSettings(): Record<string, string> {
	const settings: Record<string, string> = {};
	for (const diagram of DIAGRAM_TYPES) {
		if (diagram.defaultRenderer) {
			settings[diagram.id] = diagram.defaultRenderer;
		}
	}
	return settings;
}

// 根据语言 ID 获取图表类型
export function getDiagramType(langId: string): DiagramType | undefined {
	const normalizedId = DIAGRAM_ALIASES[langId] || langId;
	return DIAGRAM_TYPES.find(d => d.id === normalizedId);
}

// 根据图表 ID 和渲染器 ID 获取渲染器信息
export function getLocalRenderer(diagramId: string, rendererId: string): LocalRenderer | undefined {
	const diagram = getDiagramType(diagramId);
	if (!diagram?.localRenderers) return undefined;
	return diagram.localRenderers.find(r => r.id === rendererId);
}

// Kroki 支持的语言列表
export const KROKI_LANGUAGES = [
	'plantuml', 'c4plantuml', 
	'graphviz', 'dot', 
	'ditaa', 
	'excalidraw', 
	'blockdiag', 'nwdiag', 'actdiag', 'seqdiag', 
	'erd', 'nomnoml', 'bpmn', 'pikchr', 'svgbob', 'vega', 'vegalite',
	'mermaid'
];