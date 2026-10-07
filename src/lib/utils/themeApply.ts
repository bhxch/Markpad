/**
 * 主题属性唯一写者（spec T6）：scheme 态写 data-theme / data-theme-mode /
 * data-theme-scheme / data-theme-type / data-code-theme，vscode 态写
 * data-theme（并带出 data-theme-mode、移除 data-theme-scheme），
 * 全部只从这里落 DOM（data-theme-type 的 vscode 探测发布除外，见 utils/theme.ts）。
 * 此前上游 MarkdownViewer 与本地 settings.applyTheme 双写者并存、
 * 本地 scheme 块特异性恒胜导致上游主题选择从不生效（spec §3.2-3）。
 */
import { invoke } from '@tauri-apps/api/core';
import { themeSettingsSlice } from '../stores/slices/themeSettings.svelte.js';
import { isSafeCssColor } from './cssColor.js'; // C2：P1-C-3 校验器（叶子模块，见 cssColor.ts 头注）

let systemWatcherDisposer: (() => void) | null = null;

export function applyTheme(): void {
	if (typeof document === 'undefined') return;
	const root = document.documentElement;
	const slice = themeSettingsSlice;

	if (slice.uiThemeSource === 'vscode') {
		// T7: VSCode UI 主题生效时不设 data-theme-scheme——本地 scheme CSS 块
		// 特异性 (0,3,0) 高于上游块，恒设会使 VSCode UI 永远被盖（历史缺陷）。
		root.setAttribute('data-theme', 'vscode');
		// data-theme-mode 始终是当前生效明暗：VSCode 主题由 utils/theme.ts 在解析
		// .vsix 时发布 data-theme-type（其真实明暗），未发布时退回切片当前模式。
		root.setAttribute('data-theme-mode', root.getAttribute('data-theme-type') || slice.mode);
		root.removeAttribute('data-theme-scheme');
	} else {
		root.setAttribute('data-theme', slice.mode);
		root.setAttribute('data-theme-mode', slice.mode);
		root.setAttribute('data-theme-scheme', slice.currentSchemeId);
		// T6 收编点：上游 MarkdownViewer 原在此直写/删除 data-theme-type（system 分支
		// 删除是为防 vscode 主题的探测值残留进 mermaid 的 system 明暗判定）。改由
		// themeApply 同步为当前生效明暗，currentMermaidTheme/resolveMermaidTheme 语义不变。
		root.setAttribute('data-theme-type', slice.mode);
		// deferred（本轮修复波）：vscode→scheme 切换时清理 parseAndApplyVscodeTheme
		// 设置在 documentElement 上的内联空白色残留。clearVscodeTheme 只被上游 theme
		// effect 的 system/light/dark 分支调用，纯本地方案切换（setThemeScheme）不经
		// 它，属性会一直残留。属性名与 theme.ts 的 setProperty 对应。
		root.style.removeProperty('--color-whitespace');
	}
	// T7：vscode:<name> 代码主题生效时挂载 .vsix tokenColors 派生的 --ts-* 覆盖块。
	// fire-and-forget：加载失败静默（CSS 回落当前主题的 --ts-* 静态值），保持同步签名。
	// fix(I1)：style 标签 id 同步可算，存在性检查前移到 invoke 之前——settings 变更
	// 重放 applyTheme 时直接短路，不重复磁盘 IO + JSON 解析；.then 内二次查防竞态。
	const codeTheme = slice.resolveCodeTheme();
	root.setAttribute('data-code-theme', codeTheme);
	if (codeTheme.startsWith('vscode:')) {
		const id = `ts-vscode-theme-${codeTheme}`;
		if (!document.getElementById(id)) {
			void buildVscodeCodeThemeStyle(codeTheme.slice('vscode:'.length)).then((style) => {
				// I2：构建返回空串（主题已删/读取失败）时移除同 id 旧标签，不留孤儿样式。
				if (!style) {
					document.getElementById(id)?.remove();
					return;
				}
				if (document.getElementById(id)) return;
				const el = document.createElement('style');
				el.id = id;
				// 裸规则文本写 textContent（fix C1）：innerHTML 会把文本当元素内容而非
				// 样式表源码解析，且保留值含 </style> 的注入面。
				el.textContent = style;
				document.head.appendChild(el);
			});
		}
	} else {
		// I2：代码主题离开 vscode:<name>（含删除主题回落 auto）时，遗留的 --ts-*
		// 注入标签选择器不再命中 data-code-theme，但不残留——活动代码主题唯一，
		// 非 vscode 态下现存 ts 标签全部为陈旧项。
		document.querySelectorAll('style[id^="ts-vscode-theme-"]').forEach((el) => el.remove());
	}
	// T6-fix（mermaid 触发链补偿）：untrack 修复后，MarkdownViewer 的上游 theme
	// effect 只依赖 settings.theme，纯配色方案切换（setThemeScheme 直写切片、不经
	// settings.theme）不再重放该 effect——syncMermaidTheme 原本由那次缺陷重放"误触"
	// 执行的链路断掉。本函数是属性唯一写者，settings store 的 applyTheme effect 在
	// 任一切片主题态变化时都重放到这里，mermaid 单例配置随属性重放同步刷新（后续
	// 渲染取到新主题；渲染前 diagrams.ts 另有再同步兜底）。
	// 接线用钩子而非本模块直接 import diagrams：diagrams → settings store → 本模块
	// 已是既成依赖方向，本模块再指向 diagrams 即成环；且 store 构造期（$effect.root
	// 首次重放同步执行）正处于 settings 模块求值中，vitest mocker 因 diagrams 子图
	// 携带被 mock 依赖而等待在途测试模块，任何形式（同步/微任务/宏任务延迟）的
	// 反向 import 都被按环语义提前兑现部分命名空间，diagrams 模块体不执行、模块级
	// let 落入永久 TDZ（实测）。钩子由 pipeline/diagrams.ts 在自身模块作用域注册
	// （diagrams → 本模块是无环新边，本模块对 diagrams 零依赖），未注册前本函数
	// 对 mermaid 不可知，行为同旧版。钩子内 syncMermaidTheme 只读切片并写 mermaid
	// 配置：在 store 的 applyTheme effect 里被追踪的读是其既有追踪面的子集，
	// 不新增依赖边、不成环。
	themeAppliedHook?.();
}

/**
 * applyTheme 属性重放后的附加钩子（T6-fix mermaid 触发链补偿的接线点）。
 * 由 pipeline/diagrams.ts 模块作用域注册为 syncMermaidTheme，见 applyTheme 内注释。
 */
let themeAppliedHook: (() => void) | null = null;

export function setThemeAppliedHook(hook: () => void): void {
	themeAppliedHook = hook;
}

/**
 * 跟随系统：prefers-color-scheme 变化时切槽位组合（T4）。
 * Minor3：幂等重装语义——已安装时先卸旧再装新，返回本次 disposer；旧 disposer
 * 只摘自己那对 (mq, onChange)，不会误卸新监听；settings store 构造器收口返回值，
 * dispose() 时随根卸载。
 */
export function installSystemThemeWatcher(): () => void {
	systemWatcherDisposer?.();
	if (typeof matchMedia === 'undefined') return () => {};
	const mq = matchMedia('(prefers-color-scheme: dark)');
	const onChange = () => {
		if (themeSettingsSlice.followSystem) {
			themeSettingsSlice.mode = mq.matches ? 'dark' : 'light';
			applyTheme();
		}
	};
	mq.addEventListener('change', onChange);
	const disposer = () => {
		mq.removeEventListener('change', onChange);
		if (systemWatcherDisposer === disposer) systemWatcherDisposer = null;
	};
	systemWatcherDisposer = disposer;
	return disposer;
}

/**
 * tokenColors scope → --ts-* 变量映射（T7）。变量名是 styles.css Tree-sitter 段
 * （dark-modern 块）的 27 个 `--ts-*` 全集，一个不多一个不少；scope 取 VSCode
 * tokenColors 惯例名（TextMate scope 名），method/macro/bracket 等 styles.css
 * 专属 token 就近映射到函数/标点类 scope。规则按 tokenColors 顺序取第一条
 * 命中项（具体 scope 在前、泛 scope 在后是 .vsix 惯例）；scope 未命中映射的
 * 变量不产声明，CSS 回落当前主题（dark-modern / light-modern 静态值）。
 */
const TS_TOKEN_SCOPE_MAP: Record<string, string[]> = {
	'--ts-comment': ['comment'],
	'--ts-keyword': ['keyword'],
	// keyword-control / string-regexp 追加泛 scope 回退（fix M2）：主题只写泛化
	// scope 时逼近 TextMate 的祖先继承语义，而非直接回落 CSS 静态值。
	'--ts-keyword-control': ['keyword.control', 'keyword'],
	'--ts-string': ['string'],
	'--ts-string-regexp': ['string.regexp', 'string'],
	'--ts-number': ['constant.numeric'],
	'--ts-constant': ['constant'],
	'--ts-constant-builtin': ['constant.language'],
	'--ts-boolean': ['constant.language.boolean', 'constant.language'],
	'--ts-type': ['entity.name.type', 'support.type'],
	'--ts-type-builtin': ['support.type', 'entity.name.type.builtin'],
	'--ts-function': ['entity.name.function', 'support.function'],
	'--ts-method': ['entity.name.function.method', 'entity.name.function'],
	'--ts-macro': ['entity.name.function.macro', 'entity.name.function'],
	'--ts-variable': ['variable'],
	'--ts-variable-builtin': ['variable.language', 'constant.language'],
	'--ts-parameter': ['variable.parameter'],
	'--ts-property': ['variable.other.property', 'support.variable.property'],
	'--ts-operator': ['keyword.operator'],
	'--ts-punctuation': ['punctuation'],
	'--ts-bracket': ['punctuation.definition.bracket', 'punctuation'],
	'--ts-constructor': ['entity.name.function.constructor', 'entity.name.function'],
	'--ts-namespace': ['entity.name.namespace', 'support.other.namespace'],
	'--ts-tag': ['entity.name.tag'],
	'--ts-attribute': ['entity.other.attribute-name'],
	'--ts-special': ['support.function'],
	'--ts-escape': ['constant.character.escape']
};

interface TokenRule {
	scope?: string | string[];
	settings?: { foreground?: string; fontStyle?: string };
}

/**
 * C2：fontStyle 白名单（P1-C-3 同规格）。.vsix 的 fontStyle 是自由文本，直接插值
 * 可闭合声明块注入新规则（`italic; } *{...}`）。只接受词表成员的空白分隔组合，
 * 含任何表外词整段丢弃；命中词映射为合法 CSS 声明（font-style: bold 非法）。
 */
const FONT_STYLE_DECLARATIONS: Record<string, string> = {
	italic: 'font-style: italic',
	bold: 'font-weight: bold',
	underline: 'text-decoration-line: underline',
	strikethrough: 'text-decoration-line: line-through',
};

function safeFontStyleDeclarations(value: string): string[] {
	const words = value.trim().split(/\s+/).filter(Boolean);
	if (!words.length || !words.every((w) => w in FONT_STYLE_DECLARATIONS)) return [];
	return words.map((w) => FONT_STYLE_DECLARATIONS[w]);
}

/**
 * T7（本任务实装）：vscode:<name> 代码主题的 --ts-* 注入。
 * 返回裸 CSS 规则文本（fix C1：不含 <style> 包裹——包裹由调用方写
 * <style> 元素完成；若在此包裹，注入后样式表内容以字面量 '<' 开头，
 * 首个选择器非法，整条规则被浏览器丢弃）。
 */
export async function buildVscodeCodeThemeStyle(name: string): Promise<string> {
	try {
		const json = JSON.parse(await invoke<string>('read_vscode_theme', { name })) as {
			tokenColors?: TokenRule[];
		};
		// 返回第一条 scope 命中且带 foreground 的规则的 settings；无命中返回 null。
		const settingsOf = (scopes: string[]): TokenRule['settings'] => {
			for (const rule of json.tokenColors ?? []) {
				const ruleScopes = Array.isArray(rule.scope) ? rule.scope : rule.scope ? [rule.scope] : [];
				if (ruleScopes.some((s) => scopes.includes(s)) && rule.settings?.foreground) {
					return rule.settings;
				}
			}
			return undefined;
		};
		const decls: string[] = [];
		for (const [variable, scopes] of Object.entries(TS_TOKEN_SCOPE_MAP)) {
			const settings = settingsOf(scopes);
			// C2：foreground 过 P1-C-3 颜色校验，非颜色字面量不产声明（CSS 回落）。
			if (!settings?.foreground || !isSafeCssColor(settings.foreground)) continue;
			const extra = settings.fontStyle ? safeFontStyleDeclarations(settings.fontStyle) : [];
			decls.push([`${variable}: ${settings.foreground.trim()}`, ...extra].join('; '));
		}
		if (!decls.length) return '';
		// 选择器里的主题名是 CSS 字符串字面量，需转义引号、反斜杠与 `]`
		// （C2：防属性选择器被截断/伪造），以匹配原始值。
		const cssName = name.replace(/[\\\]"]/g, '\\$&');
		return `:root[data-code-theme="vscode:${cssName}"] { ${decls.join('; ')}; }`;
	} catch {
		return '';
	}
}
