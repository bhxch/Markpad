// D30（spec 2026-10-10 §2）：enrichment 字符串级预检。
// 在进入全树 querySelectorAll / textContent 序列化之前，用一次字符串扫描判定
// 本文档是否可能命中图表分发（pipeline/diagrams）与上游富化（richContent 的
// 代码高亮与 KaTeX 段）。所有判定取超集：只允许多触发，不允许漏触发。
import { DIAGRAM_ALIASES, DIAGRAM_TYPES } from '../diagrams.js';

export interface EnrichmentNeed {
	code: boolean;
	math: boolean;
	diagrams: boolean;
}

// language-XXX 候选 = 规范 id（DIAGRAM_TYPES[].id）∪ 别名（DIAGRAM_ALIASES 键），
// 与 pipeline/diagrams.ts 的分发判定同源，避免第二份清单漂移。
// 'i' 标志（评审 Critical-1）：分发端对 language class 做 toLowerCase() 归一
// （diagrams.ts:285），而 comrak 按源码原样输出围栏语言（```PlantUML 等），
// 区分大小写即漏触发，图表静默退化为普通高亮。
const DIAGRAM_LANG_PATTERN = new RegExp(
	`language-(${[...DIAGRAM_TYPES.map((t) => t.id), ...Object.keys(DIAGRAM_ALIASES)]
		.map((id) => id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
		.join('|')})\\b`,
	'i',
);

export function analyzeEnrichmentNeed(html: string): EnrichmentNeed {
	// comrak 把文本中的 `<` 转义为 `&lt;`，字符串里出现字面 `<pre` 只可能是
	// 真实元素；图表块只存在于 pre>code 内（来源：pipeline/diagrams.ts 仅在
	// pre>code 的 language-XXX 块上分发）——此为来源描述，不构成早退依据。
	// math 不受 pre 门控（行内公式可存在于任意文本块，richContent 全树扫描同样
	// 不设 pre 前置），故先于早退判定，早退条件为 code 与 math 双空。
	const code = html.includes('<pre');
	// 与 richContent.ts 的 hasDelimiters（`/\[([]/`）同构；data-math 属性
	// 必然以字面形式出现在 html 字符串里。
	const math = html.includes('data-math') || /\\[([]/.test(html);
	if (!code && !math) return { code: false, math: false, diagrams: false };
	return {
		code,
		math,
		diagrams: DIAGRAM_LANG_PATTERN.test(html),
	};
}
