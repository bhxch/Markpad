// @vitest-environment jsdom
// happy-dom 会对 iframe.src 发起真实网络请求，jsdom 不会加载 iframe 资源。
import { describe, it, expect } from "vitest";
import { processMarkdownHtml } from "./markdown";

// D15 fork 契约：YouTube 保留应用内嵌 iframe 播放，拒绝上游的缩略图外链
// 方案（a.youtube-link + i.ytimg.com 海报）。ef663c5 合并上游骨架时把本地
// replaceWithYoutubeEmbed 静默丢弃，本地轨零测试是"丢失无人报警"的根因，
// 这组行为测试防止再次静默丢失。
//
// scripts 域的 youtubeExternalFallback.test.ts 用自研 DOM shim 断言同一契
// 约；这里用 jsdom 走真实浏览器 API，两侧任一侧漂移都会红。

const VIDEO = "dQw4w9WgXcQ";

function iframeSrc(html: string): string | null {
	const doc = new DOMParser().parseFromString(html, "text/html");
	return doc.querySelector(".video-container iframe")?.getAttribute("src") ?? null;
}

describe("processMarkdownHtml 的 YouTube 内嵌播放（D15）", () => {
	it("独占段的 YouTube 链接替换为 16:9 容器内嵌播放器", () => {
		const result = processMarkdownHtml(
			`<p><a href="https://www.youtube.com/watch?v=${VIDEO}">watch this</a></p>`,
			"/tmp/test.md",
			new Set(),
		);
		const doc = new DOMParser().parseFromString(result, "text/html");

		const container = doc.querySelector(".video-container");
		expect(container).not.toBeNull();

		const iframe = container!.querySelector("iframe");
		expect(iframe).not.toBeNull();
		expect(iframe!.getAttribute("src")).toBe(
			`https://www.youtube.com/embed/${VIDEO}`,
		);
		expect(iframe!.getAttribute("allowfullscreen")).not.toBeNull();

		expect(doc.querySelector("a")).toBeNull();
	});

	it("youtu.be 图片分支替换为同款播放器", () => {
		const result = processMarkdownHtml(
			`<p><img src="https://youtu.be/${VIDEO}" alt="video"></p>`,
			"/tmp/test.md",
			new Set(),
		);

		expect(iframeSrc(result)).toBe(`https://www.youtube.com/embed/${VIDEO}`);
	});

	it("非 YouTube 链接不替换", () => {
		const result = processMarkdownHtml(
			'<p><a href="https://example.com/watch?v=dQw4w9WgXcQ">watch</a></p>',
			"/tmp/test.md",
			new Set(),
		);
		const doc = new DOMParser().parseFromString(result, "text/html");

		expect(doc.querySelector(".video-container")).toBeNull();
		expect(doc.querySelector("iframe")).toBeNull();
		expect(doc.querySelector("a")?.getAttribute("href")).toBe(
			"https://example.com/watch?v=dQw4w9WgXcQ",
		);
	});

	it("夹在文字中的 YouTube 链接保持为链接", () => {
		const result = processMarkdownHtml(
			`<p>see <a href="https://youtu.be/${VIDEO}">this</a> for context</p>`,
			"/tmp/test.md",
			new Set(),
		);
		const doc = new DOMParser().parseFromString(result, "text/html");

		expect(doc.querySelector(".video-container")).toBeNull();
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

		expect(iframeSrc(result)).toBeNull();
		expect(result).toContain("https://youtu.be/short");
	});
});
