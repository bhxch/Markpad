/**
 * themeRollback.test.ts 的可执行复刻件（T6-fix 防回归支撑，非运行时代码）。
 *
 * 与 MarkdownViewer.svelte 上游 theme effect 同形：依赖面只有 settings.theme，
 * effect 体内调 syncMermaidTheme + applyAppearanceTheme（两者内部会读
 * themeSettingsSlice 的响应式状态）。untrack 位置必须与 MarkdownViewer 的修复
 * 一一对应，否则本件失真、测试失去咬合意义。
 *
 * untrack 由测试注入而非本模块 import 'svelte'：local-unit 轨 'svelte' 落
 * server 入口（其 untrack 是无抑制力的透传 run），必须用与编译产物同一实例的
 * 客户端 untrack 才能真实表达"断依赖边"（范式见 ThemeSettingsSection.test.ts）。
 */
import { settings } from '../stores/settings.svelte.js';
import { applyAppearanceTheme } from './themeBridge.js';
import { syncMermaidTheme } from '../pipeline/diagrams.js';

export interface ThemeEffectHost {
	/** effect 实际执行次数（初始一次计 1）。 */
	readonly runs: number;
	/** 销毁 effect root。 */
	dispose(): void;
}

export function createThemeEffectHost(untrack: <T>(fn: () => T) => T): ThemeEffectHost {
	let runs = 0;
	const dispose = $effect.root(() => {
		$effect(() => {
			runs++;
			// 唯一应有的依赖：上游"更改主题"下拉的 settings.theme。
			const theme = settings.theme;
			// T6-fix：主题切片读取是"附带消费"——syncMermaidTheme 读 themeScheme
			// （→themeSchemes[mode]+mode 派生链）。若被追踪，setThemeScheme（方案即
			// 模式：写 mode+scheme 槽）会被误判为依赖变化而重放本 effect，
			// applyAppearanceTheme(陈旧 theme) 再 setMode(旧模式) 把刚选的方案回滚
			// （GUI 实测双向复现）。untrack 只断依赖边，副作用照常执行。
			untrack(() => syncMermaidTheme());
			// T6-fix：applyAppearanceTheme→applyTheme 内部读切片（uiThemeSource/mode/
			// currentSchemeId/resolveCodeTheme），同属附带消费；且它还写切片 mode，
			// 读写同在一个 effect 即成响应式环——untrack 一并断掉。切片变化的属性
			// 重放由 settings store 自己的 applyTheme effect 负责，不在这里。
			untrack(() => applyAppearanceTheme(theme));
		});
	});
	return {
		get runs() {
			return runs;
		},
		dispose
	};
}
