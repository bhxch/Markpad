// src/lib/pipeline/diagrams.test.ts
import { describe, it, expect } from 'vitest';
import { DIAGRAM_TYPES } from '../diagrams';

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
  });
});
