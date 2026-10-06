// src/lib/pipeline/highlight.test.ts
import { describe, it, expect, vi } from 'vitest';

// highlight_code 命令不可用时应回退 hljs 而非抛错（保持现网行为）
vi.mock('$app/paths', () => ({}));
vi.mock('tauri', () => ({ invoke: vi.fn().mockRejectedValue('no runtime') }), { virtual: true });

describe('highlightBlocks', () => {
  it('对无 pre>code 的根不抛错（幂等空转）', async () => {
    const { highlightBlocks } = await import('./highlight');
    const root = document.createElement('div');
    await expect(highlightBlocks(root)).resolves.toBeUndefined();
  });

  it('为 pre>code 添加语言 class 收集（选择器契约）', async () => {
    const { highlightBlocks } = await import('./highlight');
    const root = document.createElement('div');
    root.innerHTML = '<pre><code class="language-rust">fn main(){}</code></pre>';
    await highlightBlocks(root);
    expect(root.querySelectorAll('pre code.language-rust').length).toBe(1);
  });
});
