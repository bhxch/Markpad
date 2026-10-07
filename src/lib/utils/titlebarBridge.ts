/**
 * 标题栏右键手势（spec T9，推翻 D14"接受放弃"）：右键栏上按钮移入溢出菜单、
 * 右键菜单项移回栏上。底层复用上游 placement 机制，逻辑留在本地文件。
 */
import { settings } from '../stores/settings.svelte.js';

export function moveActionByContextmenu(e: MouseEvent, from: 'bar' | 'menu'): void {
	const target = e.target as Element | null;
	const btn = target?.closest?.('[data-action-id]') as HTMLElement | null;
	if (!btn?.dataset.actionId) return;
	e.preventDefault();
	settings.setTitlebarToolbarActionPlacement(btn.dataset.actionId, from === 'bar' ? 'menu' : 'bar');
}
