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

  it('并发渲染：先启动的 run 在版本递增后按在途取消（捕获版本不被后启 run 覆盖）', async () => {
    const { runPipeline, setPipelineVersionSource } = await import('./index');
    let version = 1;
    setPipelineVersionSource(() => version);

    const rootA = document.createElement('div');
    rootA.innerHTML = '<pre><code class="language-js">1</code></pre>';
    const rootB = document.createElement('div');
    rootB.innerHTML = '<pre><code class="language-js">2</code></pre>';

    // run A 以 version=1 启动并挂起于首个 await → 模拟 renderVersion++ → run B 以 version=2 启动
    const runA = runPipeline(rootA);
    version = 2;
    const runB = runPipeline(rootB);
    await Promise.all([runA, runB]);

    // 修复后语义（原实现 version !== renderVersion 闭包）：A 按旧版本取消（无 label），B 正常执行（有 label）
    expect(rootA.querySelectorAll('.lang-label').length).toBe(0);
    expect(rootB.querySelectorAll('.lang-label').length).toBe(1);

    setPipelineVersionSource(() => 0); // 还原版本源，避免影响同文件后续用例
  });
});
