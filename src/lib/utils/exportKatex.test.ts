// src/lib/utils/exportKatex.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

// vitest 的 CSS 管线默认关闭（css:false），'katex/dist/katex.min.css?raw' 会被
// 替换为空串；生产 Vite 构建不受影响。这里用 vi.mock 充当 ?raw 管线替身——
// 与 Vite 行为一致地把包内同一文件全文注入（被测模块代码不因测试环境变形）。
const { katexCssText } = await vi.hoisted(async () => {
	const { readFileSync } = await import('node:fs');
	// vitest 以仓库根为 cwd，直接读包内同一文件
	return { katexCssText: readFileSync('node_modules/katex/dist/katex.min.css', 'utf8') };
});
vi.mock('katex/dist/katex.min.css?raw', () => ({ default: katexCssText }));

// 字体资产 fetch 在 happy-dom 下不可达（Vite dev URL 不存在），注入替身：
// 任何 woff2 请求返回确定的假字节，data URI 可断言（T1）。
const fetchMock = vi.fn(async (url: string) => {
	if (/\.woff2(\?|$)/.test(url)) {
		return new Response(new Uint8Array([0x77, 0x4f, 0x46, 0x32]), { status: 200 });
	}
	return new Response('', { status: 404 });
});
vi.stubGlobal('fetch', fetchMock);

beforeEach(() => {
	fetchMock.mockClear();
});

function withMath(): HTMLElement {
	const el = document.createElement('div');
	el.innerHTML = `<span class="katex"><span class="katex-mathml">…</span><span class="katex-html">E=mc²</span></span>`;
	return el;
}

function withoutMath(): HTMLElement {
	const el = document.createElement('div');
	el.innerHTML = '<p>plain</p>';
	return el;
}

describe('buildKatexExportStyles 契约（T1）', () => {
	it('无公式文档返回空串（零负担路径）', async () => {
		const { buildKatexExportStyles } = await import('./exportKatex');
		expect(await buildKatexExportStyles(withoutMath())).toBe('');
	});

	it('含 .katex 时返回携带 .katex-mathml clip 隐藏规则与 .katex-html 排版规则的样式', async () => {
		const { buildKatexExportStyles } = await import('./exportKatex');
		const styles = await buildKatexExportStyles(withMath());
		expect(styles).toContain('<style>');
		expect(styles).toMatch(/\.katex-mathml\s*\{[^}]*clip(-path)?:/);
		expect(styles).toMatch(/\.katex-html/);
	});

	it('只嵌入文档实际引用的字体族（KaTeX_Main 而非全部 20 个 @font-face 保留）', async () => {
		const { buildKatexExportStyles } = await import('./exportKatex');
		const styles = await buildKatexExportStyles(withMath());
		const faces = [...styles.matchAll(/@font-face\s*\{[^}]*font-family:\s*(KaTeX_[A-Za-z]+)/g)].map((m) => m[1]);
		expect(faces).toContain('KaTeX_Main');
		expect(faces).not.toContain('KaTeX_SansSerif');
	});

	it('保留的 @font-face 源改写为 data URI（woff2 字节已 fetch）', async () => {
		const { buildKatexExportStyles } = await import('./exportKatex');
		const styles = await buildKatexExportStyles(withMath());
		expect(styles).toMatch(/@font-face\s*\{[^}]*url\((data:font\/woff2;base64,)/s);
		expect(fetchMock).toHaveBeenCalled();
	});
});
