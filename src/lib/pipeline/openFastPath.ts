// D31（spec 2026-10-10 §2）：同内容重复打开短路判定。
// 已打开过的文件再次打开（重激活/重复点击最近文件）时，读到的字节与缓冲相同
// ⇒ comrak/process 输出必然相同（fold overrides 属 UI 态且现有 content 已反映），
// 跳过变换可省 ~100ms 主线程冻结。边界：脏缓冲绝不静默覆盖（#471 契约延续）、
// 编辑/分屏路径与 >5MB 切片读一律不短路。
export interface SkippableRenderTab {
	rawContent: string;
	content: string;
	isDirty: boolean;
	previewedRawContent?: string;
}

export function isIdenticalRenderSkippable(
	receiving: SkippableRenderTab | undefined | null,
	incomingContent: string,
	options: { isFull: boolean; editingLike: boolean },
): boolean {
	if (!receiving || receiving.isDirty || options.editingLike || !options.isFull) return false;
	if (receiving.content.length === 0) return false;
	if (receiving.rawContent !== incomingContent) return false;
	// previewedRawContent 存在且落后于 rawContent：现有渲染不反映当前缓冲
	// （另有武装重预览机制接管），此时不短路。
	if (receiving.previewedRawContent !== undefined && receiving.previewedRawContent !== receiving.rawContent) {
		return false;
	}
	return true;
}
