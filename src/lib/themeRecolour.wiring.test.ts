// src/lib/themeRecolour.wiring.test.ts
// 契约：主题变更的整篇重渲染（recolourDiagrams）必须补跑本地 tree-sitter 升级步。
// 该测试读取 MarkdownViewer 源码做静态断言——recolourDiagrams 只调 renderRichContent
// （上游富内容路径，代码块落成 hljs 形态）而漏掉 highlightBlocks 升级时，纯函数测试
// 仍全绿，唯有此测试变红（用户可见症状：切 UI 主题后代码块不再随所选代码主题变色，
// GUI 实测复现于 2026-10-08，spec T7）。
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const mv = readFileSync(join(__dirname, 'MarkdownViewer.svelte'), 'utf8');

describe('主题重渲染的 tree-sitter 升级接线（spec T7）', () => {
	it('recolourDiagrams 在 renderRichContent 之后补跑 highlightBlocks 升级', () => {
		// recolourDiagrams 体内：renderRichContent 的完成回调必须接 highlightBlocks
		const body = mv.match(/const recolourDiagrams[\s\S]*?\n\t\t\}\);/)?.[0] ?? '';
		expect(body).toContain('renderRichContent()');
		expect(body).toMatch(/renderRichContent\(\)\.then\(/);
		expect(body).toMatch(/highlightBlocks\(markdownBody\)/);
	});
	it('highlightBlocks 从本地管线导入（防改接上游 richContent 的 hljs 路径）', () => {
		expect(mv).toMatch(
			/import \{ initTreeSitterLanguages, highlightBlocks \} from '\.\/pipeline\/highlight'/,
		);
	});
});
