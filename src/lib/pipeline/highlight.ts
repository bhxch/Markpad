// pipeline/highlight.ts — tree-sitter 代码高亮（从 MarkdownViewer.svelte 原样抽取）
//
// 抽取自 MarkdownViewer.svelte（feat/upstream-merge-2 P1 插件化，为上游合并做物理隔离）。
// - highlightCodeWithTreeSitter：纯核心（源码 -> 高亮 HTML | null），供统一管线/图表源码高亮复用
// - highlightCodeWithTreeSitterBlock：DOM 适配器，保持 MarkdownViewer 原调用契约（原地替换 + 布尔回退信号）
// - highlightBlocks：pipeline 步骤签名（spec D5）
import { invoke } from '@tauri-apps/api/core';
import { settings } from '../stores/settings.svelte.js';

// Tree-sitter supported languages (cached)
let treeSitterLanguages: Set<string> = new Set();

// Get the current code theme based on settings
export function getCodeTheme(): string {
  if (settings.codeTheme === 'auto') {
    const currentThemeObj = settings.themes.find((t) => t.id === settings.themeScheme);
    const mode = currentThemeObj ? currentThemeObj.mode : 'dark';
    return mode === 'dark' ? 'dark-modern' : 'light-modern';
  }
  return settings.codeTheme;
}

// Highlight code using tree-sitter（纯核心，失败返回 null，由调用方回退 hljs）
export async function highlightCodeWithTreeSitter(code: string, lang: string): Promise<string | null> {
  if (!code.trim()) return null;

  try {
    const theme = getCodeTheme();
    const highlightedHtml = await invoke<string>('highlight_code', {
      code,
      language: lang,
      theme
    });

    return highlightedHtml;
  } catch (e) {
    // Language not supported or highlighting failed, will fall back to hljs
    return null;
  }
}

// DOM 适配器：保持 MarkdownViewer 原调用契约（block 原地替换 + ts-highlighted 标记 + 布尔回退信号）
export async function highlightCodeWithTreeSitterBlock(block: HTMLElement, lang: string): Promise<boolean> {
  const code = block.textContent || '';
  if (!code.trim()) return false;

  const highlightedHtml = await highlightCodeWithTreeSitter(code, lang);
  if (highlightedHtml === null) return false;

  // Replace the content with highlighted HTML
  block.innerHTML = highlightedHtml;

  // Mark as tree-sitter highlighted
  block.classList.add('ts-highlighted');

  return true;
}

// Initialize tree-sitter supported languages list
export async function initTreeSitterLanguages(): Promise<void> {
  try {
    const languages = await invoke<string[]>('get_supported_languages');
    treeSitterLanguages = new Set(languages);
  } catch (e) {
    console.warn('Failed to get tree-sitter supported languages:', e);
  }
}

// Pipeline step（spec D5）：高亮 root 下所有 pre>code[class*="language-"]；失败保留原样
// （hljs 兜底逻辑在 MarkdownViewer 内联分支，随迁移并入）
export async function highlightBlocks(root: ParentNode): Promise<void> {
  const blocks = root.querySelectorAll('pre code[class*="language-"]');
  for (const el of Array.from(blocks)) {
    const lang = Array.from(el.classList).find((c) => c.startsWith('language-'))?.slice(9) ?? '';
    const html = await highlightCodeWithTreeSitter(el.textContent ?? '', lang);
    if (html) el.innerHTML = html;
  }
}
