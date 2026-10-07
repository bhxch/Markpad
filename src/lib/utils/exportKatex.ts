/**
 * 本地导出引擎的 KaTeX 样式内联（T1）。
 *
 * 导出 HTML/PDF 携带预渲染的 KaTeX HTML（.katex-mathml 靠 katex.min.css 的
 * clip 规则隐藏、.katex-html 靠它排版），预览由 MarkdownViewer 的 import
 * 'katex/dist/katex.min.css' 供样式，导出物是自包含文件——缺这份 CSS 就是
 * 公式重复一遍 + 字形堆叠。字体必须按用到的字体族嵌入（KaTeX 用自己的字体
 * 度量排版；回退 serif 则字形不合版），取舍逻辑见 utils/exportFonts.ts 头注。
 *
 * 实现复用退役上游引擎的纯函数模块 exportFonts.ts（D6 保留的文件），差异只在
 * 样式/字体的取得方式：构建期 ?raw / ?url 导入，不依赖 document.styleSheets
 * （本地引擎不走样式表拷贝）。
 */
import katexCssText from 'katex/dist/katex.min.css?raw';
import {
	collectUsedKatexFamilies,
	fetchFontDataUrls,
	inlineKatexFontFaces,
	katexFontUrlsToEmbed,
} from './exportFonts.js';

// Vite 构建期解析 katex 字体资产 URL（键：包内路径；值：打包后可 fetch 的 URL）。
const fontAssetUrls = import.meta.glob<string>('/node_modules/katex/dist/fonts/*.woff2', {
	query: '?url',
	import: 'default',
	eager: true,
});

function resolveFontUrl(cssRelativeUrl: string): string | null {
	// katex.min.css 里的 src 形如 url(fonts/KaTeX_Main-Regular.woff2)。
	// glob 键形态以 Vite 实际产出为准，按后缀命中（键前缀跨 Vite 版本有差异）；
	// deferred：路径锚定——比较 '/'+cssRelativeUrl，防无边界后缀误配到恰好以本名
	// 结尾的其它资产；个别产出无前导分隔符时退化为全等比较。
	const hit = Object.entries(fontAssetUrls).find(
		([path]) => path.endsWith(`/${cssRelativeUrl}`) || path === cssRelativeUrl,
	);
	return hit ? hit[1] : null;
}

/**
 * 含 `.katex` 时返回 `<style>…</style>` 片段（katex.min.css 全文 + 所用字体族
 * 的 @font-face 内联 data URI），否则返回 ''。Task 9 GUI 验收依赖本契约。
 */
export async function buildKatexExportStyles(root: Element): Promise<string> {
	if (!root.querySelector('.katex')) return '';

	// 文档实际引用的字体族 → 族内各 face 的 woff2 源（css 内相对 url）。
	const usedFamilies = collectUsedKatexFamilies(root, katexCssText);
	const cssUrls = katexFontUrlsToEmbed(katexCssText, usedFamilies);

	// css 相对 url → Vite 资产 URL → fetch 成 data URI。查表键必须回到 css 相对
	// url：inlineKatexFontFaces 按未改写的 @font-face src 取字节，与退役引擎
	// （先 absolutize 再 fetch，键天然对齐）不同，这里 css 全文保持原样。
	const dataUrlByCssUrl = new Map<string, string>();
	if (cssUrls.length) {
		const resolvedUrls = cssUrls.map(resolveFontUrl);
		const fetched = await fetchFontDataUrls(
			resolvedUrls.filter((url): url is string => url !== null),
		);
		cssUrls.forEach((cssUrl, index) => {
			const resolved = resolvedUrls[index];
			const dataUrl = resolved ? fetched.get(resolved) : undefined;
			if (dataUrl) dataUrlByCssUrl.set(cssUrl, dataUrl);
		});
	}

	const css = inlineKatexFontFaces(katexCssText, usedFamilies, dataUrlByCssUrl);
	return `<style>\n${css}\n</style>`;
}
