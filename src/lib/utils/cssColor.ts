/**
 * CSS 颜色字面量校验（P1-C-3，自 utils/theme.ts 原样迁出为叶子模块）。
 *
 * why：utils/theme.ts 的 vscode 主题注入与 utils/themeApply.ts 的
 * vscode:<name> 代码主题注入（C2）都要把外部 .vsix 值插值进全局样式表；
 * 后者 import 前者会成环（theme→themeBridge→themeApply→theme），故下沉为
 * 双方共用的零依赖叶子，theme.ts 保持同名导出兼容既有消费点。
 *
 * Values taken from an imported VS Code theme end up concatenated into a global
 * `<style>` block. Anything that is not a colour literal could close the rule and
 * open a new one (`#fff; } * { display:none; background-image:url(https://evil) } :root {`),
 * which repaints or hides the whole UI on every launch because the theme name is
 * persisted. Validate before the value is ever interpolated.
 */
const hexColorPattern = /^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const numericComponent = String.raw`(?:\d{1,3}(?:\.\d+)?%?)`;
const alphaComponent = String.raw`(?:\d{1,3}(?:\.\d+)?%?|\.\d+)`;
const rgbColorPattern = new RegExp(
	`^rgba?\\(\\s*${numericComponent}\\s*(?:,\\s*${numericComponent}\\s*){2}(?:,\\s*${alphaComponent}\\s*)?\\)$`,
	'i',
);
const rgbSpaceColorPattern = new RegExp(
	`^rgba?\\(\\s*${numericComponent}\\s+${numericComponent}\\s+${numericComponent}\\s*(?:\\/\\s*${alphaComponent}\\s*)?\\)$`,
	'i',
);

const namedColors = new Set([
	'transparent',
	'currentcolor',
	'black',
	'silver',
	'gray',
	'grey',
	'white',
	'maroon',
	'red',
	'purple',
	'fuchsia',
	'green',
	'lime',
	'olive',
	'yellow',
	'navy',
	'blue',
	'teal',
	'aqua',
	'cyan',
	'magenta',
	'orange',
]);

export function isSafeCssColor(value: unknown): value is string {
	if (typeof value !== 'string') return false;
	const trimmed = value.trim();
	if (!trimmed || trimmed.length > 64) return false;
	if (hexColorPattern.test(trimmed)) return true;
	if (rgbColorPattern.test(trimmed) || rgbSpaceColorPattern.test(trimmed)) return true;
	return namedColors.has(trimmed.toLowerCase());
}

export function isHexColor(value: unknown): value is string {
	return typeof value === 'string' && hexColorPattern.test(value.trim());
}
