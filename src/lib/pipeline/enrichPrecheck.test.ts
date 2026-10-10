import { describe, expect, it } from 'vitest';
import { analyzeEnrichmentNeed } from './enrichPrecheck.js';
import { DIAGRAM_ALIASES, DIAGRAM_TYPES } from '../diagrams.js';

describe('analyzeEnrichmentNeed（D30，spec 2026-10-10）', () => {
	it('纯文本无 pre 无 math：三者全 false', () => {
		expect(analyzeEnrichmentNeed('<p>你好世界</p>')).toEqual({ code: false, math: false, diagrams: false });
	});

	it('转义文本 &lt;pre 不算代码块（comrak 转义契约）', () => {
		expect(analyzeEnrichmentNeed('<p>&lt;pre&gt;假的</p>').code).toBe(false);
	});

	it('含 <pre 即 code（无论语言）', () => {
		expect(analyzeEnrichmentNeed('<pre><code>const a=1;</code></pre>').code).toBe(true);
	});

	it('data-math 属性 → math', () => {
		expect(analyzeEnrichmentNeed('<span data-math="inline">E</span>').math).toBe(true);
	});

	it('\\( 与 \\[ 定界符 → math（与 richContent.ts:439 判定同构，超集安全）', () => {
		expect(analyzeEnrichmentNeed('<p>\\(E=mc^2\\)</p>').math).toBe(true);
		expect(analyzeEnrichmentNeed('<p>\\[x\\]</p>').math).toBe(true);
	});

	it('DIAGRAM_TYPES 全量 id 命中 diagrams', () => {
		for (const t of DIAGRAM_TYPES) {
			expect(analyzeEnrichmentNeed(`<pre><code class="language-${t.id}">x</code></pre>`).diagrams).toBe(true);
		}
	});

	it('DIAGRAM_ALIASES 别名命中 diagrams', () => {
		for (const alias of Object.keys(DIAGRAM_ALIASES)) {
			expect(analyzeEnrichmentNeed(`<pre><code class="language-${alias}">x</code></pre>`).diagrams).toBe(true);
		}
	});

	it('非图表语言 code=true 但 diagrams=false', () => {
		expect(analyzeEnrichmentNeed('<pre><code class="language-python">print(1)</code></pre>')).toEqual({
			code: true,
			math: false,
			diagrams: false,
		});
	});
});
