// pipeline/index.ts — MarkdownViewer 渲染管线统一入口（feat/upstream-merge-2 P1 插件化）
//
// 有序步骤：highlight → diagrams → copyCode → lightbox（brief 固定顺序；原 'katex' 步
// 已退役：span[data-math-style] 合并后零生产端，\[…\]/\(…\) 由后端 markdown_ext 预处理
// 为 $ 词汇、渲染由上游 richContent 的 renderMathInElement 接管，本地分支三重死代码）。
// - runPipeline(root, blocks?) 的 blocks 是 post-merge per-block 挂接（spec D5）：
//   Task 14 ⑦ 起语义定为"块级宿主集"（即 patch.inserted），各步骤内部用
//   leavesOfBlocks(blocks, 自己的叶子选择器) 映射命中集，或按自身契约保持 root 级
//   （diagrams：分发已先行；lightbox：items 全局收集契约）；undefined 仍全根扫描。
// - 渲染版本仍属 MarkdownViewer 组件状态：经 setPipelineVersionSource 注入读取，
//   runPipeline 开始时捕获一次；diagrams 的在途取消语义由其自身 versionGate 承担
//   （见 pipeline/diagrams 的 setDiagramVersionGate，MarkdownViewer 继续注入 (v) => v !== renderVersion）。
import { highlightCodeWithTreeSitterBlock } from './highlight';
import { setupDiagramWrappers, renderDiagramBlocks } from './diagrams';
import { DIAGRAM_ALIASES, getDiagramType } from '../diagrams';
import { injectCopyButtons } from './copyCode';
import { injectLightboxButtons } from './lightbox';

export interface PipelineStep {
	name: string;
	run(root: ParentNode, blocks?: Element[]): Promise<void>;
}

// 宿主→叶子映射（Task 14 ⑦）：patch.inserted 是块级宿主元素（p/pre/ul…），各步骤的
// 叶子选择器在宿主内仍可命中。映射 = 宿主自身命中 + 宿主内后代（与上游 richContent
// 的 selfAndDescendants 同形——"a root that IS a block"不能只靠 querySelectorAll）。
export function leavesOfBlocks(hosts: Element[], selector: string): Element[] {
	const out: Element[] = [];
	for (const host of hosts) {
		if (host.matches(selector)) out.push(host);
		out.push(...host.querySelectorAll(selector));
	}
	return out;
}

// hljs 懒加载（原 MarkdownViewer 组件 $state 自持；动态 import 全局缓存同一模块实例，行为等价）
let hljsLib: any = null;
async function ensureHljs(): Promise<any> {
	if (!hljsLib) {
		try {
			hljsLib = (await import('highlight.js')).default;
		} catch {
			hljsLib = null;
		}
	}
	return hljsLib;
}

// 渲染版本源（MarkdownViewer 注入 () => renderVersion；未注入时恒 0，空转场景无在途取消语义）
let versionSource: () => number = () => 0;
export function setPipelineVersionSource(fn: () => number): void {
	versionSource = fn;
}

// 版本敏感步骤的链内签名：第三可选参接收 runPipeline 开始时捕获的版本。
// 捕获值经参数整链传递（不用模块级可变量）：并发渲染下先启 run 的取消语义不受后启 run 影响，
// 与原实现 `version !== renderVersion`（函数参数闭包）逐点等价。
// 省略 version 直接单步调用时回退为调用时捕获（等价于该步自己的“开始时”）。
type VersionedRun = (root: ParentNode, blocks?: Element[], version?: number) => Promise<void>;

// 'highlight' 步：原 renderRichContent "3. Code Highlighting" 循环原样搬移
// （tree-sitter 优先 + hljs 兜底；Task 2 预留的“hljs 兜底逻辑随迁移并入”在此并入，
// 故不直接复用只做 tree-sitter 的 highlightBlocks——后者保留为独立导出）。
// blocks 语义（Task 14 ⑦）：块级宿主集（patch.inserted）→ 本步骤经 leavesOfBlocks
// 取 'pre code' 命中集，逐键只处理新块（tree-sitter 逐块 Tauri IPC，全根重扫代价
// 不可忽略）；undefined 仍全根扫描（detached/导出场景）。
async function runHighlight(root: ParentNode, blocks?: Element[], version: number = versionSource()): Promise<void> {
	const codeBlocks = blocks ? leavesOfBlocks(blocks, 'pre code') : root.querySelectorAll('pre code');
	for (const block of Array.from(codeBlocks)) {
		if (version !== versionSource()) return; // stale render（原 version !== renderVersion）
		if (block.closest('.diagram-wrapper')) continue; // Skip diagrams

		const langClass = Array.from(block.classList).find((c) => c.startsWith('language-'));
		const lang = langClass ? langClass.replace('language-', '').toLowerCase() : '';
		const normalizedLang = DIAGRAM_ALIASES[lang] || lang;
		if (getDiagramType(normalizedLang)) continue; // Skip diagrams (styled by the diagrams step)

		// Try tree-sitter first
		const tsSuccess = await highlightCodeWithTreeSitterBlock(block as HTMLElement, lang);

		// Fallback to hljs if tree-sitter failed
		if (!tsSuccess) {
			const hljs = await ensureHljs();
			if (hljs) {
				hljs.highlightElement(block as HTMLElement);
			}
		}
	}
}

// 'diagrams' 步：确保全局切换委托已安装（幂等，内部无 per-wrapper 动作）；
// 逐 wrapper 装配在 renderDiagramBlocks 内，捕获版本透传给其内部 versionGate。
// Task 14 分发接管（D12）后，预览的图表分发在上游 richContent 之前对 inserted 发生
// （MarkdownViewer 挂接链），本步保留为 root 级兜底：.diagram-wrapper 守卫使其对
// 已装配 wrapper 幂等空转，detached/导出场景仍可用。
async function runDiagrams(root: ParentNode, _blocks?: Element[], version: number = versionSource()): Promise<void> {
	setupDiagramWrappers(root);
	await renderDiagramBlocks(root, version);
}

// 'copyCode' 步：stale render 检查（原与高亮同循环、逐块检查；本步纯同步，步级检查与之等价）
async function runCopyCode(root: ParentNode, blocks?: Element[], version: number = versionSource()): Promise<void> {
	if (version !== versionSource()) return;
	await injectCopyButtons(root, blocks ? leavesOfBlocks(blocks, 'pre code') : undefined);
}

// 'lightbox' 步：忽略 blocks——items 是"当前文档全部可查看项"的全局收集（图片点击
// 委托按 src 反查索引），须整根重收集；:scope 按钮清理守卫使其幂等不累积。
async function runLightbox(root: ParentNode): Promise<void> {
	await injectLightboxButtons(root);
}

// lightbox 步无版本检查（原实现即无），签名 (root, blocks?) 可赋给 VersionedRun（多传实参被忽略）
const stepEntries: [name: string, run: VersionedRun][] = [
	['highlight', runHighlight],
	['diagrams', runDiagrams],
	['copyCode', runCopyCode],
	['lightbox', runLightbox],
];

export function getPipeline(): PipelineStep[] {
	return stepEntries.map(([name, run]) => ({ name, run }));
}

export async function runPipeline(root: ParentNode, blocks?: Element[]): Promise<void> {
	const version = versionSource(); // 本次渲染版本，局部捕获并整链传递（并发安全）
	for (const [, run] of stepEntries) {
		await run(root, blocks, version);
	}
}
