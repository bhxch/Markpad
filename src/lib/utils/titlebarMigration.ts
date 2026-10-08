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

// ---------------------------------------------------------------------------
// D20：迁移一次性化（spec 2026-10-09-titlebar-placement-migration-marker-design）。
// 注册表 entry 位于上游 settings.svelte.ts，按防冲突规则其 load 只留接线行；
// 迁移判定与标记读写的全部逻辑收在本文件（本地命名空间，只依赖叶子模块）。
// ---------------------------------------------------------------------------

const PLACEMENT_MIGRATED_KEY = 'titlebar.placementMigrated';

function hasStorage(): boolean {
	return typeof localStorage !== 'undefined' && typeof localStorage.getItem === 'function';
}

/** 与 settings.svelte.ts 私有 parseStoredRecord 同语义（镜像，避免跨文件导出私有件）。 */
function parsePlacementRecord(value: string | null): Record<string, unknown> | null {
	if (value === null) return null;
	try {
		const parsed = JSON.parse(value);
		return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null;
	} catch {
		return null;
	}
}

/**
 * 注册表 load 用的 placement 解析：迁移机会一次性消耗。
 * 标记键已存在 → 内容判定不再参与，存量表原样返回（真实自定义即便恰与旧默认表
 * 全等——如把 theme 两键右键移回 'menu'——也不得再被重置）；标记不存在 → 按 I1
 * 内容判定（命中则返回 null = 重置为新默认表），无论命中与否随即落标记。
 */
export function loadTitlebarPlacement(raw: string | null): Record<string, unknown> | null {
	const parsed = parsePlacementRecord(raw);
	const migrated = hasStorage() && localStorage.getItem(PLACEMENT_MIGRATED_KEY) === 'true';
	const reset = !migrated && migrateLegacyThemePlacement(parsed);
	if (hasStorage() && !migrated) localStorage.setItem(PLACEMENT_MIGRATED_KEY, 'true');
	return reset ? null : parsed;
}
