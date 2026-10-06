// pipeline/copyCode.ts — 代码块复制按钮管线（从 MarkdownViewer.svelte 原样抽取）
//
// 抽取自 MarkdownViewer.svelte renderRichContent "3. Code Highlighting" 循环内的
// .lang-label 装配段（feat/upstream-merge-2 P1 插件化，为上游合并做物理隔离）。
// 原段与高亮同循环；此处拆为独立步骤（highlight 之后执行，对同一 DOM 行为等价）。
import { DIAGRAM_ALIASES, getDiagramType } from '../diagrams';

// Pipeline 步骤（spec D5）：为每个 pre>code 装配 .lang-label 复制按钮（点击复制 + 反馈）。
// 跳过图表块（.diagram-wrapper / 图表语言），与原循环守卫逐字一致。
// 合并后（Task 13，D5/D6 过渡形态）：上游 richContent 会把每个 pre 包进 .code-block-shell
// 并在壳上装配自己的 .lang-label（经 MV 的 onCopyCode 走 Tauri 剪贴板）。凡上游已装配
// 的块，本地注入让位（否则同块双按钮），本步骤只服务无壳的 pre（ detached/导出场景）。
// 两侧复制按钮的统一由 Task 14 深化。
export async function injectCopyButtons(root: ParentNode, blocks?: Element[]): Promise<void> {
	const codeBlocks = blocks ?? root.querySelectorAll('pre code');
	for (const block of Array.from(codeBlocks)) {
		if (block.closest('.diagram-wrapper')) continue; // Skip diagrams

		const langClass = Array.from(block.classList).find((c) => c.startsWith('language-'));
		const lang = langClass ? langClass.replace('language-', '').toLowerCase() : '';
		const normalizedLang = DIAGRAM_ALIASES[lang] || lang;
		if (getDiagramType(normalizedLang)) continue; // Skip diagrams (handled by pipeline/diagrams)

		const pre = block.parentElement;
		if (pre && pre.tagName === 'PRE') {
			// 上游 .code-block-shell 已有自己的壳级复制按钮：本地让位，防双按钮
			if (pre.parentElement?.classList.contains('code-block-shell')) continue;
			pre.querySelectorAll('.lang-label').forEach((l) => l.remove());
			const codeContent = (block as HTMLElement).textContent || '';

			// Create copy button
			const label = document.createElement('button');
			label.className = 'lang-label';
			label.title = 'Click to copy code';

			if (langClass) {
				label.textContent = langClass.replace('language-', '');
			} else {
				// Show copy icon for code blocks without language
				label.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>`;
			}

			label.onclick = () => {
				const codeToCopy = codeContent.replace(/\n$/, '');
				navigator.clipboard.writeText(codeToCopy).then(() => {
					const originalContent = label.innerHTML;
					label.textContent = 'Copied!';
					label.classList.add('copied');
					setTimeout(() => {
						label.innerHTML = originalContent;
						label.classList.remove('copied');
					}, 1500);
				}).catch((err) => {
					console.error('Failed to copy code:', err);
				});
			};

			pre.appendChild(label);
		}
	}
}
