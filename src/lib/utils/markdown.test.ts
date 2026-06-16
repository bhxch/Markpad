import { describe, it, expect } from "vitest";
import { processMarkdownHtml } from "./markdown";

// These tests guard the >50KB "[object Object]" regression.
//
// Root cause: MarkdownViewer.svelte loadMarkdown cast invoke('open_markdown')
// to Promise<string>, but the backend returns a MarkdownResponse object
// {html, metadata}. processMarkdownHtml then received an object, and
// DOMParser.parseFromString stringified it to "[object Object]", so the whole
// document body rendered as "[object Object]" for files >50KB.
//
// The fix passes fullHtml.html (a string) instead. These tests pin the contract
// of processMarkdownHtml so the regression cannot return silently.

describe("processMarkdownHtml", () => {
	it("preserves heading and body text from a string HTML input", () => {
		const html = '<h1 id="title">大标题</h1><p>正文内容</p>';
		const result = processMarkdownHtml(html, "/tmp/test.md", new Set());

		expect(result).toContain("大标题");
		expect(result).toContain("正文内容");
		expect(result).not.toContain("[object Object]");
	});

	it("renders every heading for large comrak-style output", () => {
		// Mirrors the real failure: a >50KB doc with many headings that must all
		// survive post-processing when a proper string is supplied.
		const headings = Array.from(
			{ length: 200 },
			(_, i) => `<h2 id="sec-${i}">第 ${i} 节</h2>`,
		).join("");
		const html = `<h1 id="title">大文件渲染回归测试</h1>${headings}`;

		const result = processMarkdownHtml(html, "/tmp/big.md", new Set());

		expect(result).toContain("第 199 节");
		expect(result).not.toContain("[object Object]");
		expect((result.match(/<h2/g) || []).length).toBe(200);
	});

	it("reproduces the bug when an object is passed instead of a string", () => {
		// Documents WHY the caller must pass fullHtml.html and not the response
		// object: DOMParser coerces a non-string via toString() → "[object Object]".
		// If a future change silently restores the old misuse, this test makes the
		// expected (broken) behavior explicit so reviewers catch it.
		const result = processMarkdownHtml(
			{ html: "<h1>x</h1>" } as unknown as string,
			"/tmp/x.md",
			new Set(),
		);

		expect(result).toContain("[object Object]");
	});
});
