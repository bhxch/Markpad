// pipeline/lightbox.ts — 图片/图表 lightbox 按钮装配管线（从 MarkdownViewer.svelte 原样抽取）
//
// 抽取自 MarkdownViewer.svelte 的 LIGHTBOX_ICON + injectLightboxButtons
// （feat/upstream-merge-2 P1 插件化，为上游合并做物理隔离）。
// DOM 装配（收集可查看项 + 安装悬停按钮）归本模块；打开状态（viewableItems/lightboxIndex
// $state）与 ZoomOverlay 模板是 MarkdownViewer 组件 UI，无法进入纯步骤，
// 经 setLightboxOpener 回调桥接（与 pipeline/diagrams 的 setDiagramVersionGate 同一注入模式）。
import { i18n } from '../i18n';

export type LightboxItem = { type: 'img' | 'svg'; src?: string; html?: string };

const LIGHTBOX_ICON = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line><line x1="11" y1="8" x2="11" y2="14"></line><line x1="8" y1="11" x2="14" y2="11"></line></svg>`;

// 当前收集的可查看项（每次装配重新收集；MarkdownViewer 的图片点击委托按 src 反查索引用。
// 重收集走整体重赋值，旧数组引用不受影响，与原 `viewableItems = items` 赋值语义一致）
let items: LightboxItem[] = [];
export function getViewableItems(): LightboxItem[] {
	return items;
}

// 打开回调（MarkdownViewer 注入：设置 viewableItems/lightboxIndex $state → ZoomOverlay）
let opener: ((items: LightboxItem[], index: number) => void) | null = null;
export function setLightboxOpener(fn: (items: LightboxItem[], index: number) => void): void {
	opener = fn;
}

// 打开指定索引（原 `lightboxIndex = index` 的模块侧出口）
function openLightboxAt(index: number): void {
	if (opener) opener(items, index);
}

// Pipeline 步骤（spec D5）：收集可查看项（普通图片 + 已渲染图表）并安装悬停全屏按钮。
// 原 injectLightboxButtons 逐字搬移；调整项：markdownBody → root、`lightboxIndex = index` →
// openLightboxAt(index)、`t.viewFullscreen` → i18n.getAll().viewFullscreen（装配时取值等价）。
export async function injectLightboxButtons(root: ParentNode, blocks?: Element[]): Promise<void> {
	items = [];

	// Collect all <img> elements that are not inside diagram wrappers
	const images = (blocks ?? root.querySelectorAll('img')) as ArrayLike<HTMLImageElement>;
	for (const img of Array.from(images)) {
		// Skip small icons, emojis, and images already inside diagram wrappers
		if (img.closest('.diagram-wrapper')) continue;
		if (img.closest('.kroki-container')) continue;
		if (img.width > 0 && img.width < 32 && img.height > 0 && img.height < 32) continue;

		const src = img.getAttribute('src');
		if (!src) continue;

		const index = items.length;
		items.push({ type: 'img', src });

		// Wrap image if not already wrapped
		let wrapper = img.parentElement;
		if (!wrapper || wrapper.tagName !== 'DIV' || !wrapper.classList.contains('img-lightbox-wrapper')) {
			wrapper = document.createElement('div');
			wrapper.className = 'img-lightbox-wrapper';
			wrapper.style.position = 'relative';
			wrapper.style.display = 'inline-block';
			img.parentNode?.insertBefore(wrapper, img);
			wrapper.appendChild(img);
		}

		const btn = document.createElement('button');
		btn.className = 'img-lightbox-btn';
		btn.type = 'button';
		btn.innerHTML = LIGHTBOX_ICON;
		btn.title = i18n.getAll().viewFullscreen;
		btn.onclick = (e) => {
			e.stopPropagation();
			e.preventDefault();
			openLightboxAt(index);
		};
		wrapper.appendChild(btn);
	}

	// Collect diagram wrappers with rendered SVG or IMG output
	const diagramWrappers = root.querySelectorAll('.diagram-wrapper');
	for (const dw of Array.from(diagramWrappers)) {
		const renderEl = dw.querySelector('[data-diagram-render="true"]');
		if (!renderEl) continue;

		const svg = renderEl.querySelector('svg');
		const img = renderEl.querySelector('img');
		if (!svg && !img) continue;

		const index = items.length;
		if (svg) {
			items.push({ type: 'svg', html: svg.outerHTML });
		} else if (img) {
			items.push({ type: 'img', src: img.getAttribute('src') || '' });
		}

		const btn = document.createElement('button');
		btn.className = 'img-lightbox-btn';
		btn.type = 'button';
		btn.innerHTML = LIGHTBOX_ICON;
		btn.title = i18n.getAll().viewFullscreen;
		btn.onclick = (e) => {
			e.stopPropagation();
			e.preventDefault();
			openLightboxAt(index);
		};
		dw.appendChild(btn);
	}
}
