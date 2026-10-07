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
				if (!style || document.getElementById(id)) return;
				const el = document.createElement('style');
				el.id = id;
				// 裸规则文本写 textContent（fix C1）：innerHTML 会把文本当元素内容而非
				// 样式表源码解析，且保留值含 </style> 的注入面。
				el.textContent = style;
				document.head.appendChild(el);
			});
		}
	}
}

/** 跟随系统：prefers-color-scheme 变化时切槽位组合（T4）。重复安装幂等。 */
export function installSystemThemeWatcher(): () => void {
	if (systemWatcherDisposer || typeof matchMedia === 'undefined') return () => {};
	const mq = matchMedia('(prefers-color-scheme: dark)');
	const onChange = () => {
		if (themeSettingsSlice.followSystem) {
			themeSettingsSlice.mode = mq.matches ? 'dark' : 'light';
			applyTheme();
		}
	};
	mq.addEventListener('change', onChange);
	systemWatcherDisposer = () => {
		mq.removeEventListener('change', onChange);
		systemWatcherDisposer = null;
	};
	return systemWatcherDisposer;
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
			if (!settings?.foreground) continue; // 未命中不产声明，CSS 回落
			const font = settings.fontStyle ? `; font-style: ${settings.fontStyle}` : '';
			decls.push(`${variable}: ${settings.foreground}${font}`);
		}
		if (!decls.length) return '';
		// 选择器里的主题名是 CSS 字符串字面量，需转义引号与反斜杠以匹配原始值。
		const cssName = name.replace(/[\\"]/g, '\\$&');
		return `:root[data-code-theme="vscode:${cssName}"] { ${decls.join('; ')}; }`;
	} catch {
		return '';
	}
}
