/**
 * 本地图表渲染器
 * 支持多种图表语言的 JS/WASM 本地渲染
 */

import type { LocalRenderer } from './diagrams';

// 渲染器缓存
let vizInstance: any = null;
let nomnomlModule: any = null;
let vegaEmbed: any = null;
let svgbobWasm: any = null;
let bpmnViewer: any = null;

/**
 * GraphViz 渲染 (@viz-js/viz)
 */
export async function renderGraphViz(code: string, rendererId: string): Promise<string> {
	if (rendererId === 'hpcc-wasm') {
		// @hpcc-js/wasm-graphviz (动态导入)
		const hpcc = await import('@hpcc-js/wasm-graphviz');
		const graphviz = await hpcc.Graphviz.load();
		return graphviz.layout(code, 'svg', 'dot');
	} else {
		// 默认使用 @viz-js/viz
		if (!vizInstance) {
			const viz = await import('@viz-js/viz');
			vizInstance = await viz.instance();
		}
		const svg = vizInstance.renderSVGElement(code);
		return svg.outerHTML;
	}
}

/**
 * nomnoml 渲染
 */
export async function renderNomnoml(code: string): Promise<string> {
	if (!nomnomlModule) {
		nomnomlModule = await import('nomnoml');
	}
	// nomnoml.renderSvg 返回 SVG 字符串
	const svg = nomnomlModule.draw(code);
	return svg;
}

/**
 * Vega 渲染
 */
export async function renderVega(spec: string): Promise<string> {
	if (!vegaEmbed) {
		vegaEmbed = (await import('vega-embed')).default;
	}
	
	// 创建临时容器
	const container = document.createElement('div');
	
	try {
		const specObj = JSON.parse(spec);
		const result = await vegaEmbed(container, specObj, {
			actions: false,
			renderer: 'svg'
		});
		return container.innerHTML;
	} catch (e) {
		throw new Error(`Vega render error: ${e}`);
	}
}

/**
 * Vega-Lite 渲染
 */
export async function renderVegaLite(spec: string): Promise<string> {
	if (!vegaEmbed) {
		vegaEmbed = (await import('vega-embed')).default;
	}
	
	const container = document.createElement('div');
	
	try {
		const specObj = JSON.parse(spec);
		const result = await vegaEmbed(container, specObj, {
			actions: false,
			renderer: 'svg'
		});
		return container.innerHTML;
	} catch (e) {
		throw new Error(`Vega-Lite render error: ${e}`);
	}
}

/**
 * svgbob 渲染
 */
export async function renderSvgbob(code: string): Promise<string> {
	if (!svgbobWasm) {
		svgbobWasm = await import('svgbob-wasm');
	}
	
	const svg = await svgbobWasm.render(code);
	return svg;
}

/**
 * BPMN 渲染 (bpmn-js)
 */
export async function renderBpmn(code: string): Promise<string> {
	// 动态导入 bpmn-js
	if (!bpmnViewer) {
		const BpmnJS = (await import('bpmn-js/lib/NavigatedViewer.js')).default;
		bpmnViewer = BpmnJS;
	}
	
	const container = document.createElement('div');
	container.style.width = '100%';
	container.style.minHeight = '200px';
	
	const viewer = new bpmnViewer({
		container
	});
	
	try {
		await viewer.importXML(code);
		// 获取 SVG
		const canvas = viewer.get('canvas');
		canvas.zoom('fit-viewport');
		
		// 提取 SVG 内容
		const svgElement = container.querySelector('svg');
		if (svgElement) {
			return svgElement.outerHTML;
		}
		throw new Error('Failed to extract SVG from BPMN viewer');
	} catch (e) {
		throw new Error(`BPMN render error: ${e}`);
	} finally {
		viewer.destroy();
	}
}

/**
 * 统一渲染入口
 * @param diagramId 图表类型 ID
 * @param code 源代码
 * @param rendererId 渲染器 ID
 * @returns 渲染后的 SVG/HTML 字符串
 */
export async function renderLocalDiagram(
	diagramId: string,
	code: string,
	rendererId: string
): Promise<string> {
	switch (diagramId) {
		case 'graphviz':
			return renderGraphViz(code, rendererId);
		
		case 'nomnoml':
			return renderNomnoml(code);
		
		case 'vega':
			return renderVega(code);
		
		case 'vegalite':
			return renderVegaLite(code);
		
		case 'svgbob':
			return renderSvgbob(code);
		
		case 'bpmn':
			return renderBpmn(code);
		
		// Mermaid 由 MarkdownViewer.svelte 单独处理（已有实现）
		
		default:
			throw new Error(`No local renderer for diagram type: ${diagramId}`);
	}
}

/**
 * 检查图表类型是否支持本地渲染
 */
export function supportsLocalRender(diagramId: string): boolean {
	return ['graphviz', 'nomnoml', 'vega', 'vegalite', 'svgbob', 'bpmn', 'mermaid'].includes(diagramId);
}
