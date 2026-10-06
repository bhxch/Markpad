// pipeline/katex.ts — KaTeX 数学渲染管线（从 MarkdownViewer.svelte 原样抽取）
//
// 抽取自 MarkdownViewer.svelte renderRichContent 的 "5. Math Rendering" 段
// （feat/upstream-merge-2 P1 插件化，为上游合并做物理隔离）。
// - processLatexDelimiters：\[\...\] / \(...\) 定界符渲染（逐字搬移，container/katex 参数化）
// - renderKatex：pipeline 步骤入口（spec D5）；P1 行为不变，仍消费 span[data-math-style]
//   （上游 [data-math] 适配是后续合并后任务，spec D8）

// katex 懒加载（原 MV 组件 $state 自持；动态 import 全局缓存同一模块实例，行为等价）
let katexLib: any = null;
async function ensureKatex(): Promise<any> {
	if (!katexLib) {
		try {
			katexLib = (await import('katex')).default;
		} catch {
			katexLib = null;
		}
	}
	return katexLib;
}

// 原 processLatexDelimiters（逐字搬移；markdownBody → container、闭包 $state → katex 参数）
const processLatexDelimiters = (container: HTMLElement, katex: any) => {
	// Walk through text nodes and find delimiters
	const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, null);
	const textNodes: Text[] = [];
	while (walker.nextNode()) {
		const node = walker.currentNode as Text;
		// Skip if inside an already processed element or code blocks
		// code, pre elements contain code that should not be processed as math
		if (!node.parentElement?.closest('.katex, .katex-display, [data-math-style], code, pre')) {
			textNodes.push(node);
		}
	}

	for (const textNode of textNodes) {
		let text = textNode.textContent || '';
		const parent = textNode.parentElement;
		if (!parent) continue;

		// Check if this text contains LaTeX delimiters
		if (!text.includes('\\[') && !text.includes('\\(')) continue;

		// Replace \[...\] with display math
		text = text.replace(/\\\[([\s\S]*?)\\\]/g, (_, content) => {
			try {
				const html = katex.renderToString(content.trim(), {
					displayMode: true,
					throwOnError: false,
					strict: false,
				});
				return `<div class="katex-display">${html}</div>`;
			} catch (e) {
				return `\\[${content}\\]`;
			}
		});

		// Replace \(...\) with inline math
		text = text.replace(/\\\(([\s\S]*?)\\\)/g, (_, content) => {
			try {
				const html = katex.renderToString(content.trim(), {
					displayMode: false,
					throwOnError: false,
					strict: false,
				});
				return `<span class="katex">${html}</span>`;
			} catch (e) {
				return `\\(${content}\\)`;
			}
		});

		// Only update if changed
		if (text !== textNode.textContent) {
			const span = document.createElement('span');
			span.innerHTML = text;
			textNode.replaceWith(span);
		}
	}
};

// Pipeline 步骤（spec D5）：LaTeX 定界符 + comrak data-math-style 数学渲染。
// 原 "5. Math Rendering" 段原样搬移；katex 未就绪时整体跳过（原 `if (katex)` 守卫等价，
// 就绪时序仍由 MarkdownViewer onMount 预载保证）。
export async function renderKatex(root: ParentNode, blocks?: Element[]): Promise<void> {
	const katex = await ensureKatex();
	if (!katex) return;

	// First, handle LaTeX delimiters \[...\] and \(...\) which comrak doesn't process
	// We need to process these BEFORE handling data-math-style elements
	// to avoid interfering with already rendered KaTeX
	processLatexDelimiters(root as HTMLElement, katex);

	// Then handle comrak-generated math spans with data-math-style attribute
	const mathSpans = blocks ?? root.querySelectorAll('span[data-math-style]');
	for (const span of Array.from(mathSpans)) {
		const content = span.textContent || '';
		const isDisplay = span.getAttribute('data-math-style') === 'display';

		try {
			const html = katex.renderToString(content, {
				displayMode: isDisplay,
				throwOnError: false,
				strict: false,
			});

			if (isDisplay) {
				const wrapper = document.createElement('div');
				wrapper.className = 'katex-display';
				wrapper.innerHTML = html;
				span.replaceWith(wrapper);
			} else {
				span.innerHTML = html;
				span.classList.add('katex');
			}
		} catch (e) {
			console.error('KaTeX render error:', e, 'Content:', content);
		}
	}
}
