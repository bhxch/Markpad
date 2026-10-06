// pipeline/diagrams.ts — 多引擎图表管线（从 MarkdownViewer.svelte 原样抽取）
//
// 抽取自 MarkdownViewer.svelte（feat/upstream-merge-2 P1 插件化，为上游合并做物理隔离）。
// - renderDiagramBlocks：renderRichContent 的图表分发步（source/kroki/local/rust 四分支，逐字搬移）
// - setupDiagramWrapper(s)：逐 wrapper 装配（切换按钮/源码高亮）+ 全局切换委托（原 setupDiagramWrapper）
// - syncMermaidTheme：mermaid 主题判定 + initialize（原 $effect.pre 主题段）
// - ensureMermaidInitialized / getMermaid：mermaid 单实例闸门（spec D12：全仓只允许经本模块 import('mermaid')）
import { settings } from '../stores/settings.svelte.js';
import { DIAGRAM_ALIASES, getDiagramType } from '../diagrams';
import { renderLocalDiagram, supportsLocalRender, renderRustDiagram, supportsRustRender } from '../localRenderers';
import { createKrokiUrl } from '../kroki';
import { highlightCodeWithTreeSitterBlock } from './highlight';

// ---------------------------------------------------------------------------
// mermaid 单实例（spec D12）
// ---------------------------------------------------------------------------

let mermaidInstance: any = null;
let mermaidPromise: Promise<void> | null = null;

// mermaid 实例访问器：全仓唯一引用点（D12）。未初始化时返回 null（与原 MV $state(null) 语义一致）。
export function getMermaid(): any {
  return mermaidInstance;
}

// 缓存 mermaid 动态 import 结果并做初始 initialize（原 MV onMount 初始 init 段原样搬移；
// promise 级缓存保证并发调用下也只 import/initialize 一次）
export async function ensureMermaidInitialized(): Promise<void> {
  if (!mermaidPromise) {
    mermaidPromise = import('mermaid').then((module) => {
      mermaidInstance = module.default;
      mermaidInstance.initialize({
        startOnLoad: false,
        theme: 'default',
        securityLevel: 'loose',
      });
    });
  }
  await mermaidPromise;
}

// mermaid 主题判定 + initialize（原 MV $effect.pre 的“1. 确定 Mermaid 主题 / 2. 初始化 Mermaid”段原样搬移）
export function syncMermaidTheme(): 'default' | 'dark' {
  const currentThemeObj = settings.themes.find((t) => t.id === settings.themeScheme);
  const mode = currentThemeObj ? currentThemeObj.mode : 'light';
  const mTheme: 'default' | 'dark' = mode === 'dark' ? 'dark' : 'default';

  // 初始化 Mermaid（实例未就绪时跳过，与原调用点被 `&& mermaid` 守卫等价）
  const mermaid = getMermaid();
  if (mermaid) {
    mermaid.initialize({
      startOnLoad: false,
      theme: mTheme,
      securityLevel: 'loose',
    });
  }
  return mTheme;
}

// ---------------------------------------------------------------------------
// hljs / katex 懒加载（原 MV 组件 $state 自持；动态 import 全局缓存同一模块实例，行为等价）
// ---------------------------------------------------------------------------

let hljsLib: any = null;
async function ensureHljs(): Promise<any> {
  if (!hljsLib) {
    try {
      hljsLib = (await import('highlight.js')).default;
    } catch {
      hljsLib = null;
    }
  }
  return hljsLib;
}

let katexLib: any = null;
async function ensureKatex(): Promise<any> {
  if (!katexLib) {
    try {
      katexLib = (await import('katex')).default;
    } catch {
      katexLib = null;
    }
  }
  return katexLib;
}

// ---------------------------------------------------------------------------
// 在途渲染取消闸门（原 `version !== renderVersion`；renderVersion 属 MV 组件状态，经注入保持逐块取消语义）
// ---------------------------------------------------------------------------

let versionGate: (version: number) => boolean = () => false;
export function setDiagramVersionGate(gate: (version: number) => boolean): void {
  versionGate = gate;
}

// 图表语言 → 语法兼容的高亮语言映射（原 diagramHighlightMap，MV 中 helper/委托两处重复定义，随迁合并为单一常量）
const DIAGRAM_HIGHLIGHT_MAP: Record<string, string> = {
  'math': 'latex',
  'vegalite': 'json',
  'vega': 'json',
  'bpmn': 'xml',
  'excalidraw': 'json',
  'graphviz': 'dot',
  'c4plantuml': 'java',
};

// ---------------------------------------------------------------------------
// 逐 wrapper 装配 + 全局切换委托（原 setupDiagramWrapper，原样搬移）
// ---------------------------------------------------------------------------

// Global diagram toggle handler - set up once
let diagramToggleHandlerAdded = false;

// 全局切换委托（原 setupDiagramWrapper 尾部内联块，原样搬移；只注册一次，按点击目标动态解析 wrapper）
function ensureDiagramToggleDelegation(): void {
  // Set up global click handler once
  if (!diagramToggleHandlerAdded) {
    diagramToggleHandlerAdded = true;
    document.addEventListener('click', async (e) => {
      const target = e.target as HTMLElement;
      const toggleBtn = target.closest('.diagram-toggle-btn') as HTMLElement | null;
      if (!toggleBtn) return;

      e.preventDefault();
      e.stopPropagation();

      const wrapper = toggleBtn.closest('.diagram-wrapper') as HTMLElement;
      if (!wrapper) return;

      const renderElement = wrapper.querySelector('[data-diagram-render="true"]') as HTMLElement;
      const codeElement = wrapper.querySelector('[data-diagram-code="true"]') as HTMLElement;

      if (!renderElement || !codeElement) return;

      const isShowingCode = toggleBtn.dataset.showingCode === 'true';
      const newIsShowingCode = !isShowingCode;
      toggleBtn.dataset.showingCode = String(newIsShowingCode);

      if (newIsShowingCode) {
        renderElement.style.setProperty('display', 'none', 'important');
        codeElement.style.setProperty('display', 'block', 'important');
        toggleBtn.innerHTML = `<svg style="pointer-events:none" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg>`;
        toggleBtn.title = 'Show Diagram';

        // Highlight code when showing source
        const lang = wrapper.dataset.diagramLang || '';
        const highlightLang = DIAGRAM_HIGHLIGHT_MAP[lang] || lang;
        const codeEl = codeElement.querySelector('code') || codeElement;
        if (codeEl.textContent?.trim()) {
          const tsSuccess = await highlightCodeWithTreeSitterBlock(codeEl as HTMLElement, highlightLang);
          if (!tsSuccess) {
            const hljs = await ensureHljs();
            if (hljs) {
              codeEl.className = `language-${highlightLang}`;
              hljs.highlightElement(codeEl as HTMLElement);
            }
          }
        }
      } else {
        renderElement.style.setProperty('display', 'block', 'important');
        codeElement.style.setProperty('display', 'none', 'important');
        toggleBtn.innerHTML = `<svg style="pointer-events:none" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 18 22 12 16 6"></polyline><polyline points="8 6 2 12 8 18"></polyline></svg>`;
        toggleBtn.title = 'Show Source';
      }
    }, true);
  }
}

async function setupDiagramWrapper(container: HTMLElement, renderEl: HTMLElement | null, codeEl: HTMLElement, lang: string) {
  // Helper function to highlight code block
  const highlightCodeBlock = async (block: HTMLElement, language: string) => {
    const codeElement = block.querySelector('code') || block;
    if (!codeElement.textContent?.trim()) return;

    // Map diagram languages to syntax-compatible highlight languages
    const highlightLang = DIAGRAM_HIGHLIGHT_MAP[language] || language;

    // Try tree-sitter first（复用 pipeline/highlight 的 tree-sitter 通道）
    const tsSuccess = await highlightCodeWithTreeSitterBlock(codeElement as HTMLElement, highlightLang);

    // Fallback to hljs if tree-sitter failed
    if (!tsSuccess) {
      const hljs = await ensureHljs();
      if (hljs) {
        // Set language class for hljs
        codeElement.className = `language-${highlightLang}`;
        hljs.highlightElement(codeElement as HTMLElement);
      }
    }
  };

  // If no render element, just show source code with highlighting
  if (!renderEl) {
    codeEl.style.setProperty('display', 'block', 'important');
    container.appendChild(codeEl);
    // Apply syntax highlighting to the code block
    await highlightCodeBlock(codeEl, lang);
    return;
  }

  // Add data attributes for identification
  renderEl.dataset.diagramRender = 'true';
  codeEl.dataset.diagramCode = 'true';

  // Initial state
  codeEl.style.setProperty('display', 'none', 'important');
  renderEl.style.setProperty('display', 'block', 'important');
  renderEl.style.setProperty('pointer-events', 'none');

  // Toggle Button
  const btn = document.createElement('button');
  btn.className = 'diagram-toggle-btn';
  btn.type = 'button';
  btn.innerHTML = `<svg style="pointer-events:none" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 18 22 12 16 6"></polyline><polyline points="8 6 2 12 8 18"></polyline></svg>`;
  btn.title = 'Show Source';
  btn.dataset.showingCode = 'false';

  container.appendChild(btn);
  container.appendChild(renderEl);
  container.appendChild(codeEl);

  // Store language for toggle handler
  container.dataset.diagramLang = lang;

  ensureDiagramToggleDelegation();
}

// Pipeline 步骤入口（管线签名）：确保图表切换按钮的全局点击委托已安装（幂等）。
// 委托监听 document、按点击目标动态解析 .diagram-wrapper，与 root 内容无关，
// 对无图表的根为幂等空转（不创建任何节点）；逐 wrapper 装配在 renderDiagramBlocks 分发时完成。
export function setupDiagramWrappers(root: ParentNode): void {
  void root;
  ensureDiagramToggleDelegation();
}

// ---------------------------------------------------------------------------
// renderRichContent 图表分发步（原样搬移；markdownBody → root 参数化，版本比对经 versionGate 注入）
// ---------------------------------------------------------------------------

export async function renderDiagramBlocks(root: ParentNode, version: number): Promise<void> {
  // 1. Diagram Rendering (Mermaid + Kroki + Local renderers)
  const allCodeBlocks = root.querySelectorAll('pre code');
  for (const block of Array.from(allCodeBlocks)) {
    if (versionGate(version)) return;
    if (block.closest('.diagram-wrapper')) continue;

    const classes = Array.from(block.classList);
    const langClass = classes.find((c) => c.startsWith('language-'));
    if (langClass) {
      const lang = langClass.replace('language-', '').toLowerCase();
      const normalizedLang = DIAGRAM_ALIASES[lang] || lang;
      const diagramType = getDiagramType(normalizedLang);

      if (diagramType) {
        const renderMode = settings.getDiagramRenderMode(normalizedLang);
        const pre = block.parentElement;
        if (pre && pre.tagName === 'PRE') {
          const wrapper = document.createElement('div');
          wrapper.className = 'diagram-wrapper';
          pre.replaceWith(wrapper);

          if (renderMode === 'source') {
            // Show source code only
            await setupDiagramWrapper(wrapper, null, pre as HTMLElement, normalizedLang);
          } else if (renderMode === 'kroki') {
            // Render via Kroki
            try {
              const url = createKrokiUrl(normalizedLang, (block as HTMLElement).textContent || '', settings.krokiHost);
              const img = document.createElement('img');
              img.src = url;
              img.className = 'kroki-chart';
              img.alt = `${normalizedLang} diagram`;

              const chartWrapper = document.createElement('div');
              chartWrapper.className = 'kroki-container';
              chartWrapper.appendChild(img);

              await setupDiagramWrapper(wrapper, chartWrapper, pre as HTMLElement, normalizedLang);
            } catch (e) {
              console.error('Kroki error:', e);
              await setupDiagramWrapper(wrapper, null, pre as HTMLElement, normalizedLang);
            }
          } else if (renderMode === 'local') {
            // Local rendering
            const rendererId = settings.getDiagramRenderer(normalizedLang) || diagramType.defaultRenderer || '';
            const code = (block as HTMLElement).textContent || '';
            const mermaid = getMermaid();
            const katex = await ensureKatex();

            // Mermaid has special handling（mermaid 实例来自本模块单例，spec D12）
            if (normalizedLang === 'mermaid' && mermaid) {
              const div = document.createElement('div');
              div.className = 'mermaid';

              try {
                const id = 'mermaid-' + Math.random().toString(36).substring(2, 11);
                const { svg } = await mermaid.render(id, code);
                div.innerHTML = svg;
                // Make SVG responsive: ensure viewBox and constrain width
                const svgEl = div.querySelector('svg');
                if (svgEl) {
                  const w = svgEl.getAttribute('width');
                  const h = svgEl.getAttribute('height');
                  if (w && h && !svgEl.getAttribute('viewBox')) {
                    svgEl.setAttribute('viewBox', `0 0 ${parseFloat(w)} ${parseFloat(h)}`);
                  }
                  svgEl.removeAttribute('width');
                  svgEl.removeAttribute('height');
                  svgEl.removeAttribute('style');
                  svgEl.style.width = '100%';
                  svgEl.style.height = 'auto';
                  svgEl.style.display = 'block';
                }
              } catch (e) {
                console.error('Failed to render Mermaid diagram:', e);
                div.innerHTML = `<div class="mermaid-error" style="color: var(--color-danger-fg); font-size: 12px; padding: 10px; border: 1px dashed var(--color-danger-border)">Mermaid Syntax Error: ${e}</div>`;
              }

              await setupDiagramWrapper(wrapper, div, pre as HTMLElement, 'mermaid');
            } else if (normalizedLang === 'math' && katex) {
              // Math/LaTeX code block rendering
              const div = document.createElement('div');
              div.className = 'katex-display math-block';

              try {
                const html = katex.renderToString(code, {
                  displayMode: true,
                  throwOnError: false,
                  output: 'html'
                });
                div.innerHTML = html;
              } catch (e) {
                console.error('Failed to render math:', e);
                div.innerHTML = `<div class="math-error" style="color: var(--color-danger-fg); font-size: 12px; padding: 10px; border: 1px dashed var(--color-danger-border)">KaTeX Error: ${e}</div>`;
              }

              await setupDiagramWrapper(wrapper, div, pre as HTMLElement, 'math');
            } else if (supportsLocalRender(normalizedLang)) {
              // Other local renderers
              const div = document.createElement('div');
              div.className = `local-diagram local-diagram-${normalizedLang}`;

              try {
                const svg = await renderLocalDiagram(normalizedLang, code, rendererId);
                div.innerHTML = svg;
              } catch (e) {
                console.error(`Failed to render ${normalizedLang} diagram:`, e);
                div.innerHTML = `<div class="diagram-error" style="color: var(--color-danger-fg); font-size: 12px; padding: 10px; border: 1px dashed var(--color-danger-border)">${normalizedLang} Render Error: ${e}</div>`;
              }

              await setupDiagramWrapper(wrapper, div, pre as HTMLElement, normalizedLang);
            } else {
              // Fallback: render as source
              await setupDiagramWrapper(wrapper, null, pre as HTMLElement, normalizedLang);
            }
          } else if (renderMode === 'rust') {
            // Rust backend rendering
            const rendererId = settings.getDiagramRustRenderer(normalizedLang) || diagramType.defaultRustRenderer || '';
            const code = (block as HTMLElement).textContent || '';

            if (supportsRustRender(normalizedLang)) {
              const div = document.createElement('div');
              div.className = `rust-diagram rust-diagram-${normalizedLang}`;

              try {
                const svg = await renderRustDiagram(normalizedLang, code, rendererId);
                div.innerHTML = svg;
              } catch (e) {
                console.error(`Failed to render ${normalizedLang} diagram (Rust):`, e);
                div.innerHTML = `<div class="diagram-error" style="color: var(--color-danger-fg); font-size: 12px; padding: 10px; border: 1px dashed var(--color-danger-border)">${normalizedLang} Rust Render Error: ${e}</div>`;
              }

              await setupDiagramWrapper(wrapper, div, pre as HTMLElement, normalizedLang);
            } else {
              // Fallback: render as source
              await setupDiagramWrapper(wrapper, null, pre as HTMLElement, normalizedLang);
            }
          } else {
            // Fallback: render as source
            await setupDiagramWrapper(wrapper, null, pre as HTMLElement, normalizedLang);
          }
        }
      }
    }
  }
}
