/**
 * 存量 titlebar placement 一次性迁移判定（spec 2026-10-07-theme-restore §I1）。
 *
 * why：T8 把 theme_scheme/code_theme 的默认 placement 从 'menu' 改 'bar'，但存量
 * 安装的持久化表（titlebar.toolbarPlacement）里两键仍是 'menu'——恢复"栏上常驻"
 * 只对全新安装生效。
 *
 * 独立本地文件而非并入 titlebarBridge：bridge import settings store，settings 的
 * 注册表 load 再 import bridge 即成 store↔bridge 环；本模块只依赖叶子
 * titlebarToolbar.ts，无环。
 */
import { DEFAULT_TITLEBAR_TOOLBAR_PLACEMENT } from './titlebarToolbar.js';

/** 旧默认表：当前默认表但 theme 两键仍为 T8 之前默认（'menu'）的那个版本。 */
const LEGACY_DEFAULT_PLACEMENT: Record<string, unknown> = Object.fromEntries(
	Object.entries(DEFAULT_TITLEBAR_TOOLBAR_PLACEMENT).map(([id, placement]) => [
		id,
		id === 'theme_scheme' || id === 'code_theme' ? 'menu' : placement,
	]),
);

/**
 * 存量表与旧默认表逐键全等（含键集相等）时返回 true = 用户从未自定义，可整体
 * 重置为新默认表；任意键偏离即视为真自定义，调用方保持存量不动。
 * 接线点：settings.svelte.ts 的 titlebar.toolbarPlacement 注册表 load。
 */
export function migrateLegacyThemePlacement(stored: Record<string, unknown> | null | undefined): boolean {
	if (!stored) return false;
	const legacyEntries = Object.entries(LEGACY_DEFAULT_PLACEMENT);
	if (Object.keys(stored).length !== legacyEntries.length) return false;
	return legacyEntries.every(([id, placement]) => stored[id] === placement);
}
