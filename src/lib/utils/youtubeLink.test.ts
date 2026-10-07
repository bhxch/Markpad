// @vitest-environment jsdom
// happy-dom 会对 img.src 发起真实网络请求，jsdom 不加载图片资源。
import { describe, it, expect } from "vitest";
import { processMarkdownHtml } from "./markdown";

// 2026-10-07 用户裁决：D15 废弃，跟随上游 #388 缩略图外链方案（原内嵌
// iframe 是上游 #47 的旧特性，非本地独有）。这组行为测试守护该契约：
// YouTube 链接/图片渲染为 a.youtube-link 缩略图锚点（点击经系统浏览器
// 播放），且全树不出现 iframe——防止旧内嵌路径复活而 CSP 已收紧。
//
// scripts 域的 youtubeExternalFallback.test.ts 用自研 DOM shim 断言同一契
// 约；这里用 jsdom 走真实浏览器 API，两侧任一侧漂移都会红。

const VIDEO = "dQw4w9WgXcQ";

function parse(html: string): Document {
	return new DOMParser().parseFromString(html, "text/html");
}

describe("processMarkdownHtml 的 YouTube 缩略图外链（跟随上游 #388）", () => {
	it("独占段的 YouTube 链接替换为缩略图锚点", () => {
		const result = processMarkdownHtml(
			`<p><a href="https://www.youtube.com/watch?v=${VIDEO}">watch this</a></p>`,
			"/tmp/test.md",
			new Set(),
		);
		const doc = parse(result);

		const link = doc.querySelector("a.youtube-link");
		expect(link).not.toBeNull();
		expect(link!.getAttribute("href")).toBe(
			`https://www.youtube.com/watch?v=${VIDEO}`,
		);

		const thumbnail = link!.querySelector("img");
		expect(thumbnail!.getAttribute("src")).toBe(
			`https://i.ytimg.com/vi/${VIDEO}/hqdefault.jpg`,
		);

		expect(doc.querySelector("iframe")).toBeNull();
	});

	it("youtu.be 图片分支替换为同款缩略图锚点", () => {
		const result = processMarkdownHtml(
			`<p><img src="https://youtu.be/${VIDEO}" alt="video"></p>`,
			"/tmp/test.md",
			new Set(),
		);
		const doc = parse(result);

		const link = doc.querySelector("a.youtube-link");
		expect(link).not.toBeNull();
		expect(link!.querySelector("img")!.getAttribute("src")).toBe(
			`https://i.ytimg.com/vi/${VIDEO}/hqdefault.jpg`,
		);
		expect(doc.querySelector("iframe")).toBeNull();
	});

	it("非 YouTube 链接不替换", () => {
		const result = processMarkdownHtml(
			'<p><a href="https://example.com/watch?v=dQw4w9WgXcQ">watch</a></p>',
			"/tmp/test.md",
			new Set(),
		);
		const doc = parse(result);

		expect(doc.querySelector("a.youtube-link")).toBeNull();
		expect(doc.querySelector("iframe")).toBeNull();
		expect(doc.querySelector("a")?.getAttribute("href")).toBe(
			"https://example.com/watch?v=dQw4w9WgXcQ",
		);
	});

	it("夹在文字中的 YouTube 链接保持为普通链接", () => {
		const result = processMarkdownHtml(
			`<p>see <a href="https://youtu.be/${VIDEO}">this</a> for context</p>`,
			"/tmp/test.md",
			new Set(),
		);
		const doc = parse(result);

		expect(doc.querySelector("a.youtube-link")).toBeNull();
		expect(doc.querySelector("iframe")).toBeNull();
		expect(doc.querySelector("a")?.getAttribute("href")).toBe(
			`https://youtu.be/${VIDEO}`,
		);
		expect(doc.querySelector("a")?.textContent).toBe("this");
	});

	it("非 11 位 id 的 youtu.be 链接不替换", () => {
		const result = processMarkdownHtml(
			'<p><a href="https://youtu.be/short">link</a></p>',
			"/tmp/test.md",
			new Set(),
		);
		const doc = parse(result);

		expect(doc.querySelector("a.youtube-link")).toBeNull();
		expect(result).toContain("https://youtu.be/short");
	});
});
