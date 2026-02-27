# Markpad 技术架构与实现细节

本文档记录了 Markpad 核心技术特性的实现原理，供后续开发和性能调优参考。

## 1. 整体架构

```
┌─────────────────────────────────────────────────────────────┐
│                      Frontend (SvelteKit)                    │
├─────────────────────────────────────────────────────────────┤
│  MarkdownViewer.svelte                                      │
│  ├── Editor (Monaco)      ←→   Viewer (HTML)               │
│  ├── TabManager (State)                                      │
│  └── Settings (Theme, Preferences)                          │
├─────────────────────────────────────────────────────────────┤
│                     Tauri IPC Bridge                         │
├─────────────────────────────────────────────────────────────┤
│                      Backend (Rust)                          │
├─────────────────────────────────────────────────────────────┤
│  comrak (Markdown → HTML)    notify (File Watcher)         │
│  tauri-plugin-* (Dialog, Window State, Single Instance)     │
└─────────────────────────────────────────────────────────────┘
```

## 2. Markdown 渲染流程

### 2.1 分层渲染架构

**解析层 (Rust/comrak)**
- 后端使用 `comrak` 将 Markdown 转换为 HTML
- 支持 GFM 扩展：strikethrough、table、autolink、tasklist、footnotes
- 生成带 `data-sourcepos` 属性的 HTML，用于滚动同步定位

**表现层 (前端)**
- 相对路径图片解析 (`convertFileSrc`)
- YouTube 链接转嵌入播放器
- GFM Alerts 解析 (NOTE/TIP/IMPORTANT/WARNING/CAUTION)

**增强层**
- `highlight.js`: 代码块语法高亮
- `KaTeX`: 数学公式渲染
- `Mermaid`: 本地图表渲染
- `Kroki`: 远程图表服务 (PlantUML, GraphViz 等)

### 2.2 代码高亮系统

使用 `highlight.js` 进行客户端代码高亮：

```typescript
// MarkdownViewer.svelte
hljs.highlightElement(block as HTMLElement);
```

主题通过 CSS 变量实现动态切换：

```css
/* styles.css */
:root {
  --hljs-bg: #f6f8fa;
  --hljs-comment: #6e7781;
  --hljs-keyword: #cf222e;
  --hljs-string: #0a3069;
  /* ... */
}
```

内置主题：GitHub Light, GitHub Dark, One Dark, Monokai, Nord, Solarized Dark, Vue

## 3. 异步渲染保护机制

### 3.1 渲染锁 (isRendering)

由于图表渲染（Mermaid/Kroki）涉及大量的异步 DOM 操作，引入了互斥锁：

```typescript
let isRendering = false;

async function renderRichContent() {
    if (isRendering) return;
    isRendering = true;
    try {
        // Mermaid → Kroki → Highlight → KaTeX
    } finally {
        isRendering = false;
    }
}
```

**解决问题**：
- 消除 DOM 递归替换导致的 HierarchyRequestError
- 避免 Svelte 5 响应式机制引发的死循环

### 3.2 防抖策略 (Debounce)

分屏视图下实时预览使用 300ms 防抖：

```typescript
$effect(() => {
    if (tab.isSplit && tab.rawContent) {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
            invoke('render_markdown', { content: tab.rawContent })...
        }, 300);
    }
});
```

## 4. 滚动同步系统

### 4.1 插值定位 (Interpolated Scroll)

利用 comrak 生成的 `data-sourcepos` 属性实现精确的行号定位：

```typescript
// sourcepos 格式: "1:1-5:10" (startLine:startCol-endLine:endCol
function scrollToLine(line: number, ratio: number = 0) {
    for (const el of markdownBody.children) {
        const sourcepos = el.dataset.sourcepos;
        if (sourcepos) {
            const [start, end] = sourcepos.split('-');
            const startLine = parseInt(start.split(':')[0]);
            const endLine = parseInt(end.split(':')[0]);
            if (line >= startLine && line <= endLine) {
                // 计算元素内的相对位置
                const ratio = (line - startLine) / (endLine - startLine);
                const targetScroll = el.offsetTop + el.offsetHeight * ratio - viewportHeight * ratio;
                markdownBody.scrollTop = targetScroll;
                return;
            }
        }
    }
}
```

### 4.2 Anchor Line 保存

切换标签时保存当前视口的"锚点行号"，恢复时精确还原阅读位置：

```typescript
interface Tab {
    scrollPercentage: number;  // 百分比回退
    anchorLine: number;        // 锚点行号（精确）
    scrollTop: number;         // 原始滚动位置
}
```

## 5. 图表切换逻辑 (Wrapper Pattern)

为支持图表与源码切换且不破坏 DOM 结构：

```typescript
function setupDiagramWrapper(wrapper: HTMLElement, renderLayer: HTMLElement, 
                              sourceLayer: HTMLElement) {
    wrapper.appendChild(renderLayer);
    wrapper.appendChild(sourceLayer);
    sourceLayer.style.display = 'none';
    
    // 切换按钮
    toggleBtn.onclick = () => {
        const showingSource = sourceLayer.style.display !== 'none';
        sourceLayer.style.display = showingSource ? 'none' : 'block';
        renderLayer.style.display = showingSource ? 'block' : 'none';
    };
}
```

**优势**：
- 保留原始 DOM 结构，避免重复解析
- 源码层保留 `highlight.js` 高亮效果
- 通过 `!important` 强制控制显隐，避免 CSS 冲突

## 6. 状态管理 (Svelte 5 Runes)

### 6.1 TabManager

```typescript
class TabManager {
    tabs = $state<Tab[]>([]);
    activeTabId = $state<string | null>(null);
    
    get activeTab() {
        return this.tabs.find((t) => t.id === this.activeTabId);
    }
}
```

### 6.2 Settings

```typescript
class SettingsStore {
    minimap = $state(false);
    wordWrap = $state('on');
    themeScheme = $state<string>('github-dark');
    
    constructor() {
        // localStorage 持久化
        $effect.root(() => {
            $effect(() => {
                localStorage.setItem('editor.minimap', String(this.minimap));
                // ...
            });
        });
    }
}
```

## 7. 文件监听系统

### 7.1 Live Mode

使用 Rust `notify` crate 监听文件变更：

```rust
#[tauri::command]
fn watch_file(handle: AppHandle, state: State<WatcherState>, path: String) -> Result<(), String> {
    let mut watcher = RecommendedWatcher::new(
        move |res: Result<notify::Event, notify::Error>| {
            if let Ok(_) = res {
                let _ = handle.emit("file-changed", ());
            }
        },
        Config::default(),
    )?;
    watcher.watch(Path::new(&path), RecursiveMode::NonRecursive)?;
    // ...
}
```

### 7.2 前端响应

```typescript
listen('file-changed', () => {
    if (liveMode) loadMarkdown(currentFile);
});
```

## 8. 原生集成

### 8.1 单实例锁定

```rust
.plugin(tauri_plugin_single_instance::init(|app, args, _cwd| {
    let path = args.iter().skip(1).find(|a| !a.starts_with("-"));
    let _ = app.get_webview_window("main").emit("file-path", path);
    let _ = app.get_webview_window("main").set_focus();
}))
```

### 8.2 自定义安装器

- Windows: NSIS 安装包，自动配置 `.md` 文件关联
- 支持 `--install` 和 `--uninstall` 命令行参数
- 便携模式：直接运行 exe，无需安装

### 8.3 窗口状态持久化

使用 `tauri-plugin-window-state` 自动保存/恢复窗口位置和大小。