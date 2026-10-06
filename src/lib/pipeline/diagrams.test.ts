// src/lib/pipeline/diagrams.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DIAGRAM_TYPES } from '../diagrams';

// mermaid 模块 mock（D12：全仓只允许经 pipeline/diagrams import('mermaid')，
// 单测在此边界注入替身，验证的是本模块的单例簿记而非 mermaid 本身）
const mocks = vi.hoisted(() => ({
  initialize: vi.fn(),
  render: vi.fn(),
}));
vi.mock('mermaid', () => ({ default: { initialize: mocks.initialize, render: mocks.render } }));

beforeEach(() => {
  vi.resetModules(); // 每个用例取全新模块状态（单例/负缓存不串场）
  mocks.initialize.mockReset();
  mocks.render.mockReset();
});

describe('diagram pipeline 契约', () => {
  it('DIAGRAM_TYPES 含 mermaid 且支持 local/kroki（分发权归属本地图表，spec D12）', () => {
    const mermaid = DIAGRAM_TYPES.find(t => t.id === 'mermaid');
    expect(mermaid).toBeDefined();
    expect(mermaid!.supportedModes).toContain('local');
    expect(mermaid!.supportedModes).toContain('kroki');
  });

  it('setupDiagramWrappers 对无图表的根幂等', async () => {
    const { setupDiagramWrappers } = await import('./diagrams');
    const root = document.createElement('div');
    root.innerHTML = '<pre><code class="language-js">const a=1</code></pre>';
    expect(() => setupDiagramWrappers(root)).not.toThrow();
    expect(root.querySelectorAll('.diagram-wrapper').length).toBe(0);
  });

  it('syncMermaidTheme 在 mermaid 未初始化时安全返回主题（不触发 initialize）', async () => {
    const { syncMermaidTheme } = await import('./diagrams');
    expect(['default', 'dark']).toContain(syncMermaidTheme());
    expect(mocks.initialize).not.toHaveBeenCalled();
  });
});

describe('mermaid 单实例闸门（spec D12）', () => {
  // brief Step 1：实例同一性由实现内 promise 级缓存保证——mock 边界上以
  // "initialize 只发生一次 + 访问器返回同一模块单例"作可观察断言。
  it('mermaid 实例单例：串行/并发多次初始化只 initialize 一次', async () => {
    const mod = await import('./diagrams');
    await Promise.all([mod.ensureMermaidInitialized(), mod.ensureMermaidInitialized()]);
    await mod.ensureMermaidInitialized();
    expect(mocks.initialize).toHaveBeenCalledTimes(1);
    const mermaidModule = (await import('mermaid')).default;
    expect(mod.getMermaid()).toBe(mermaidModule);
  });

  // Task 14 ⑥：加载失败不得固化成永久失败（负缓存清除，对齐 ensureHljs/ensureKatex）
  it('mermaid 初始化失败后允许重试', async () => {
    const mod = await import('./diagrams');
    mocks.initialize.mockImplementationOnce(() => {
      throw new Error('boom');
    });
    await expect(mod.ensureMermaidInitialized()).rejects.toThrow('boom');
    expect(mod.getMermaid()).toBeNull();
    await expect(mod.ensureMermaidInitialized()).resolves.toBeUndefined();
    expect(mod.getMermaid()).not.toBeNull();
    expect(mocks.initialize).toHaveBeenCalledTimes(2);
  });
});

describe('主题重绘（Task 14 ③，D12 主题重绘缺口）', () => {
  function makeRoot(): HTMLElement {
    // 编程式构建而非 innerHTML 模板：happy-dom 的解析器会把文本中的 `-->`
    // 误拼成重复串（环境伪象），textContent 赋值不受影响。
    const root = document.createElement('div');

    const mermaidWrapper = document.createElement('div');
    mermaidWrapper.className = 'diagram-wrapper';
    mermaidWrapper.dataset.diagramLang = 'mermaid';
    const mermaidRender = document.createElement('div');
    mermaidRender.className = 'mermaid';
    mermaidRender.dataset.diagramRender = 'true';
    mermaidRender.innerHTML = '<svg id="old-mermaid"></svg>';
    const mermaidCode = document.createElement('pre');
    mermaidCode.dataset.diagramCode = 'true';
    const mermaidCodeEl = document.createElement('code');
    mermaidCodeEl.className = 'language-mermaid';
    mermaidCodeEl.textContent = 'graph TD;A-->B;';
    mermaidCode.appendChild(mermaidCodeEl);
    mermaidWrapper.append(mermaidRender, mermaidCode);

    const plantumlWrapper = document.createElement('div');
    plantumlWrapper.className = 'diagram-wrapper';
    plantumlWrapper.dataset.diagramLang = 'plantuml';
    const plantumlRender = document.createElement('div');
    plantumlRender.dataset.diagramRender = 'true';
    plantumlRender.innerHTML = '<svg id="old-plantuml"></svg>';
    const plantumlCode = document.createElement('pre');
    plantumlCode.dataset.diagramCode = 'true';
    const plantumlCodeEl = document.createElement('code');
    plantumlCodeEl.textContent = '@startuml';
    plantumlCode.appendChild(plantumlCodeEl);
    plantumlWrapper.append(plantumlRender, plantumlCode);

    root.append(mermaidWrapper, plantumlWrapper);
    return root;
  }

  it('只重画 mermaid wrapper，非 mermaid wrapper 原样保留', async () => {
    mocks.render.mockResolvedValue({ svg: '<svg id="new-mermaid"></svg>' });
    const mod = await import('./diagrams');
    await mod.ensureMermaidInitialized();
    const revision = 1;
    mod.setDiagramVersionGate((v) => v !== revision);

    const root = makeRoot();
    await mod.rerenderMermaidWrappers(root, revision);

    const renderEls = root.querySelectorAll('[data-diagram-render="true"]');
    expect(renderEls[0].querySelector('svg')?.getAttribute('id')).toBe('new-mermaid');
    expect(renderEls[1].querySelector('svg')?.getAttribute('id')).toBe('old-plantuml');
    expect(mocks.render).toHaveBeenCalledTimes(1);
  });

  it('重绘源码取自 wrapper 的 data-diagram-code 代码块', async () => {
    mocks.render.mockResolvedValue({ svg: '<svg></svg>' });
    const mod = await import('./diagrams');
    await mod.ensureMermaidInitialized();
    const revision = 1;
    mod.setDiagramVersionGate((v) => v !== revision);

    await mod.rerenderMermaidWrappers(makeRoot(), revision);
    expect(mocks.render).toHaveBeenCalledWith(expect.any(String), 'graph TD;A-->B;');
  });

  it('版本闸推进时在途重绘就地取消', async () => {
    let resolveRender!: (v: { svg: string }) => void;
    mocks.render.mockReturnValue(new Promise((res) => { resolveRender = res; }));
    const mod = await import('./diagrams');
    await mod.ensureMermaidInitialized();
    let revision = 1;
    mod.setDiagramVersionGate((v) => v !== revision);

    const pending = mod.rerenderMermaidWrappers(makeRoot(), revision);
    revision = 2; // 新 patch 推进修订号
    resolveRender({ svg: '<svg id="late"></svg>' });
    await pending;

    expect(mocks.render).toHaveBeenCalledTimes(1); // 第二个 wrapper 不再渲染
  });
});
