/**
 * 本地图表渲染器
 * 支持多种图表语言的 JS/WASM 本地渲染
 */

import { invoke } from '@tauri-apps/api/core';
import type { Renderer } from './diagrams';

// 渲染器缓存
let vizInstance: any = null;
let vegaEmbed: any = null;
let bpmnViewer: any = null;
let nomnomlModule: any = null;
let excalidrawUtils: any = null;

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
 * nomnoml 渲染
 */
export async function renderNomnoml(code: string): Promise<string> {
	if (!nomnomlModule) {
		nomnomlModule = await import('nomnoml');
	}
	// nomnoml.renderSvg 返回 SVG 字符串
	return nomnomlModule.renderSvg(code);
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
 * Excalidraw 渲染 (@excalidraw/utils)
 */
export async function renderExcalidraw(code: string): Promise<string> {
	if (!excalidrawUtils) {
		excalidrawUtils = await import('@excalidraw/utils');
	}
	
	try {
		// 解析 JSON 数据
		const data = JSON.parse(code);
		
		// Excalidraw 数据格式：
		// { type: "excalidraw", elements: [...], appState: {...} }
		// 或者直接是 { elements: [...], appState: {...} }
		const elements = data.elements || [];
		const appState = data.appState || {};
		
		// 使用 exportToSvg 渲染
		const svg = await excalidrawUtils.exportToSvg({
			elements,
			appState: {
				...appState,
				exportBackground: true,
				viewBackgroundColor: appState.viewBackgroundColor || '#ffffff'
			}
		});
		
		return svg.outerHTML;
	} catch (e) {
		throw new Error(`Excalidraw render error: ${e}`);
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
		
		case 'bpmn':
			return renderBpmn(code);
		
		case 'excalidraw':
			return renderExcalidraw(code);
		
		// Mermaid 由 MarkdownViewer.svelte 单独处理（已有实现）
		
		default:
			throw new Error(`No local renderer for diagram type: ${diagramId}`);
	}
}

/**
 * 检查图表类型是否支持本地渲染
 */
export function supportsLocalRender(diagramId: string): boolean {
	return ['graphviz', 'nomnoml', 'vega', 'vegalite', 'bpmn', 'excalidraw', 'mermaid'].includes(diagramId);
}

/**
 * 检查图表类型是否支持 Rust 渲染
 */
export function supportsRustRender(diagramId: string): boolean {
	return ['graphviz', 'svgbob'].includes(diagramId);
}

/**
 * Rust 渲染 GraphViz (使用 layout-rs)
 */
export async function renderGraphVizRust(code: string): Promise<string> {
	return await invoke<string>('render_graphviz_rust', { code });
}

/**
 * Rust 渲染 svgbob (使用 svgbob crate)
 */
export async function renderSvgbobRust(code: string): Promise<string> {
	return await invoke<string>('render_svgbob_rust', { code });
}

/**
 * 统一 Rust 渲染入口
 * @param diagramId 图表类型 ID
 * @param code 源代码
 * @param rendererId 渲染器 ID
 * @returns 渲染后的 SVG 字符串
 */
export async function renderRustDiagram(
	diagramId: string,
	code: string,
	rendererId: string
): Promise<string> {
	switch (diagramId) {
		case 'graphviz':
			return renderGraphVizRust(code);
		
		case 'svgbob':
			return renderSvgbobRust(code);
		
		default:
			throw new Error(`No Rust renderer for diagram type: ${diagramId}`);
	}
}
