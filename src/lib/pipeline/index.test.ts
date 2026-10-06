// src/lib/pipeline/index.test.ts
import { describe, it, expect } from 'vitest';

describe('runPipeline', () => {
  it('步骤有序且全部执行（light smoke：对空 root 幂等）', async () => {
    const { runPipeline, getPipeline } = await import('./index');
    expect(getPipeline().map(s => s.name)).toEqual([
      'highlight', 'diagrams', 'katex', 'copyCode', 'lightbox',
    ]);
    const root = document.createElement('div');
    await expect(runPipeline(root)).resolves.toBeUndefined();
  });

  it('copyCode 为 pre 添加语言标签按钮', async () => {
    const { runPipeline } = await import('./index');
    const root = document.createElement('div');
    root.innerHTML = '<pre><code class="language-js">1</code></pre>';
    await runPipeline(root);
    expect(root.querySelectorAll('.lang-label').length).toBe(1);
  });
});
