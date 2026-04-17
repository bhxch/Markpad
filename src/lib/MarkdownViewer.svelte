<script lang="ts">
  import { invoke, convertFileSrc } from '@tauri-apps/api/core';
  import { listen } from '@tauri-apps/api/event';
  import { getCurrentWindow } from '@tauri-apps/api/window';
  import { onMount, tick, untrack } from 'svelte';
  import { fly } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';
  import { openUrl } from '@tauri-apps/plugin-opener';
  import { open, save, ask } from '@tauri-apps/plugin-dialog';
  import Installer from './Installer.svelte';
  import Uninstaller from './Uninstaller.svelte';
  import Settings from './components/Settings.svelte';
  import TitleBar from './components/TitleBar.svelte';
  import Editor from './components/Editor.svelte';
  import Modal from './components/Modal.svelte';
  import ExportModal from './components/ExportModal.svelte';
  import Toc from './components/Toc.svelte';
  import Toast from './components/Toast.svelte';
  import ZoomOverlay from './components/ZoomOverlay.svelte';
  import ContextMenu, { type ContextMenuItem } from './components/ContextMenu.svelte';
  import type { ExportFormat, PdfPageSize } from './export';
  import { exportAsHtml, exportAsPdf } from './export';
  import { i18n } from './i18n';

  // Reactive translations
  let t = $state(i18n.getAll());

  import HomePage from './components/HomePage.svelte';
  import { tabManager } from './stores/tabs.svelte.js';
  import { settings } from './stores/settings.svelte.js';
  import { createKrokiUrl, SUPPORTED_DIAGRAMS } from './kroki';
  import { getDiagramType, DIAGRAM_ALIASES, type DiagramRenderMode } from './diagrams';
  import { renderLocalDiagram, supportsLocalRender, renderRustDiagram, supportsRustRender } from './localRenderers';

  const appWindow = getCurrentWindow();

  type MarkdownResponse = {
    html: string;
    metadata: string;
  };

  // syntax highlighting & latex
  let hljs: any = $state(null);
  let renderMathInElement: any = $state(null);
  let katex: any = $state(null);
  let mermaid: any = $state(null);
  
  // Tree-sitter supported languages (cached)
  let treeSitterLanguages: Set<string> = $state(new Set());

  import 'highlight.js/styles/github-dark.css';
  import 'katex/dist/katex.min.css';
  
  // Get the current code theme based on settings
  function getCodeTheme(): string {
    if (settings.codeTheme === 'auto') {
      const currentThemeObj = settings.themes.find((t) => t.id === settings.themeScheme);
      const mode = currentThemeObj ? currentThemeObj.mode : 'dark';
      return mode === 'dark' ? 'dark-modern' : 'light-modern';
    }
    return settings.codeTheme;
  }
  
  // Highlight code using tree-sitter with hljs fallback
  async function highlightCodeWithTreeSitter(block: HTMLElement, lang: string): Promise<boolean> {
    const code = block.textContent || '';
    if (!code.trim()) return false;
    
    try {
      const theme = getCodeTheme();
      const highlightedHtml = await invoke<string>('highlight_code', {
        code,
        language: lang,
        theme
      });
      
      // Replace the content with highlighted HTML
      block.innerHTML = highlightedHtml;
      
      // Mark as tree-sitter highlighted
      block.classList.add('ts-highlighted');
      
      return true;
    } catch (e) {
      // Language not supported or highlighting failed, will fall back to hljs
      return false;
    }
  }
  
  // Initialize tree-sitter supported languages list
  async function initTreeSitterLanguages(): Promise<void> {
    try {
      const languages = await invoke<string[]>('get_supported_languages');
      treeSitterLanguages = new Set(languages);
    } catch (e) {
      console.warn('Failed to get tree-sitter supported languages:', e);
    }
  }

  let mode = $state<'loading' | 'app' | 'installer' | 'uninstall'>('loading');

  let recentFiles = $state<string[]>([]);
  let isFocused = $state(true);
  let markdownBody = $state<HTMLElement | null>(null);
  let editorPane = $state<{ syncScrollToLine: (line: number, ratio?: number) => void; revealHeader: (text: string) => void } | null>(null);
  let liveMode = $state(false);
  
  let metadata = $state('');
  let showMetadata = $state(false);

  let isDragging = $state(false);
  let dragTarget = $state<'editor' | 'preview' | null>(null);
  let isForceExiting = $state(false);
  let isProgrammaticScroll = false;
  let renderVersion = 0; // Render version counter to cancel stale renders

  // Upstream: heading fold state
  let collapsedHeaders = $state(new Set<string>());

  // Upstream: lightbox for images/diagrams
  let viewableItems = $state<Array<{ type: 'img' | 'svg'; src?: string; html?: string }>>([]);
  let lightboxIndex = $state(-1);

  const LIGHTBOX_ICON = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line><line x1="11" y1="8" x2="11" y2="14"></line><line x1="8" y1="11" x2="14" y2="11"></line></svg>`;

  function injectLightboxButtons(markdownBody: HTMLElement) {
    const items: Array<{ type: 'img' | 'svg'; src?: string; html?: string }> = [];

    // Collect all <img> elements that are not inside diagram wrappers
    const images = markdownBody.querySelectorAll('img');
    for (const img of Array.from(images)) {
      // Skip small icons, emojis, and images already inside diagram wrappers
      if (img.closest('.diagram-wrapper')) continue;
      if (img.closest('.kroki-container')) continue;
      if (img.width > 0 && img.width < 32 && img.height > 0 && img.height < 32) continue;

      const src = img.getAttribute('src');
      if (!src) continue;

      const index = items.length;
      items.push({ type: 'img', src });

      // Wrap image if not already wrapped
      let wrapper = img.parentElement;
      if (!wrapper || wrapper.tagName !== 'DIV' || !wrapper.classList.contains('img-lightbox-wrapper')) {
        wrapper = document.createElement('div');
        wrapper.className = 'img-lightbox-wrapper';
        wrapper.style.position = 'relative';
        wrapper.style.display = 'inline-block';
        img.parentNode?.insertBefore(wrapper, img);
        wrapper.appendChild(img);
      }

      const btn = document.createElement('button');
      btn.className = 'img-lightbox-btn';
      btn.type = 'button';
      btn.innerHTML = LIGHTBOX_ICON;
      btn.title = t.viewFullscreen;
      btn.onclick = (e) => {
        e.stopPropagation();
        e.preventDefault();
        lightboxIndex = index;
      };
      wrapper.appendChild(btn);
    }

    // Collect diagram wrappers with rendered SVG output
    const diagramWrappers = markdownBody.querySelectorAll('.diagram-wrapper');
    for (const dw of Array.from(diagramWrappers)) {
      const renderEl = dw.querySelector('[data-diagram-render="true"]');
      if (!renderEl) continue;

      const svg = renderEl.querySelector('svg');
      if (!svg) continue;

      const index = items.length;
      items.push({ type: 'svg', html: svg.outerHTML });

      const btn = document.createElement('button');
      btn.className = 'img-lightbox-btn';
      btn.type = 'button';
      btn.innerHTML = LIGHTBOX_ICON;
      btn.title = t.viewFullscreen;
      btn.onclick = (e) => {
        e.stopPropagation();
        e.preventDefault();
        lightboxIndex = index;
      };
      dw.appendChild(btn);
    }

    viewableItems = items;
  }

  // Upstream: context menu
  let docContextMenu = $state<{
    show: boolean;
    x: number;
    y: number;
    items: ContextMenuItem[];
  }>({
    show: false,
    x: 0,
    y: 0,
    items: [],
  });

  // Upstream: toast notifications
  let toasts = $state<{ id: string; message: string; type: 'info' | 'error' | 'warning' }[]>([]);
  function addToast(message: string, type: 'info' | 'error' | 'warning' = 'info') {
    const id = crypto.randomUUID();
    toasts.push({ id, message, type });
  }

  // Scroll history for mouse button 4/5 navigation
  let scrollHistory: number[] = [];
  let scrollFuture: number[] = [];

  // Upstream: large file progressive loading
  let loadingTabs = $state<string[]>([]);
  let isAtBottom = $state(false);
  let isScrolling = $state(false);
  let scrollIdleTimer: ReturnType<typeof setTimeout>;

  function pushScrollHistory() {
    if (markdownBody) {
      scrollHistory.push(markdownBody.scrollTop);
      scrollFuture = [];
      if (scrollHistory.length > 50) scrollHistory.shift();
    }
  }

  // derived from tab manager
  let activeTab = $derived(tabManager.activeTab);
  let isEditing = $derived(activeTab?.isEditing ?? false);
  let rawContent = $derived(activeTab?.rawContent ?? '');
  let isSplit = $derived(activeTab?.isSplit ?? false);

  // derived from tab manager
  let currentFile = $derived(tabManager.activeTab?.path ?? '');
  let editorLanguage = $derived(getLanguage(currentFile));
  let htmlContent = $derived(tabManager.activeTab?.content ?? '');
  let scrollTop = $derived(tabManager.activeTab?.scrollTop ?? 0);
  let isScrolled = $derived(scrollTop > 0);
  let windowTitle = $derived(tabManager.activeTab?.title ?? 'Markpad');
  let isScrollSynced = $derived(tabManager.activeTab?.isScrollSynced ?? false);

  let showHome = $state(false);
  let isFullWidth = $state(localStorage.getItem('isFullWidth') === 'true');
  let viewerPaneEl = $state<HTMLElement>();
  let viewerWidth = $state(0);
  const TOC_WIDTH = 240;
  let isOverhanging = $derived(isFullWidth || (viewerWidth > 0 && TOC_WIDTH > Math.max(50, (viewerWidth - 780) / 2)));

  $effect(() => {
    localStorage.setItem('isFullWidth', String(isFullWidth));
  });

  let showSettings = $state(false);

  // ui state
  let tooltip = $state({ show: false, text: '', x: 0, y: 0 });
  let caretEl: HTMLElement;
  let caretAbsoluteTop = 0;
  let modalState = $state<{
    show: boolean;
    title: string;
    message: string;
    kind: 'info' | 'warning' | 'error';
    showSave: boolean;
    resolve: ((v: 'save' | 'discard' | 'cancel') => void) | null;
  }>({
    show: false,
    title: '',
    message: '',
    kind: 'info',
    showSave: false,
    resolve: null,
  });

  let showExportModal = $state(false);
  let exportMessage = $state<{ show: boolean; text: string }>({ show: false, text: '' });

  async function handleExport(format: ExportFormat, pageSize: PdfPageSize) {
    showExportModal = false;
    
    const container = document.querySelector('.markdown-container') as HTMLElement;
    if (!container) return;

    // Get filename without .md extension
    const rawTitle = tabManager.activeTab?.title || 'document';
    const fileName = rawTitle.replace(/\.md$/i, '');

    try {
      if (format === 'html') {
        const success = await exportAsHtml(container, settings.showToc, fileName);
        if (success) {
          exportMessage = { show: true, text: t.exportSuccess };
          setTimeout(() => { exportMessage = { show: false, text: '' }; }, 3000);
        }
      } else {
        // Use browser print for PDF export
        const result = await exportAsPdf(container, settings.showToc, pageSize, fileName);
        exportMessage = { show: true, text: result.message };
        setTimeout(() => { exportMessage = { show: false, text: '' }; }, 5000);
      }
    } catch (e) {
      console.error('Export failed:', e);
      exportMessage = { show: true, text: `${t.exportFailed}: ${e}` };
      setTimeout(() => { exportMessage = { show: false, text: '' }; }, 5000);
    }
  }

  function askCustom(message: string, options: { title: string; kind: 'info' | 'warning' | 'error'; showSave?: boolean }): Promise<'save' | 'discard' | 'cancel'> {
    return new Promise((resolve) => {
      modalState = {
        show: true,
        title: options.title,
        message,
        kind: options.kind,
        showSave: options.showSave ?? false,
        resolve,
      };
    });
  }

  function handleModalSave() {
    if (modalState.resolve) modalState.resolve('save');
    modalState.show = false;
  }

  async function appExit() {
    const dirtyTabs = tabManager.tabs.filter((t) => t.isDirty || (t.path === '' && t.rawContent.trim() !== ''));
    if (dirtyTabs.length > 0) {
      const response = await askCustom(
        `You have ${dirtyTabs.length} unsaved file(s). Discard changes and exit?`,
        { title: t.unsavedChanges, kind: 'warning', showSave: false },
      );
      if (response !== 'discard') return;
    }
    isForceExiting = true;
    appWindow.close();
  }

  function handleModalConfirm() {
    if (modalState.resolve) modalState.resolve('discard');
    modalState.show = false;
  }

  function handleSplitterKeyDown(e: KeyboardEvent) {
    const activeTab = tabManager.activeTab;
    if (!activeTab || !tabManager.activeTabId) return;

    if (e.key === 'ArrowLeft') {
      tabManager.setSplitRatio(tabManager.activeTabId, Math.max(0.1, activeTab.splitRatio - 0.05));
    } else if (e.key === 'ArrowRight') {
      tabManager.setSplitRatio(tabManager.activeTabId, Math.min(0.9, activeTab.splitRatio + 0.05));
    }
  }

  function handleModalCancel() {
    if (modalState.resolve) modalState.resolve('cancel');
    modalState.show = false;
  }

  function getLanguage(path: string) {
    if (!path) return 'markdown';
    const ext = path.split('.').pop()?.toLowerCase();
    switch (ext) {
      case 'js':
      case 'jsx':
        return 'javascript';
      case 'ts':
      case 'tsx':
        return 'typescript';
      case 'html':
        return 'html';
      case 'css':
        return 'css';
      case 'json':
        return 'json';
      case 'md':
      case 'markdown':
      case 'mdown':
      case 'mkd':
        return 'markdown';
      default:
        return 'plaintext';
    }
  }

  $effect(() => {
    const _ = tabManager.activeTabId;
    showHome = false;
  });

  // Callout alert icons (upstream: expanded set with more types)
  const alertIcons: Record<string, string> = {
    note: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"/><path d="m15 5 4 4"/></svg>',
    info: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>',
    todo: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.801 10A10 10 0 1 1 17 3.335"/><path d="m9 11 3 3L22 4"/></svg>',
    tip: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/></svg>',
    important: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" x2="12" y1="8" y2="12"/><line x1="12" x2="12.01" y1="16" y2="16"/></svg>',
    warning: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>',
    caution: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="7.86 2 16.14 2 22 7.86 22 16.14 16.14 22 7.86 22 2 16.14 2 7.86 7.86 2"/><line x1="12" x2="12" y1="8" y2="12"/><line x1="12" x2="12.01" y1="16" y2="16"/></svg>',
    faq: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><path d="M12 17h.01"/></svg>',
    question: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><path d="M12 17h.01"/></svg>',
    example: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="8" x2="21" y1="6" y2="6"/><line x1="8" x2="21" y1="12" y2="12"/><line x1="8" x2="21" y1="18" y2="18"/><line x1="3" x2="3.01" y1="6" y2="6"/><line x1="3" x2="3.01" y1="12" y2="12"/><line x1="3" x2="3.01" y1="18" y2="18"/></svg>',
  };

  function processMarkdownHtml(html: string, filePath: string): string {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');

    // resolve relative image paths
    for (const img of doc.querySelectorAll('img')) {
      const src = img.getAttribute('src');
      let finalSrc = src;
      if (src && !src.startsWith('http') && !src.startsWith('data:')) {
        try {
          const decodedSrc = decodeURIComponent(src);
          finalSrc = convertFileSrc(resolvePath(filePath, decodedSrc));
        } catch (e) {
          finalSrc = convertFileSrc(resolvePath(filePath, src));
        }
        img.setAttribute('src', finalSrc);
      }

      if (src) {
        const ext = src.split('.').pop()?.toLowerCase();
        const isVideo = ['mp4', 'webm', 'ogg', 'mov'].includes(ext || '');
        const isAudio = ['mp3', 'wav', 'aac', 'flac', 'm4a'].includes(ext || '');

        if (isVideo || isAudio) {
          const media = doc.createElement(isVideo ? 'video' : 'audio');
          media.setAttribute('controls', '');
          media.setAttribute('src', finalSrc || '');
          media.style.maxWidth = '100%';

          if (img.hasAttribute('width')) media.setAttribute('width', img.getAttribute('width')!);
          if (img.hasAttribute('height')) media.setAttribute('height', img.getAttribute('height')!);
          if (img.hasAttribute('alt')) media.setAttribute('aria-label', img.getAttribute('alt')!);
          if (img.hasAttribute('title')) media.setAttribute('title', img.getAttribute('title')!);

          img.replaceWith(media);
          continue;
        }

        if (isYoutubeLink(src)) {
          const videoId = getYoutubeId(src);
          if (videoId) replaceWithYoutubeEmbed(img, videoId);
        }
      }
    }

    // convert youtube links to embeds
    for (const a of doc.querySelectorAll('a')) {
      const href = a.getAttribute('href');
      if (href && isYoutubeLink(href)) {
        const parent = a.parentElement;
        if (parent && (parent.tagName === 'P' || parent.tagName === 'DIV') && parent.childNodes.length === 1) {
          const videoId = getYoutubeId(href);
          if (videoId) replaceWithYoutubeEmbed(a, videoId);
        }
      }
    }

    // Helper to strip leading breaks from callout content
    const stripLeadingBreaks = (node: Node) => {
      const brs = (node as Element).querySelectorAll('br');
      for (const br of Array.from(brs)) {
        let prev = br.previousSibling;
        let isLeading = true;
        while (prev) {
          if (prev.nodeType === 3 && prev.textContent?.replace(/\xA0|\s|&nbsp;/g, '').trim()) {
            isLeading = false;
            break;
          } else if (prev.nodeType === 1) {
            isLeading = false;
            break;
          }
          prev = prev.previousSibling;
        }
        if (isLeading) br.parentElement?.removeChild(br);
      }
      while (node.firstChild) {
        const child = node.firstChild;
        if (child.nodeType === 3 && child.textContent?.replace(/\xA0|\s|&nbsp;/g, '').trim() === '') {
          child.parentElement?.removeChild(child);
        } else if (child.nodeType === 1 && (child as Element).tagName === 'P' && (child as Element).innerHTML.replace(/\xA0|\s|&nbsp;/g, '').trim() === '') {
          child.parentElement?.removeChild(child);
        } else {
          break;
        }
      }
    };

    // parse callouts (upstream: supports [!TYPE +/-] with custom titles, nesting, and folding)
    for (const bq of Array.from(doc.querySelectorAll('blockquote'))) {
      const walker = doc.createTreeWalker(bq, NodeFilter.SHOW_TEXT);
      let textNode: Text | null = null;
      let matchResult: RegExpMatchArray | null = null;

      let curr: Node | null;
      while (curr = walker.nextNode()) {
        const m = curr.nodeValue?.match(/^\s*\[!([a-zA-Z0-9_\-]+)\]([+-]?)\s*/i);
        if (m) {
          textNode = curr as Text;
          matchResult = m;
          break;
        }
      }

      if (textNode && matchResult) {
        const type = matchResult[1].toLowerCase();
        const fold = matchResult[2] || '';
        const isFoldable = fold === '+' || fold === '-';

        textNode.nodeValue = textNode.nodeValue!.slice(matchResult[0].length);

        // Collect custom title nodes (everything on the first line after [!TYPE])
        const titleNodes: Node[] = [];
        let currentLineNode: Node | null = textNode;
        while (currentLineNode) {
          if (currentLineNode.nodeType === 1 && (currentLineNode as Element).tagName === 'BR') {
            const br = currentLineNode;
            currentLineNode = br.nextSibling;
            br.parentElement?.removeChild(br);
            break;
          }
          const next: Node | null = currentLineNode.nextSibling;
          titleNodes.push(currentLineNode);
          currentLineNode = next;
        }

        const container = doc.createElement('div');
        container.className = `markdown-alert markdown-alert-${type}${isFoldable ? ' callout-foldable' : ''}`;

        const titleEl = doc.createElement('p');
        titleEl.className = 'markdown-alert-title';
        if (isFoldable) titleEl.classList.add('callout-toggle');

        const titleInner = doc.createElement('span');
        titleInner.className = 'callout-title-inner';
        for (const tn of titleNodes) titleInner.appendChild(tn);

        // Restore default title if empty
        if (titleInner.textContent?.trim() === '') {
          titleInner.textContent = type.charAt(0).toUpperCase() + type.slice(1);
        }

        // Omit rendering stray <br> in the title
        for (const br of Array.from(titleInner.querySelectorAll('br'))) {
          br.parentElement?.removeChild(br);
        }

        const svgIconHtml = alertIcons[type] || '';
        if (svgIconHtml) {
          const temp = doc.createElement('div');
          temp.innerHTML = svgIconHtml;
          if (temp.firstChild) titleEl.appendChild(temp.firstChild);
        }
        titleEl.appendChild(titleInner);

        if (isFoldable) {
          const chevron = doc.createElement('div');
          chevron.innerHTML = `<svg class="callout-fold-icon" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>`;
          titleEl.appendChild(chevron.firstChild!);
        }
        container.appendChild(titleEl);

        const contentWrapper = doc.createElement('div');
        contentWrapper.className = 'markdown-alert-content';
        const contentInner = doc.createElement('div');
        contentInner.className = 'content-inner';
        contentWrapper.appendChild(contentInner);

        while (bq.firstChild) contentInner.appendChild(bq.firstChild);

        stripLeadingBreaks(contentInner);

        while (contentInner.lastChild) {
          const child = contentInner.lastChild;
          if (child.nodeType === 3 && child.textContent?.trim() === '') child.parentElement?.removeChild(child);
          else if (child.nodeType === 1 && (child as Element).tagName === 'P' && (child as Element).innerHTML.trim() === '') child.parentElement?.removeChild(child);
          else break;
        }

        if (contentInner.childNodes.length === 0) {
          container.classList.add('callout-title-only');
        } else {
          if (fold === '-') {
            contentWrapper.classList.add('is-collapsed');
            container.classList.add('is-collapsed');
          }
          container.appendChild(contentWrapper);
        }
        bq.replaceWith(container);
      }
    }

    // Heading fold (upstream: wraps content under headings for collapsible sections)
    const headings = Array.from(doc.querySelectorAll('h1, h2, h3, h4, h5, h6'));
    for (const h of headings) {
      const chevron = doc.createElement('span');
      chevron.className = 'header-fold-icon';
      chevron.innerHTML = `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>`;
      h.insertBefore(chevron, h.firstChild);
      h.classList.add('foldable-header');

      const wrapper = doc.createElement('div');
      wrapper.className = 'foldable-content-wrapper';
      const inner = doc.createElement('div');
      inner.className = 'content-inner';
      wrapper.appendChild(inner);

      let current = h.nextElementSibling;
      const level = parseInt(h.tagName[1], 10);
      while (current) {
        const isHeader = /^H[1-6]$/.test(current.tagName);
        if (isHeader) {
          const nextLevel = parseInt(current.tagName[1], 10);
          if (nextLevel <= level) break;
        }
        const next = current.nextElementSibling;
        inner.appendChild(current);
        current = next;
      }
      if (h.parentNode) h.parentNode.insertBefore(wrapper, h.nextSibling);

      const mappingId = 'wrap-' + Math.random().toString(36).substr(2, 9);
      h.setAttribute('data-fold-target', mappingId);
      wrapper.id = mappingId;

      const key = h.id || h.textContent?.trim() || '';
      if (collapsedHeaders.has(key)) {
        h.classList.add('is-collapsed');
        wrapper.classList.add('is-collapsed');
      }
    }

    // Process task list checkboxes
    for (const input of Array.from(doc.querySelectorAll('li input[type="checkbox"]'))) {
      input.setAttribute('data-task-checkbox', '');
      input.removeAttribute('disabled');
      (input as HTMLInputElement).style.cursor = 'pointer';

      const li = input.closest('li');
      if (!li) continue;

      const nodes = Array.from(li.childNodes);
      const inputIdx = nodes.indexOf(input);
      const afterInput = nodes.slice(inputIdx + 1);

      const inlineNodes = [];
      for (const n of afterInput) {
        if (n.nodeType === 1 && ['P', 'DIV', 'UL', 'OL'].includes((n as Element).tagName)) break;
        inlineNodes.push(n);
      }

      if (inlineNodes.length > 0) {
        const wrapper = doc.createElement('span');
        wrapper.className = 'task-text';
        for (const n of inlineNodes) wrapper.appendChild(n);
        li.insertBefore(wrapper, afterInput[inlineNodes.length] || null);
      }

      if ((input as HTMLInputElement).checked) {
        li.classList.add('task-done');
      }
    }

    // Clean up empty paragraphs
    Array.from(doc.querySelectorAll('p')).forEach((p) => {
      if (p.innerHTML.replace(/&nbsp;|\s/g, '').trim() === '') {
        p.remove();
      }
    });

    return doc.body.innerHTML;
  }


  async function loadMarkdown(filePath: string, options: { navigate?: boolean; skipTabManagement?: boolean; preserveEditState?: boolean } = {}) {
    showHome = false;
    try {
      let isExistingTab = false;
      if (options.navigate && tabManager.activeTab) {
        tabManager.navigate(tabManager.activeTab.id, filePath);
      } else if (!options.skipTabManagement) {
        const existing = tabManager.tabs.find((t) => t.path === filePath);
        if (existing) {
          isExistingTab = true;
          tabManager.setActive(existing.id);
        } else if (tabManager.activeTab && tabManager.activeTab.path === '') {
          tabManager.updateTabPath(tabManager.activeTab.id, filePath);
        } else {
          tabManager.addTab(filePath);
        }
      }
      const activeId = tabManager.activeTabId;
      if (!activeId) return;

      const ext = filePath.split('.').pop()?.toLowerCase();
      const isMarkdown = ['md', 'markdown', 'mdown', 'mkd'].includes(ext || '');
      const tab = tabManager.tabs.find((t) => t.id === activeId);

      if (isMarkdown) {
        // Only set default edit mode if it's a brand new tab or we aren't preserving state
        if (tab && !options.preserveEditState && !isExistingTab) {
          tab.isEditing = settings.startInEditor;
        }

        // Upstream: progressive loading - first load preview with maxBytes limit
        const [html, content, isFull] = await invoke('open_markdown_preview', { path: filePath, maxBytes: 50000 }) as [string, string, boolean];
        const processedInfo = processMarkdownHtml(html, filePath);
        tabManager.updateTabContent(activeId, processedInfo);
        tabManager.setTabRawContent(activeId, content);

        if (!isFull) {
          loadingTabs = [...loadingTabs, activeId];
          tick().then(() => {
            if (markdownBody) isAtBottom = markdownBody.scrollHeight <= markdownBody.clientHeight + 100;
          });
          Promise.all([
            invoke('open_markdown', { path: filePath }) as Promise<string>,
            invoke('read_file_content', { path: filePath }) as Promise<string>
          ]).then(([fullHtml, fullContent]) => {
            const applyFull = () => {
              try {
                if (isScrolling) {
                  setTimeout(applyFull, 100);
                  return;
                }
                if (tabManager.tabs.find((t) => t.id === activeId)?.path === filePath) {
                  const fullProcessed = processMarkdownHtml(fullHtml, filePath);
                  tabManager.updateTabContent(activeId, fullProcessed);
                  tabManager.setTabRawContent(activeId, fullContent);
                  loadingTabs = loadingTabs.filter((id) => id !== activeId);
                  if (tabManager.activeTabId === activeId) {
                    tick().then(() => {
                      setTimeout(renderRichContent, 10);
                    });
                  }
                } else {
                  loadingTabs = loadingTabs.filter((id) => id !== activeId);
                }
              } catch (applyErr) {
                console.error('applyFull error:', applyErr);
                addToast('Error processing full markdown: ' + String(applyErr), 'error');
                loadingTabs = loadingTabs.filter((id) => id !== activeId);
              }
            };
            
            if ('requestIdleCallback' in window) {
              (window as any).requestIdleCallback(applyFull, { timeout: 2000 });
            } else {
              setTimeout(applyFull, 100);
            }
          }).catch((e) => {
            console.error('Promise.all error:', e);
            addToast('Backend Error loading full markdown: ' + String(e), 'error');
            loadingTabs = loadingTabs.filter((id) => id !== activeId);
          });
        }

        // Also get metadata
        try {
          const res = (await invoke('open_markdown', { path: filePath })) as MarkdownResponse;
          metadata = res.metadata;
        } catch (e) {
          // metadata extraction failure is non-fatal
        }
      } else {
        if (tab) tab.isEditing = true;
        const content = (await invoke('read_file_content', { path: filePath })) as string;
        tabManager.setTabRawContent(activeId, content);
      }

      if (liveMode) invoke('watch_file', { path: filePath }).catch(console.error);

      await tick();
      if (filePath) saveRecentFile(filePath);
    } catch (error) {
      console.error('Error loading file:', error);
      const errStr = String(error);
      if (errStr.includes('The system cannot find the file specified') || errStr.includes('No such file or directory')) {
        deleteRecentFile(filePath);
        if (tabManager.activeTab && tabManager.activeTab.path === filePath) {
          tabManager.closeTab(tabManager.activeTab.id);
        }
      }
    }
  }

  async function renderRichContent(version: number) {
    if (!markdownBody || version !== renderVersion) return;

    try {
      // 1. Diagram Rendering (Mermaid + Kroki + Local renderers)
      const allCodeBlocks = markdownBody.querySelectorAll('pre code');
      for (const block of Array.from(allCodeBlocks)) {
        if (version !== renderVersion) return;
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
                
                // Mermaid has special handling
                if (normalizedLang === 'mermaid' && mermaid) {
                  const div = document.createElement('div');
                  div.className = 'mermaid';
                  
                  try {
                    const id = 'mermaid-' + Math.random().toString(36).substring(2, 11);
                    const { svg } = await mermaid.render(id, code);
                    div.innerHTML = svg;
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

      if (!hljs || !renderMathInElement) return;

      // 3. Code Highlighting (Tree-sitter with hljs fallback)
      const codeBlocks = markdownBody.querySelectorAll('pre code');
      for (const block of Array.from(codeBlocks)) {
        if (version !== renderVersion) return;
        if (block.closest('.diagram-wrapper')) continue; // Skip diagrams
        
        const langClass = Array.from(block.classList).find((c) => c.startsWith('language-'));
        const lang = langClass ? langClass.replace('language-', '').toLowerCase() : '';
        const normalizedLang = DIAGRAM_ALIASES[lang] || lang;
        if (getDiagramType(normalizedLang)) continue; // Skip diagrams (already processed above)

        // Try tree-sitter first
        const tsSuccess = await highlightCodeWithTreeSitter(block as HTMLElement, lang);
        
        // Fallback to hljs if tree-sitter failed
        if (!tsSuccess && hljs) {
          hljs.highlightElement(block as HTMLElement);
        }

        const pre = block.parentElement;
        if (pre && pre.tagName === 'PRE') {
          pre.querySelectorAll('.lang-label').forEach((l) => l.remove());
          const codeContent = (block as HTMLElement).textContent || '';
          
          // Create copy button
          const label = document.createElement('button');
          label.className = 'lang-label';
          label.title = 'Click to copy code';
          
          if (langClass) {
            label.textContent = langClass.replace('language-', '');
          } else {
            // Show copy icon for code blocks without language
            label.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>`;
          }
          
          label.onclick = () => {
            const codeToCopy = codeContent.replace(/\n$/, '');
            navigator.clipboard.writeText(codeToCopy).then(() => {
              const originalContent = label.innerHTML;
              label.textContent = 'Copied!';
              label.classList.add('copied');
              setTimeout(() => {
                label.innerHTML = originalContent;
                label.classList.remove('copied');
              }, 1500);
            }).catch((err) => {
              console.error('Failed to copy code:', err);
            });
          };
          
          pre.appendChild(label);
        }
      }

      // 4. Inject lightbox hover buttons
      injectLightboxButtons(markdownBody);

      // 5. Math Rendering
      // Handle math elements generated by comrak 0.24+ with math_dollars enabled
      // comrak generates: <span data-math-style="display">...</span> and <span data-math-style="inline">...</span>
      if (katex) {
        // First, handle LaTeX delimiters \[...\] and \(...\) which comrak doesn't process
        // We need to process these BEFORE handling data-math-style elements
        // to avoid interfering with already rendered KaTeX
        const processLatexDelimiters = (container: HTMLElement) => {
          // Walk through text nodes and find delimiters
          const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, null);
          const textNodes: Text[] = [];
          while (walker.nextNode()) {
            const node = walker.currentNode as Text;
            // Skip if inside an already processed element or code blocks
            // code, pre elements contain code that should not be processed as math
            if (!node.parentElement?.closest('.katex, .katex-display, [data-math-style], code, pre')) {
              textNodes.push(node);
            }
          }
          
          for (const textNode of textNodes) {
            let text = textNode.textContent || '';
            const parent = textNode.parentElement;
            if (!parent) continue;
            
            // Check if this text contains LaTeX delimiters
            if (!text.includes('\\[') && !text.includes('\\(')) continue;
            
            // Replace \[...\] with display math
            text = text.replace(/\\\[([\s\S]*?)\\\]/g, (_, content) => {
              try {
                const html = katex.renderToString(content.trim(), {
                  displayMode: true,
                  throwOnError: false,
                  strict: false,
                });
                return `<div class="katex-display">${html}</div>`;
              } catch (e) {
                return `\\[${content}\\]`;
              }
            });
            
            // Replace \(...\) with inline math
            text = text.replace(/\\\(([\s\S]*?)\\\)/g, (_, content) => {
              try {
                const html = katex.renderToString(content.trim(), {
                  displayMode: false,
                  throwOnError: false,
                  strict: false,
                });
                return `<span class="katex">${html}</span>`;
              } catch (e) {
                return `\\(${content}\\)`;
              }
            });
            
            // Only update if changed
            if (text !== textNode.textContent) {
              const span = document.createElement('span');
              span.innerHTML = text;
              textNode.replaceWith(span);
            }
          }
        };
        
        processLatexDelimiters(markdownBody);
        
        // Then handle comrak-generated math spans with data-math-style attribute
        const mathSpans = markdownBody.querySelectorAll('span[data-math-style]');
        for (const span of Array.from(mathSpans)) {
          const content = span.textContent || '';
          const isDisplay = span.getAttribute('data-math-style') === 'display';
          
          try {
            const html = katex.renderToString(content, {
              displayMode: isDisplay,
              throwOnError: false,
              strict: false,
            });
            
            if (isDisplay) {
              const wrapper = document.createElement('div');
              wrapper.className = 'katex-display';
              wrapper.innerHTML = html;
              span.replaceWith(wrapper);
            } else {
              span.innerHTML = html;
              span.classList.add('katex');
            }
          } catch (e) {
            console.error('KaTeX render error:', e, 'Content:', content);
          }
        }
      }
    } catch (e) {
      console.error('Render error:', e);
    }
  }


  $effect(() => {
    const _scheme = settings.themeScheme; // 依赖主题变化
    if (htmlContent && markdownBody && !isEditing && hljs && renderMathInElement && mermaid) {
      // 1. 确定 Mermaid 主题
      const currentThemeObj = settings.themes.find((t) => t.id === settings.themeScheme);
      const mode = currentThemeObj ? currentThemeObj.mode : 'light';
      const mTheme = mode === 'dark' ? 'dark' : 'default';

      // 2. 初始化 Mermaid
      mermaid.initialize({
        startOnLoad: false,
        theme: mTheme,
        securityLevel: 'loose',
      });

      // 3. 重置 DOM (因为 renderRichContent 会破坏性修改 DOM，如 mermaid 替换文本为 SVG)
      markdownBody.innerHTML = htmlContent;
      
      // 4. 递增渲染版本，取消之前所有在途渲染
      renderVersion++;

      // 5. 执行渲染
      renderRichContent(renderVersion);
    }
  });

  $effect(() => {
    // Depend on the ID and body existence to trigger restore
    const id = tabManager.activeTabId;
    const body = markdownBody;

    if (id && body) {
      untrack(() => {
        const tab = tabManager.tabs.find((t) => t.id === id);
        if (tab) {
          let scrolled = false;

          if (tab.anchorLine > 0) {
            // Interpolated Restore
            // Find element containing the anchor line
            const children = Array.from(body.children) as HTMLElement[];
            for (const el of children) {
              const sourcepos = el.dataset.sourcepos;
              if (sourcepos) {
                const [start, end] = sourcepos.split('-');
                const startLine = parseInt(start.split(':')[0]);
                const endLine = parseInt(end.split(':')[0]);

                if (!isNaN(startLine) && !isNaN(endLine)) {
                  if (tab.anchorLine >= startLine && tab.anchorLine <= endLine) {
                    // Found the container
                    const totalLines = endLine - startLine; // Can be 0 for single line
                    let ratio = 0;
                    if (totalLines > 0) {
                      ratio = (tab.anchorLine - startLine) / totalLines;
                    }

                    // Calculate target pixel position
                    // We want the anchor line to be roughly at offset 60
                    const targetOffset = el.offsetTop + el.offsetHeight * ratio - 60;
                    body.scrollTop = Math.max(0, targetOffset);
                    scrolled = true;
                    break;
                  }
                }
              }
            }
          }

          if (!scrolled) {
            if (body.scrollHeight > body.clientHeight && tab.scrollPercentage > 0) {
              const targetScroll = tab.scrollPercentage * (body.scrollHeight - body.clientHeight);
              body.scrollTop = targetScroll;
            } else {
              body.scrollTop = tab.scrollTop;
            }
          }
        }
      });
    }
  });

  function scrollToLine(line: number, ratio: number = 0) {
    if (!markdownBody) return;

    const children = Array.from(markdownBody.children) as HTMLElement[];
    for (const el of children) {
      const sourcepos = el.dataset.sourcepos;
      if (sourcepos) {
        const [start, end] = sourcepos.split('-');
        const startLine = parseInt(start.split(':')[0]);
        const endLine = parseInt(end.split(':')[0]);

        if (!isNaN(startLine) && !isNaN(endLine)) {
          if (line >= startLine && line <= endLine) {
            const totalLines = endLine - startLine;
            let lineRatio = 0;
            if (totalLines > 0) {
              lineRatio = (line - startLine) / totalLines;
            }
            lineRatio = Math.max(0, Math.min(1, lineRatio));

            const elementTop = el.offsetTop + el.offsetHeight * lineRatio;

            const viewportHeight = markdownBody.clientHeight;
            const targetScroll = elementTop - viewportHeight * ratio;

            if (Math.abs(markdownBody.scrollTop - targetScroll) > 5) {
              isProgrammaticScroll = true;
              markdownBody.scrollTop = Math.max(0, targetScroll);
            }
            return;
          }
        }
      }
    }
  }

  function handleEditorScrollSync(line: number, ratio: number = 0) {
    if (tabManager.activeTab?.isScrollSynced) {
      scrollToLine(line, ratio);
    }
  }

  function syncEditorToPreviewScroll(target: HTMLElement) {
    if (!tabManager.activeTab?.isScrollSynced || !editorPane) return;

    const anchorOffset = target.scrollTop + 60;
    const viewportRatio = target.clientHeight > 0 ? Math.min(1, 60 / target.clientHeight) : 0;
    const children = Array.from(markdownBody?.children || []);

    for (const child of children) {
      const el = child as HTMLElement;
      if (el.offsetTop <= anchorOffset && el.offsetTop + el.offsetHeight > anchorOffset) {
        const sourcepos = el.dataset.sourcepos;
        if (!sourcepos) break;

        const [start, end] = sourcepos.split('-');
        const startLine = parseInt(start.split(':')[0]);
        const endLine = parseInt(end.split(':')[0]);

        if (!isNaN(startLine) && !isNaN(endLine)) {
          const relativeOffset = anchorOffset - el.offsetTop;
          const elementRatio = el.offsetHeight > 0 ? relativeOffset / el.offsetHeight : 0;
          const totalLines = endLine - startLine;
          const estimatedLine = startLine + Math.round(totalLines * elementRatio);

          editorPane.syncScrollToLine(estimatedLine, viewportRatio);
        }
        break;
      }
    }
  }

  function handleScroll(e: Event) {
    const target = e.target as HTMLElement;

    // Upstream: track isAtBottom for large file loading
    isAtBottom = Math.abs(target.scrollHeight - target.scrollTop - target.clientHeight) < 100;

    // Upstream: track scrolling state for deferred operations
    isScrolling = true;
    clearTimeout(scrollIdleTimer);
    scrollIdleTimer = setTimeout(() => {
      isScrolling = false;
    }, 300);

    if (isProgrammaticScroll) {
      isProgrammaticScroll = false;
      if (tabManager.activeTabId) {
        tabManager.updateTabScroll(tabManager.activeTabId, target.scrollTop);
      }
      return;
    }

    if (tabManager.activeTabId) {
      // Update raw scroll pos
      tabManager.updateTabScroll(tabManager.activeTabId, target.scrollTop);

      // Percentage fallback
      if (target.scrollHeight > target.clientHeight) {
        const percentage = target.scrollTop / (target.scrollHeight - target.clientHeight);
        tabManager.updateTabScrollPercentage(tabManager.activeTabId, percentage);
      }

      // Interpolated Anchor Calculation
      const anchorOffset = target.scrollTop + 60;
      const children = Array.from(markdownBody?.children || []);

      for (const child of children) {
        const el = child as HTMLElement;
        // Check intersection
        if (el.offsetTop <= anchorOffset && el.offsetTop + el.offsetHeight > anchorOffset) {
          const sourcepos = el.dataset.sourcepos;
          if (sourcepos) {
            const [start, end] = sourcepos.split('-');
            const startLine = parseInt(start.split(':')[0]);
            const endLine = parseInt(end.split(':')[0]);

            if (!isNaN(startLine) && !isNaN(endLine)) {
              // Calculate relative position within element
              const relativeOffset = anchorOffset - el.offsetTop;
              const ratio = relativeOffset / el.offsetHeight;

              const totalLines = endLine - startLine;
              const estimatedLine = startLine + Math.round(totalLines * ratio);

              tabManager.updateTabAnchorLine(tabManager.activeTabId, estimatedLine);
            }
          }
          break;
        }
      }
    }

    syncEditorToPreviewScroll(target);
  }

  // Upstream: toggle heading fold
  function toggleFold(key: string) {
    const isCurrentlyCollapsed = collapsedHeaders.has(key);

    if (isCurrentlyCollapsed) {
      const next = new Set(collapsedHeaders);
      next.delete(key);
      collapsedHeaders = next;
    } else {
      collapsedHeaders = new Set([...collapsedHeaders, key]);
    }

    if (!markdownBody) return;

    let h = markdownBody.querySelector(`[id="${CSS.escape(key)}"].foldable-header`) as HTMLElement | null;
    if (!h) {
      const allHeaders = markdownBody.querySelectorAll('.foldable-header');
      for (const el of Array.from(allHeaders)) {
        if ((el.textContent?.trim() || '') === key) {
          h = el as HTMLElement;
          break;
        }
      }
    }
    if (!h) return;

    const wrapId = h.getAttribute('data-fold-target');
    const wrapper = wrapId ? document.getElementById(wrapId) : null;
    if (!wrapper) return;

    h.classList.toggle('is-collapsed', !isCurrentlyCollapsed);
    wrapper.classList.toggle('is-collapsed', !isCurrentlyCollapsed);
  }

  async function toggleTaskCheckbox(checkbox: HTMLInputElement) {
    const tab = tabManager.activeTab;
    if (!tab || !tab.path) return;

    let raw: string;
    try {
      raw = (await invoke('read_file_content', { path: tab.path })) as string;
    } catch (e) {
      console.error('failed to read file for task toggle', e);
      return;
    }

    const allBoxes = Array.from(markdownBody?.querySelectorAll('[data-task-checkbox]') || []);
    const index = allBoxes.indexOf(checkbox);
    if (index === -1) return;

    const nowChecked = !checkbox.checked;

    let count = 0;
    const updated = raw.replace(/^(\s*[-*+] )\[( |x|X)\]/gm, (match, prefix) => {
      if (count === index) {
        count++;
        return `${prefix}[${nowChecked ? 'x' : ' '}]`;
      }
      count++;
      return match;
    });

    if (updated === raw) return;

    try {
      await invoke('save_file_content', { path: tab.path, content: updated });
      tab.rawContent = updated;
      tab.originalContent = updated;
    } catch (e) {
      console.error('failed to save task toggle', e);
      return;
    }

    checkbox.checked = nowChecked;
    const li = checkbox.closest('li');
    if (li) {
      li.classList.toggle('task-done', nowChecked);
    }
  }

  function saveRecentFile(path: string) {
    let files = [...recentFiles].filter((f) => f !== path);
    files.unshift(path);
    recentFiles = files.slice(0, 9);
    localStorage.setItem('recent-files', JSON.stringify(recentFiles));
  }

  function loadRecentFiles() {
    const stored = localStorage.getItem('recent-files');
    if (stored) {
      try {
        recentFiles = JSON.parse(stored);
      } catch (e) {
        console.error('Error parsing recent files:', e);
      }
    }
  }

  function deleteRecentFile(path: string) {
    recentFiles = recentFiles.filter((f) => f !== path);
    localStorage.setItem('recent-files', JSON.stringify(recentFiles));
  }

  function removeRecentFile(path: string, event: MouseEvent) {
    event.stopPropagation();
    deleteRecentFile(path);
    if (currentFile === path) tabManager.closeTab(tabManager.activeTabId!);
  }

  function resolvePath(basePath: string, relativePath: string) {
    if (relativePath.match(/^[a-zA-Z]:/) || relativePath.startsWith('/')) return relativePath;
    const parts = basePath.split(/[/\\]/);
    parts.pop();
    for (const p of relativePath.split(/[/\\]/)) {
      if (p === '.') continue;
      if (p === '..') parts.pop();
      else parts.push(p);
    }
    return parts.join('/');
  }

  function isYoutubeLink(url: string) {
    return url.includes('youtube.com/watch') || url.includes('youtu.be/');
  }

  function getYoutubeId(url: string) {
    const match = url.match(/^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/);
    return match && match[2].length === 11 ? match[2] : null;
  }

  function replaceWithYoutubeEmbed(element: Element, videoId: string) {
    const container = element.ownerDocument.createElement('div');
    container.className = 'video-container';
    const iframe = element.ownerDocument.createElement('iframe');
    iframe.src = `https://www.youtube.com/embed/${videoId}`;
    iframe.title = 'YouTube video player';
    iframe.frameBorder = '0';
    iframe.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share';
    iframe.allowFullscreen = true;
    container.appendChild(iframe);
    element.replaceWith(container);
  }

  async function canCloseTab(tabId: string): Promise<boolean> {
    const tab = tabManager.tabs.find((t) => t.id === tabId);
    if (!tab || (!tab.isDirty && tab.path !== '')) return true;

    if (!tab.isDirty) return true;

    const response = await askCustom(`You have unsaved changes in "${tab.title}". Do you want to save them before closing?`, {
      title: 'Unsaved Changes',
      kind: 'warning',
      showSave: true,
    });

    if (response === 'cancel') return false;
    if (response === 'save') {
      return await saveContent();
    }

    return true; // discard
  }

  async function toggleEdit(autoSave = false) {
    const tab = tabManager.activeTab;
    if (!tab || !tab.path) return;

    if (isEditing) {
      // Switch back to view
      if (tab.isDirty) {
        if (autoSave) {
          const success = await saveContent();
          if (!success) return; // If save fails, stay in edit mode?
        } else {
          const response = await askCustom('You have unsaved changes. Do you want to save them before returning to view mode?', {
            title: 'Unsaved Changes',
            kind: 'warning',
            showSave: true,
          });

          if (response === 'cancel') return;
          if (response === 'save') {
            const success = await saveContent();
            if (!success) return;
          }
        }
      }
      tab.isEditing = false;
      tab.isDirty = false;
      // Refresh content (re-parse)
      if (tab.path) await loadMarkdown(tab.path);
    } else {
      // Switch to edit
      try {
        const content = (await invoke('read_file_content', { path: tab.path })) as string;
        tab.rawContent = content;
        tab.isEditing = true;
        tab.isDirty = false;
      } catch (e) {
        console.error('Failed to read file for editing', e);
      }
    }
  }

  async function saveContent(): Promise<boolean> {
    const tab = tabManager.activeTab;
    if (!tab || (!tab.isEditing && !tab.isSplit)) return false;

    let targetPath = tab.path;

    if (!targetPath) {
      // Special handling for new (untitled) files
      const selected = await save({
        filters: [
          { name: 'Markdown', extensions: ['md'] },
          { name: 'All Files', extensions: ['*'] },
        ],
      });
      if (selected) {
        targetPath = selected;
      } else {
        return false; // User cancelled save dialog
      }
    }

    try {
      await invoke('save_file_content', { path: targetPath, content: tab.rawContent });
      if (tab.path === '') {
        // We just saved an untitled tab for the first time
        tabManager.updateTabPath(tab.id, targetPath);
        saveRecentFile(targetPath);
      }
      tab.isDirty = false;
      return true;
    } catch (e) {
      console.error('Failed to save file', e);
      return false;
    }
  }

  async function saveContentAs(): Promise<boolean> {
    const tab = tabManager.activeTab;
    if (!tab) return false;

    const selected = await save({
      filters: [
        { name: 'Markdown', extensions: ['md'] },
        { name: 'All Files', extensions: ['*'] },
      ],
      defaultPath: tab.path || undefined,
    });

    if (selected) {
      try {
        await invoke('save_file_content', { path: selected, content: tab.rawContent });
        tabManager.updateTabPath(tab.id, selected);
        saveRecentFile(selected);
        tab.isDirty = false;
        return true;
      } catch (e) {
        console.error('Failed to save file as', e);
        return false;
      }
    }
    return false;
  }

  function handleNewFile() {
    tabManager.addNewTab();
    showHome = false;
  }

  async function selectFile() {
    const selected = await open({
      multiple: false,
      filters: [
        { name: 'Markdown', extensions: ['md', 'markdown', 'mdown', 'mkd'] },
        { name: 'All Files', extensions: ['*'] },
      ],
    });
    if (selected && typeof selected === 'string') loadMarkdown(selected);
  }

  function toggleHome() {
    showHome = !showHome;
  }

  async function closeFile() {
    if (tabManager.activeTabId) {
      if (await canCloseTab(tabManager.activeTabId)) {
        tabManager.closeTab(tabManager.activeTabId);
      }
    }
    if (liveMode && tabManager.tabs.length === 0) invoke('unwatch_file').catch(console.error);
  }

  async function openFileLocation() {
    if (currentFile) await invoke('open_file_folder', { path: currentFile });
  }

  async function toggleLiveMode() {
    liveMode = !liveMode;
    if (liveMode && currentFile) {
      await invoke('watch_file', { path: currentFile });
      if (tabManager.activeTabId) await loadMarkdown(currentFile);
    } else {
      await invoke('unwatch_file');
    }
  }

  async function saveImageAs(src: string) {
    let realPath = '';
    if (src.startsWith('asset:')) {
      try {
        const url = new URL(src);
        realPath = decodeURIComponent(url.pathname);
        if (realPath.startsWith('/localhost/')) {
          realPath = realPath.substring(11);
        } else if (realPath.startsWith('/')) {
          realPath = realPath.substring(1);
        }
      } catch (e) {
        console.error('Failed to parse asset URL:', e);
      }
    } else if (src.startsWith('http')) {
      try {
        const response = await fetch(src);
        const buffer = await response.arrayBuffer();
        const dest = await save({
          defaultPath: 'image.png',
          filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp'] }]
        });
        if (dest) {
          await invoke('save_file_binary', { path: dest, data: Array.from(new Uint8Array(buffer)) });
          addToast('Image saved successfully');
        }
      } catch (e) {
        addToast('Failed to save remote image', 'error');
      }
      return;
    }

    if (realPath) {
      const ext = realPath.split('.').pop() || 'png';
      const dest = await save({
        defaultPath: `image.${ext}`,
        filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg'] }]
      });
      if (dest) {
        try {
          await invoke('copy_file', { src: realPath, dest });
          addToast('Image saved successfully');
        } catch (e) {
          addToast(`Failed to save image: ${e}`, 'error');
        }
      }
    }
  }

  async function saveDiagramAs(container: HTMLElement) {
    const svg = container.querySelector('svg')?.outerHTML;
    if (!svg) return;
    const dest = await save({
      defaultPath: 'diagram.svg',
      filters: [{ name: 'SVG Image', extensions: ['svg'] }]
    });
    if (dest) {
      try {
        await invoke('save_file_content', { path: dest, content: svg });
        addToast('Diagram saved as SVG');
      } catch (e) {
        addToast(`Failed to save diagram: ${e}`, 'error');
      }
    }
  }

  function handleContextMenu(e: MouseEvent) {
    if (mode !== 'app') return;
    e.preventDefault();

    const selection = window.getSelection();
    const hasSelection = selection ? selection.toString().length > 0 : false;
    const isInsideEditor = (e.target as HTMLElement).closest('.editor-container');

    // detect heading for copy ref
    const heading = (e.target as HTMLElement).closest('h1, h2, h3, h4, h5, h6');
    let copyRefItem: ContextMenuItem[] = [];
    if (heading) {
      const text = heading.textContent?.trim() || '';
      const tab = tabManager.activeTab;
      const filename = tab?.path ? tab.path.split(/[/\\]/).pop()?.replace(/\.[^.]+$/, '') || '' : '';
      const ref = filename ? `[[${filename}#${text}]]` : `#${text}`;
      copyRefItem = [
        { label: t.copyReference, onClick: () => invoke('clipboard_write_text', { text: ref }) },
        { separator: true },
      ];
    }

    const img = (e.target as HTMLElement).closest('img');
    let mediaItems: ContextMenuItem[] = [];
    if (img) {
      mediaItems = [
        { label: t.saveImageAs, onClick: () => saveImageAs(img.src) },
        { separator: true }
      ];
    }

    const mermaidDiag = (e.target as HTMLElement).closest('.mermaid-diagram');
    if (mermaidDiag) {
      mediaItems = [
        { label: t.saveDiagramAsSvg, onClick: () => saveDiagramAs(mermaidDiag as HTMLElement) },
        { separator: true }
      ];
    }

    docContextMenu = {
      show: true,
      x: e.clientX,
      y: e.clientY,
      items: [
        ...copyRefItem,
        ...mediaItems,
        ...(isEditing && isInsideEditor
          ? [
              { label: t.undo, shortcut: 'Ctrl+Z', onClick: () => { import('./components/Editor.svelte').then(m => { m.undo(); m.redo; }); } },
              { label: t.redo, shortcut: 'Ctrl+Y', onClick: () => { import('./components/Editor.svelte').then(m => { m.redo(); }); } },
              { separator: true }
            ]
          : []),
        ...(hasSelection ? [{ label: t.copy, onClick: () => {
          const sel = window.getSelection()?.toString();
          if (sel) invoke('clipboard_write_text', { text: sel });
        } }] : []),
        { label: t.selectAll, onClick: () => {
          if (!markdownBody) return;
          const range = document.createRange();
          range.selectNodeContents(markdownBody);
          const sel = window.getSelection();
          sel?.removeAllRanges();
          sel?.addRange(range);
        } },
        { separator: true },
        { label: t.openInFolder, onClick: openFileLocation, disabled: !currentFile },
        { label: t.editFile, onClick: () => toggleEdit() },
        { separator: true },
        { label: t.closeFile, onClick: closeFile },
      ],
    };
  }

  function handleMouseOver(event: MouseEvent) {
    if (mode !== 'app') return;
    let target = event.target as HTMLElement;
    while (target && target.tagName !== 'A' && target !== document.body) target = target.parentElement as HTMLElement;
    if (target?.tagName === 'A') {
      const anchor = target as HTMLAnchorElement;
      if (anchor.href) {
        const rect = anchor.getBoundingClientRect();
        tooltip = { show: true, text: anchor.href, x: rect.left + rect.width / 2, y: rect.top - 8 };
      }
    }
  }

  function handleMouseOut(event: MouseEvent) {
    let target = event.target as HTMLElement;
    while (target && target.tagName !== 'A' && target !== document.body) target = target.parentElement as HTMLElement;
    if (target?.tagName === 'A') tooltip.show = false;
  }

  // Upstream: handle link/heading/callout/zoom clicks inside markdown body
  function handleLinkClick(e: MouseEvent) {
    const target = e.target as HTMLElement;

    // task checkbox toggle in read mode
    if (target.tagName === 'INPUT' && (target as HTMLInputElement).type === 'checkbox' && target.hasAttribute('data-task-checkbox')) {
      e.preventDefault();
      e.stopPropagation();
      toggleTaskCheckbox(target as HTMLInputElement);
      return;
    }

    // header fold toggle
    const foldIcon = target.closest('.header-fold-icon');
    const foldableHeader = foldIcon ? foldIcon.closest('.foldable-header') as HTMLElement : null;
    if (foldableHeader) {
      if (e.detail > 1) e.preventDefault(); // prevent double-click selection
      e.stopPropagation();
      const key = foldableHeader.id || foldableHeader.textContent?.trim() || '';
      const wrapId = foldableHeader.getAttribute('data-fold-target');
      const wrapper = wrapId ? document.getElementById(wrapId) : null;
      if (wrapper) {
        const isCollapsed = foldableHeader.classList.toggle('is-collapsed');
        wrapper.classList.toggle('is-collapsed', isCollapsed);
        if (isCollapsed) {
          collapsedHeaders = new Set([...collapsedHeaders, key]);
        } else {
          const next = new Set(collapsedHeaders);
          next.delete(key);
          collapsedHeaders = next;
        }
      }
      return;
    }

    // callout fold toggle
    const calloutToggle = target.closest('.callout-toggle');
    if (calloutToggle) {
      if (e.detail > 1) e.preventDefault();
      e.stopPropagation();
      const alert = calloutToggle.closest('.callout-foldable');
      const content = alert?.querySelector('.markdown-alert-content');
      if (alert && content) {
        alert.classList.toggle('is-collapsed');
        content.classList.toggle('is-collapsed');
      }
      return;
    }

    // internal link navigation
    const a = target.closest('a');
    if (a) {
      const href = a.getAttribute('href');
      if (href?.startsWith('#') && href.length > 1) {
        e.preventDefault();
        let id = href.substring(1);
        if (id.startsWith('^')) id = id.substring(1);
        const el =
          (markdownBody?.querySelector(`[id="${CSS.escape(id)}"]`) as HTMLElement | null) ||
          (markdownBody?.querySelector(`[name="${CSS.escape(id)}"]`) as HTMLElement | null);
        if (el && markdownBody) {
          // Use offsetTop (layout coords, unaffected by CSS zoom)
          const targetScrollTop = el.offsetTop - 60;
          markdownBody.scrollTo({ top: targetScrollTop, behavior: 'smooth' });
        }
      }
    }

    // media zoom handling — open lightbox on click
    const img = target.closest('img');
    if (img && !target.closest('.img-lightbox-btn')) {
      const src = img.getAttribute('src');
      if (src) {
        const idx = viewableItems.findIndex(v => v.type === 'img' && v.src === src);
        lightboxIndex = idx >= 0 ? idx : -1;
        if (idx < 0) {
          // Fallback: single-item lightbox
          viewableItems = [{ type: 'img', src }];
          lightboxIndex = 0;
        }
      }
      return;
    }

    const mermaidDiv = target.closest('.mermaid-diagram');
    if (mermaidDiv) {
      const svg = mermaidDiv.querySelector('svg');
      if (svg) {
        const html = svg.outerHTML;
        const idx = viewableItems.findIndex(v => v.type === 'svg' && v.html === html);
        if (idx >= 0) {
          lightboxIndex = idx;
        } else {
          viewableItems = [{ type: 'svg', html }];
          lightboxIndex = 0;
        }
      }
      return;
    }

    const diagramWrapper = target.closest('.diagram-wrapper');
    if (diagramWrapper && !target.closest('.img-lightbox-btn') && !target.closest('.diagram-toggle-btn')) {
      const svg = diagramWrapper.querySelector('svg');
      if (svg) {
        const html = svg.outerHTML;
        const idx = viewableItems.findIndex(v => v.type === 'svg' && v.html === html);
        if (idx >= 0) {
          lightboxIndex = idx;
        } else {
          viewableItems = [{ type: 'svg', html }];
          lightboxIndex = 0;
        }
      }
      return;
    }
  }

  async function handleDocumentClick(event: MouseEvent) {
    if (mode !== 'app') return;
    let target = event.target as HTMLElement;
    while (target && target.tagName !== 'A' && target !== document.body) target = target.parentElement as HTMLElement;
    if (target?.tagName === 'A') {
      const anchor = target as HTMLAnchorElement;
      const rawHref = anchor.getAttribute('href');
      if (!rawHref) return;

      if (rawHref.startsWith('#')) return;
      const isMarkdown = ['.md', '.markdown', '.mdown', '.mkd'].some((ext) => {
        const urlNoHash = rawHref.split('#')[0].split('?')[0];
        return urlNoHash.toLowerCase().endsWith(ext);
      });

      if (isMarkdown && !rawHref.match(/^[a-z]+:\/\//i)) {
        event.preventDefault();
        const urlNoHash = rawHref.split('#')[0].split('?')[0];
        const resolved = resolvePath(currentFile, urlNoHash);
        await loadMarkdown(resolved, { navigate: true });
        return;
      }

      if (anchor.href) {
        event.preventDefault();
        await openUrl(anchor.href);
      }
    }
  }

  let zoomLevel = $state(parseInt(localStorage.getItem('zoomLevel') || '100', 10));

  $effect(() => {
    localStorage.setItem('zoomLevel', String(zoomLevel));
  });

  function handleWheel(e: WheelEvent) {
    if (e.ctrlKey || e.metaKey) {
      if (e.deltaY < 0) {
        zoomLevel = Math.min(zoomLevel + 10, 500);
      } else {
        zoomLevel = Math.max(zoomLevel - 10, 25);
      }
    }
  }

  let debounceTimer: number;

  $effect(() => {
    const tab = tabManager.activeTab;
    if (tab && tab.isSplit && tab.rawContent !== undefined) {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        invoke('render_markdown', { content: tab.rawContent })
          .then((res) => {
            const response = res as MarkdownResponse;
            const processed = processMarkdownHtml(response.html, tab.path);
            tabManager.updateTabContent(tab.id, processed);
            metadata = response.metadata;
            tick().then(renderRichContent);
          })
          .catch(console.error);
      }, 300);
    }
  });

  async function toggleSplitView(tabId: string) {
    const tab = tabManager.tabs.find((t) => t.id === tabId);
    if (!tab) return;

    if (!tab.isSplit) {
      if (!tab.isEditing && !tab.rawContent && tab.path) {
        try {
          const content = (await invoke('read_file_content', { path: tab.path })) as string;
          tab.rawContent = content;
          tab.originalContent = content;
        } catch (e) {
          console.error('Failed to load raw content for split view', e);
        }
      }
      tabManager.setSplitEnabled(tab.id, true);
      if (liveMode) toggleLiveMode();
    } else {
      tab.isSplit = false;
    }
  }

  function handleKeyDown(e: KeyboardEvent) {
    if (mode !== 'app') return;

    const cmdOrCtrl = e.ctrlKey || e.metaKey;
    const key = e.key.toLowerCase();
    const code = e.code;

    const isSplit = tabManager.activeTab?.isSplit;

    if (cmdOrCtrl && key === 'w') {
      e.preventDefault();
      closeFile();
    }
    if (cmdOrCtrl && !e.shiftKey && key === 't') {
      e.preventDefault();
      tabManager.addHomeTab();
    }
    if (cmdOrCtrl && key === 'h') {
      e.preventDefault();
      if (tabManager.activeTabId) toggleSplitView(tabManager.activeTabId);
    }
    if (cmdOrCtrl && key === 'e') {
      e.preventDefault();
      if (!isSplit) toggleEdit(true);
    }
    if (cmdOrCtrl && key === 's') {
      if (isEditing || isSplit) {
        e.preventDefault();
        saveContent();
      }
    }

    if (cmdOrCtrl && e.shiftKey && key === 't') {
      e.preventDefault();
      handleUndoCloseTab();
    }
    if (cmdOrCtrl && code === 'Tab') {
      e.preventDefault();
      tabManager.cycleTab(e.shiftKey ? 'prev' : 'next');
    }
    if (cmdOrCtrl && (key === '=' || key === '+')) {
      e.preventDefault();
      zoomLevel = Math.min(zoomLevel + 10, 500);
    }
    if (cmdOrCtrl && key === '-') {
      e.preventDefault();
      zoomLevel = Math.max(zoomLevel - 10, 25);
    }
    if (cmdOrCtrl && key === '0') {
      e.preventDefault();
      zoomLevel = 100;
    }
    if (cmdOrCtrl && key === 'q') {
      e.preventDefault();
      appExit();
    }
  }

  function handleMouseUp(e: MouseEvent) {
    if (e.button === 3) {
      // Back: try scroll history first, then tab navigation
      e.preventDefault();
      if (scrollHistory.length > 0 && markdownBody) {
        scrollFuture.push(markdownBody.scrollTop);
        const pos = scrollHistory.pop()!;
        markdownBody.scrollTo({ top: pos, behavior: 'smooth' });
      } else if (tabManager.activeTabId) {
        const path = tabManager.goBack(tabManager.activeTabId);
        if (path) loadMarkdown(path, { skipTabManagement: true });
      }
    } else if (e.button === 4) {
      // Forward: try scroll future first, then tab navigation
      e.preventDefault();
      if (scrollFuture.length > 0 && markdownBody) {
        scrollHistory.push(markdownBody.scrollTop);
        const pos = scrollFuture.pop()!;
        markdownBody.scrollTo({ top: pos, behavior: 'smooth' });
      } else if (tabManager.activeTabId) {
        const path = tabManager.goForward(tabManager.activeTabId);
        if (path) loadMarkdown(path, { skipTabManagement: true });
      }
    }
  }

  async function handleUndoCloseTab() {
    const path = tabManager.popRecentlyClosed();
    if (path) {
      await loadMarkdown(path);
    }
  }

  async function handleDetach(tabId: string) {
    if (!(await canCloseTab(tabId))) return;
    const tab = tabManager.tabs.find((t) => t.id === tabId);
    if (!tab || !tab.path) return;

    const path = tab.path;
    tabManager.closeTab(tabId);

    const label = 'window-' + Date.now();
    const { WebviewWindow } = await import('@tauri-apps/api/webviewWindow');
    const webview = new WebviewWindow(label, {
      url: 'index.html?file=' + encodeURIComponent(path),
      title: 'Markpad - ' + path.split(/[/\\]/).pop(),
      width: 1000,
      height: 800,
    });
  }

  function startDrag(e: MouseEvent, tabId: string | null) {
    if (!tabId) return;
    e.preventDefault();
    const startX = e.clientX;
    const tab = tabManager.tabs.find((t) => t.id === tabId);
    if (!tab) return;

    const startRatio = tab.splitRatio ?? 0.5;
    const containerWidth = window.innerWidth;

    const onMove = (moveEvent: MouseEvent) => {
      const deltaX = moveEvent.clientX - startX;
      const deltaRatio = deltaX / containerWidth;
      tabManager.setSplitRatio(tabId, startRatio + deltaRatio);
    };

    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      document.body.style.cursor = '';
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    document.body.style.cursor = 'col-resize';
  }

  function getSplitTransition(node: Element, { isEditing, side }: { isEditing: boolean; side: 'left' | 'right' }) {
    let shouldAnimate = false;
    let x = 0;

    if (side === 'left') {
      if (!isEditing) {
        shouldAnimate = true;
        x = -50;
      }
    } else {
      if (isEditing) {
        shouldAnimate = true;
        x = 50;
      }
    }

    if (shouldAnimate) {
      return fly(node, { x, duration: 250 });
    }
    return { duration: 0 };
  }

  // Global diagram toggle handler - set up once
  let diagramToggleHandlerAdded = false;

  async function setupDiagramWrapper(container: HTMLElement, renderEl: HTMLElement | null, codeEl: HTMLElement, lang: string) {
    // Helper function to highlight code block
    const highlightCodeBlock = async (block: HTMLElement, language: string) => {
      const codeElement = block.querySelector('code') || block;
      if (!codeElement.textContent?.trim()) return;
      
      // Map diagram languages to syntax-compatible highlight languages
      const diagramHighlightMap: Record<string, string> = {
        'math': 'latex',
        'vegalite': 'json',
        'vega': 'json',
        'bpmn': 'xml',
        'excalidraw': 'json',
        'graphviz': 'dot',
        'c4plantuml': 'java',
      };
      const highlightLang = diagramHighlightMap[language] || language;
      
      // Try tree-sitter first
      const tsSuccess = await highlightCodeWithTreeSitter(codeElement as HTMLElement, highlightLang);
      
      // Fallback to hljs if tree-sitter failed
      if (!tsSuccess && hljs) {
        // Set language class for hljs
        codeElement.className = `language-${highlightLang}`;
        hljs.highlightElement(codeElement as HTMLElement);
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
          const diagramHighlightMap: Record<string, string> = {
            'math': 'latex',
            'vegalite': 'json',
            'vega': 'json',
            'bpmn': 'xml',
            'excalidraw': 'json',
            'graphviz': 'dot',
            'c4plantuml': 'java',
          };
          const highlightLang = diagramHighlightMap[lang] || lang;
          const codeEl = codeElement.querySelector('code') || codeElement;
          if (codeEl.textContent?.trim()) {
            const tsSuccess = await highlightCodeWithTreeSitter(codeEl as HTMLElement, highlightLang);
            if (!tsSuccess && hljs) {
              codeEl.className = `language-${highlightLang}`;
              hljs.highlightElement(codeEl as HTMLElement);
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

  onMount(() => {
    loadRecentFiles();

    window.addEventListener('error', (event) => {
      console.error('[Global Error]', event.error);
    });

    window.addEventListener('unhandledrejection', (event) => {
      console.error('[Unhandled Promise Rejection]', event.reason);
    });

    // @ts-ignore
    Promise.all([import('highlight.js'), import('katex'), import('katex/dist/contrib/auto-render'), import('mermaid')]).then(
      ([hljsModule, katexModule, autoRenderModule, mermaidModule]) => {
        hljs = hljsModule.default;
        katex = katexModule.default;
        renderMathInElement = autoRenderModule.default;
        mermaid = mermaidModule.default;
        mermaid.initialize({
          startOnLoad: false,
          theme: 'default',
          securityLevel: 'loose',
        });
        
        // Initialize tree-sitter supported languages
        initTreeSitterLanguages();
      },
    );

    let unlisteners: (() => void)[] = [];

    invoke('show_window').catch(console.error);

    const init = async () => {
      const { getCurrentWindow } = await import('@tauri-apps/api/window');
      const appWindow = getCurrentWindow();
      const appMode = (await invoke('get_app_mode')) as any;

      const urlParams = new URLSearchParams(window.location.search);
      const fileParam = urlParams.get('file');
      if (fileParam) {
        const decodedPath = decodeURIComponent(fileParam);
        await loadMarkdown(decodedPath);
      }

      unlisteners.push(
        await appWindow.onFocusChanged(({ payload: focused }) => {
          isFocused = focused;
        }),
      );
      unlisteners.push(
        await listen('file-changed', () => {
          if (liveMode && currentFile) loadMarkdown(currentFile);
        }),
      );

      unlisteners.push(
        await listen('file-path', (event) => {
          const filePath = event.payload as string;
          if (filePath) loadMarkdown(filePath);
        }),
      );
      unlisteners.push(
        await listen('menu-close-file', () => {
          closeFile();
        }),
      );
      unlisteners.push(
        await listen('menu-edit-file', () => {
          toggleEdit();
        }),
      );
      unlisteners.push(
        await listen('menu-tab-rename', async (event) => {
          const tabId = event.payload as string;
          const tab = tabManager.tabs.find((t) => t.id === tabId);
          if (!tab || !tab.path) return;

          const newName = window.prompt('Rename file:', tab.title);
          if (newName && newName !== tab.title) {
            const oldPath = tab.path;
            const newPath = oldPath.replace(/[/\\][^/\\]+$/, (m) => m.charAt(0) + newName);
            try {
              await invoke('rename_file', { oldPath, newPath });
              tabManager.renameTab(tabId, newPath);
              // Update recent files if needed
              recentFiles = recentFiles.map((f) => (f === oldPath ? newPath : f));
              localStorage.setItem('recent-files', JSON.stringify(recentFiles));
            } catch (e) {
              console.error('Failed to rename file', e);
              await askCustom(`Failed to rename file: ${e}`, { title: 'Error', kind: 'error' });
            }
          }
        }),
      );
      unlisteners.push(
        await listen('menu-tab-new', () => {
          tabManager.addNewTab();
        }),
      );
      unlisteners.push(
        await listen('menu-tab-undo', () => {
          console.log('Received menu-tab-undo event');
          handleUndoCloseTab();
        }),
      );
      unlisteners.push(
        await listen('menu-tab-close', async (event) => {
          const tabId = event.payload as string;
          if (await canCloseTab(tabId)) {
            tabManager.closeTab(tabId);
          }
        }),
      );
      unlisteners.push(
        await listen('menu-tab-close-others', (event) => {
          const tabId = event.payload as string;
          const tabsToClose = tabManager.tabs.filter((t) => t.id !== tabId).map((t) => t.id);
          tabsToClose.forEach((id) => tabManager.closeTab(id));
        }),
      );
      unlisteners.push(
        await listen('menu-tab-close-right', (event) => {
          const tabId = event.payload as string;
          const index = tabManager.tabs.findIndex((t) => t.id === tabId);
          if (index !== -1) {
            const tabsToClose = tabManager.tabs.slice(index + 1).map((t) => t.id);
            tabsToClose.forEach((id) => tabManager.closeTab(id));
          }
        }),
      );
      unlisteners.push(
        await appWindow.onCloseRequested(async (event) => {
          if (isForceExiting) return;
          const dirtyTabs = tabManager.tabs.filter((t) => t.isDirty);
          if (dirtyTabs.length > 0) {
            console.log('Preventing default close');
            event.preventDefault();
            const response = await askCustom(`You have ${dirtyTabs.length} unsaved file(s). Do you want to save your changes?`, {
              title: 'Unsaved Changes',
              kind: 'warning',
              showSave: true,
            });

            if (response === 'save') {
              // Attempt to save all dirty tabs
              for (const tab of dirtyTabs) {
                tabManager.setActive(tab.id);
                await tick();
                const saved = await saveContent();
                if (!saved) return; // Cancelled or failed
              }
              // If all saved successfully, close the app
              appWindow.close();
            } else if (response === 'discard') {
              // Force close by removing this listener or skipping check?
              // Since we are inside the event handler, we can't easily remove "this" listener specifically
              // without refactoring how unlisteners are stored/accessed relative to this callback.
              // However, if we just want to exit, we can use exit() from rust or just appWindow.destroy()?
              // WebviewWindow.close() triggers this event again.
              // Solution: invoke a command to exit forcefully or set a flag.
              // The simplest might be to just clear the dirty flags and close.
              tabManager.tabs.forEach((t) => (t.isDirty = false));
              appWindow.close();
            }
          }
        }),
      );

      unlisteners.push(
        await appWindow.onDragDropEvent((event) => {
          if (isEditing) {
            isDragging = false;
            dragTarget = null;
            return;
          }

          if (event.payload.type === 'enter' || event.payload.type === 'over') {
            isDragging = true;
            const { position } = event.payload;
            const x = position?.x ?? 0;
            const y = position?.y ?? 0;

            if (viewerPaneEl) {
              const vRect = viewerPaneEl.getBoundingClientRect();
              if (x >= vRect.left && x <= vRect.right && y >= vRect.top && y <= vRect.bottom) {
                dragTarget = 'preview';
              } else {
                dragTarget = null;
              }
            }
          } else if (event.payload.type === 'drop') {
            isDragging = false;
            dragTarget = null;
            event.payload.paths.forEach((path) => {
              const ext = path.split('.').pop()?.toLowerCase();
              if (ext && ['md', 'markdown', 'txt'].includes(ext)) {
                loadMarkdown(path);
              }
            });
          } else {
            isDragging = false;
            dragTarget = null;
          }
        }),
      );

      try {
        const args: string[] = await invoke('send_markdown_path');
        if (args?.length > 0) {
          await loadMarkdown(args[0]);
        }
      } catch (error) {
        console.error('Error receiving Markdown file path:', error);
      }

      mode = appMode;
    };

    init();

    return () => {
      unlisteners.forEach((u) => u());
    };
  });
</script>

<svelte:document
  onclick={handleDocumentClick}
  oncontextmenu={handleContextMenu}
  onmouseover={handleMouseOver}
  onmouseout={handleMouseOut}
  onkeydown={handleKeyDown}
  onmouseup={handleMouseUp} />

{#if mode === 'loading'}
  <TitleBar
    {isFocused}
    isScrolled={false}
    currentFile={''}
    {liveMode}
    windowTitle="Markpad"
    showHome={false}
    {zoomLevel}
    onselectFile={selectFile}
    onnewFile={handleNewFile}
    onopenFile={selectFile}
    onsaveFile={saveContent}
    onsaveFileAs={saveContentAs}
    onexit={appExit}
    ontoggleHome={toggleHome}
    ononpenFileLocation={openFileLocation}
    ontoggleLiveMode={toggleLiveMode}
    ontoggleEdit={() => toggleEdit()}
    ontoggleSplit={() => tabManager.activeTabId && toggleSplitView(tabManager.activeTabId)}
    {isEditing}
    ondetach={handleDetach}
    ontabclick={() => (showHome = false)}
    onresetZoom={() => (zoomLevel = 100)}
    {isFullWidth}
    ontoggleFullWidth={() => (isFullWidth = !isFullWidth)}
    onopenSettings={() => (showSettings = true)}
    onexport={() => (showExportModal = true)}
    oncloseTab={(id) => {
      canCloseTab(id).then((can) => {
        if (can) tabManager.closeTab(id);
      });
    }} />
  <div class="loading-screen">
    <svg class="spinner" viewBox="0 0 50 50">
      <circle class="path" cx="25" cy="25" r="20" fill="none" stroke-width="4"></circle>
    </svg>
  </div>
{:else if mode === 'installer'}
  <Installer />
{:else if mode === 'uninstall'}
  <Uninstaller />
{:else}
  <TitleBar
    {isFocused}
    {isScrolled}
    {currentFile}
    {liveMode}
    {windowTitle}
    {showHome}
    {zoomLevel}
    onselectFile={selectFile}
    onnewFile={handleNewFile}
    onopenFile={selectFile}
    onsaveFile={saveContent}
    onsaveFileAs={saveContentAs}
    onexit={appExit}
    ontoggleHome={toggleHome}
    ononpenFileLocation={openFileLocation}
    ontoggleLiveMode={toggleLiveMode}
    ontoggleEdit={() => toggleEdit()}
    ontoggleSplit={() => tabManager.activeTabId && toggleSplitView(tabManager.activeTabId)}
    {isEditing}
    ondetach={handleDetach}
    ontabclick={() => (showHome = false)}
    onresetZoom={() => (zoomLevel = 100)}
    {isFullWidth}
    ontoggleFullWidth={() => (isFullWidth = !isFullWidth)}
    onopenSettings={() => (showSettings = true)}
    onexport={() => (showExportModal = true)}
    oncloseTab={(id) => {
      canCloseTab(id).then((can) => {
        if (can) tabManager.closeTab(id);
      });
    }}
    {isScrollSynced}
    ontoggleSync={() => tabManager.activeTabId && tabManager.toggleScrollSync(tabManager.activeTabId)}
    ontoggleMetadata={() => (showMetadata = !showMetadata)}
    {showMetadata}
    hasMetadata={!!metadata}
    ontoggleToc={() => settings.toggleToc()}
    showToc={settings.showToc} />

  {#if tabManager.activeTab && (tabManager.activeTab.path !== '' || tabManager.activeTab.title !== 'Recents') && !showHome}
  {#key tabManager.activeTabId}
  <div class="markdown-container" style="zoom: {isEditing && !isSplit ? 1 : zoomLevel / 100}" onwheel={handleWheel} role="presentation">
  <div class="layout-container" class:split={isSplit} class:editing={isEditing} class:has-pinned-toc={settings.pinnedToc && settings.showToc} class:toc-on-left={settings.tocSide === 'left'} class:toc-on-right={settings.tocSide === 'right'}>

  <!-- Editor Pane -->
          <div class="pane editor-pane" class:active={isEditing || isSplit} style="flex: {isSplit ? tabManager.activeTab.splitRatio : isEditing ? 1 : 0}">
            {#if isEditing || isSplit}
              <Editor
                bind:this={editorPane}
                bind:value={tabManager.activeTab.rawContent}
                language={editorLanguage}
                onsave={saveContent}
                bind:zoomLevel
                onnew={handleNewFile}
                onopen={selectFile}
                onclose={closeFile}
                onreveal={openFileLocation}
                ontoggleEdit={() => toggleEdit()}
                ontoggleLive={toggleLiveMode}
                ontoggleSplit={() => tabManager.activeTabId && toggleSplitView(tabManager.activeTabId)}
                onhome={() => (showHome = true)}
                onnextTab={() => tabManager.cycleTab('next')}
                onprevTab={() => tabManager.cycleTab('prev')}
                onundoClose={handleUndoCloseTab}
                onscrollsync={handleEditorScrollSync} />
            {/if}
          </div>

          <!-- Splitter -->
          {#if isSplit}
            <!-- svelte-ignore a11y_no_noninteractive_element_interactions a11y_no_noninteractive_tabindex -->
            <div class="split-bar" onmousedown={(e) => startDrag(e, tabManager.activeTabId)} onkeydown={handleSplitterKeyDown} role="separator" aria-orientation="vertical" tabindex="0"></div>
          {/if}

          <!-- Viewer Pane -->
          <div bind:this={viewerPaneEl} bind:clientWidth={viewerWidth} class="pane viewer-pane" class:active={!isEditing || isSplit} style="flex: {isSplit ? 1 - tabManager.activeTab.splitRatio : !isEditing ? 1 : 0}">
          <div class="viewer-content">
            <article bind:this={markdownBody} contenteditable="false" class="markdown-body" class:full-width={isFullWidth} onscroll={handleScroll} onclick={handleLinkClick} tabindex="-1" style="outline: none;"></article>
                {#if tabManager.activeTabId && loadingTabs.includes(tabManager.activeTabId) && isAtBottom}
                  <div class="loading-chip" transition:fly={{ y: 20, duration: 300, easing: cubicOut }}>
                    <div class="loading-spinner"></div>
                    <span>Loading full document...</span>
                  </div>
                {/if}
              </div>
            </div>

            <!-- Upstream: Floating TOC Support -->
            <button
              class="toc-toggle-floating {settings.showToc ? 'expanded' : ''}"
              class:on-right={settings.tocSide === 'right'}
              class:in-edit-mode={isEditing && !settings.showToc}
              onclick={() => settings.toggleToc()}
              aria-label={settings.showToc ? 'Hide table of contents' : 'Show table of contents'}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="9 18 15 12 9 6"></polyline>
              </svg>
            </button>

            {#if settings.showToc}
              <div
                transition:fly={{ x: settings.tocSide === 'left' ? -240 : 240, duration: 300, opacity: 1, easing: cubicOut }}
                class="toc-overlay-wrapper"
                class:is-overhanging={isOverhanging}
                class:is-pinned={settings.pinnedToc}
                class:on-right={settings.tocSide === 'right'}>
                <Toc
                  {markdownBody}
                  htmlContent={htmlContent}
                  {collapsedHeaders}
                  ontoggleFold={toggleFold}
                  onBeforeJump={pushScrollHistory}
                  onjump={(id: string, text: string) => {
                    if (isEditing && editorPane) {
                      editorPane.revealHeader(text);
                    }
                  }}
                  oncopyref={(text: string) => {
                    invoke('clipboard_write_text', { text: `#${text}` });
                  }}
                  oncontext={(e: MouseEvent, item: { text: string }) => {
                    e.preventDefault();
                    invoke('clipboard_write_text', { text: `#${item.text}` });
                  }} />
              </div>
            {/if}
          </div>
        
        {#if showMetadata && metadata}
          <div class="metadata-popup" transition:fly={{ y: -10, duration: 200 }}>
            <div class="metadata-content">
              {#if hljs}
                <pre><code class="language-yaml">{@html hljs.highlight(metadata, { language: 'yaml' }).value}</code></pre>
              {:else}
                <pre>{metadata}</pre>
              {/if}
            </div>
          </div>
        {/if}
      </div>
    {/key}
  {:else}
    <HomePage {recentFiles} onselectFile={selectFile} onloadFile={loadMarkdown} onremoveRecentFile={removeRecentFile} onnewFile={handleNewFile} />
  {/if}

  {#if isDragging && !isEditing}
    <div class="drag-overlay" role="presentation">
      <div class="drag-zones">
        <div class="drag-zone viewer-zone" class:active={dragTarget === 'preview'}>
          <div class="drag-message">
            <span>Drop to open file</span>
          </div>
        </div>
      </div>
    </div>
  {/if}

  {#if tooltip.show}
    <div class="tooltip" style="left: {tooltip.x}px; top: {tooltip.y}px;">
      {tooltip.text}
    </div>
  {/if}

  <Modal
    show={modalState.show}
    title={modalState.title}
    message={modalState.message}
    kind={modalState.kind}
    showSave={modalState.showSave}
    onconfirm={handleModalConfirm}
    onsave={handleModalSave}
    oncancel={handleModalCancel} />

  <ExportModal
    show={showExportModal}
    onexport={handleExport}
    oncancel={() => (showExportModal = false)} />

  {#if exportMessage.show}
    <div class="export-message">
      <span>{exportMessage.text}</span>
      <button class="close-btn" onclick={() => { exportMessage = { show: false, text: '' }; }}>×</button>
    </div>
  {/if}

  {#if isDragging && !isEditing}
    <div class="drag-overlay" role="presentation">
      <div class="drag-message">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="48"
          height="48"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <polyline points="17 8 12 3 7 8" />
          <line x1="12" y1="3" x2="12" y2="15" />
        </svg>
        <span>Drop to open Markdown files</span>
      </div>
    </div>
  {/if}
{/if}

{#if showSettings}
<Settings show={showSettings} onclose={() => (showSettings = false)} />
{/if}

  <!-- Upstream: Toast notifications -->
  <div class="toast-container">
    {#each toasts as toast (toast.id)}
      <Toast
        message={toast.message}
        type={toast.type}
        onremove={() => toasts = toasts.filter(t => t.id !== toast.id)} />
    {/each}
  </div>

  <!-- Upstream: Lightbox overlay for images/diagrams -->
  {#if lightboxIndex >= 0 && viewableItems.length > 0}
    <ZoomOverlay
      items={viewableItems}
      initialIndex={lightboxIndex}
      onclose={() => lightboxIndex = -1} />
  {/if}

  <!-- Upstream: Context menu -->
  <ContextMenu {...docContextMenu} onhide={() => (docContextMenu.show = false)} />

  <style>
  :root {
    --animation: cubic-bezier(0.05, 0.95, 0.05, 0.95);
    scroll-behavior: smooth !important;
    background-color: var(--color-canvas-default);
  }

  :global(body) {
    background-color: var(--color-canvas-default);
    margin: 0;
    padding: 0;
    color: var(--color-fg-default);
    overflow: hidden;
  }

  .markdown-body {
    box-sizing: border-box;
    min-width: 200px;
    margin: 0;
    padding: 50px clamp(calc(calc(50% - 390px)), 5vw, 50px);
    height: 100%;
    overflow-y: auto;
    transform: translate3d(0, 0, 0); /* Create stacking context */
  }

  .markdown-body.full-width {
    padding: 50px clamp(calc(calc(50% - 550px)), 5vw, 80px);
    max-width: 100%;
  }

  .caret-indicator {
    position: absolute;
    height: 2px;
    background-color: #0078d4;
    width: 100%;
    left: 0;
    right: 0;
    pointer-events: none;
    z-index: 100;
    opacity: 0.8;
    transform: translateY(2px); /* visual adjustment */
  }

  /* Disable animation in split view to prevent jumpiness */
  .split-view .markdown-body {
    animation: none;
  }

  @keyframes slideIn {
    from {
      opacity: 0;
      transform: translateY(12px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  :global(.video-container) {
    position: relative;
    padding-bottom: 56.25%;
    height: 0;
    overflow: hidden;
    max-width: 100%;
    margin: 1em 0;
  }

  :global(.video-container iframe) {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    border-radius: 8px;
  }

  .tooltip {
    position: fixed;
    background: var(--color-canvas-default);
    color: var(--color-fg-default);
    padding: 6px 10px;
    border-radius: 4px;
    font-size: 12px;
    pointer-events: none;
    z-index: 10000;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.15);
    border: 1px solid var(--color-border-default);
    font-family: var(--win-font);
    white-space: nowrap;
    max-width: 400px;
    overflow: hidden;
    text-overflow: ellipsis;
    transform: translate(-50%, -100%);
    transition: opacity 0.15s ease-out;
    opacity: 1;
  }

  .tooltip::after {
    content: '';
    position: absolute;
    bottom: -6px;
    left: 50%;
    transform: translateX(-50%);
    border-left: 6px solid transparent;
    border-right: 6px solid transparent;
    border-top: 6px solid var(--color-canvas-default);
  }

  .editor-wrapper {
    width: 100%;
    height: 100%;
    position: absolute;
    top: 0;
    left: 0;
    padding-top: 36px;
    box-sizing: border-box;
  }

  .export-message {
    position: fixed;
    bottom: 24px;
    right: 24px;
    background: var(--color-canvas-default);
    border: 1px solid var(--color-border-default);
    border-radius: 8px;
    padding: 12px 16px;
    display: flex;
    align-items: center;
    gap: 12px;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.15);
    z-index: 50000;
    max-width: 400px;
    font-size: 14px;
    color: var(--color-fg-default);
    animation: slideIn 0.3s ease-out;
  }

  .export-message .close-btn {
    background: transparent;
    border: none;
    font-size: 18px;
    color: var(--color-fg-muted);
    cursor: pointer;
    padding: 0 4px;
    line-height: 1;
  }

  .export-message .close-btn:hover {
    color: var(--color-fg-default);
  }

  @keyframes slideIn {
    from {
      opacity: 0;
      transform: translateX(20px);
    }
    to {
      opacity: 1;
      transform: translateX(0);
    }
  }

  .drag-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 120, 212, 0.15);
    backdrop-filter: blur(4px);
    border: 3px dashed #0078d4;
    margin: 12px;
    border-radius: 12px;
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 40000;
    pointer-events: none;
    animation: fadeIn 0.15s ease-out;
  }

  .drag-message {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 16px;
    color: #0078d4;
    font-family: var(--win-font);
    font-weight: 500;
    font-size: 18px;
  }

  @keyframes fadeIn {
    from {
      opacity: 0;
      transform: scale(0.98);
    }
    to {
      opacity: 1;
      transform: scale(1);
    }
  }

  .loading-screen {
    position: fixed;
    top: 36px;
    left: 0;
    width: 100%;
    height: calc(100% - 36px);
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--color-canvas-default);
    z-index: 5000;
  }

  .spinner {
    animation: rotate 2s linear infinite;
    z-index: 2;
    width: 50px;
    height: 50px;
  }

  .spinner .path {
    stroke: var(--color-accent-fg);
    stroke-linecap: round;
    animation: dash 1.5s ease-in-out infinite;
  }

  @keyframes rotate {
    100% {
      transform: rotate(360deg);
    }
  }

  @keyframes dash {
    0% {
      stroke-dasharray: 1, 150;
      stroke-dashoffset: 0;
    }
    50% {
      stroke-dasharray: 90, 150;
      stroke-dashoffset: -35;
    }
    100% {
      stroke-dasharray: 90, 150;
      stroke-dashoffset: -124;
    }
  }
  /* Layout System */
  .layout-container {
    display: flex;
    width: 100%;
    height: 100%;
    position: absolute;
    top: 0;
    left: 0;
    padding-top: 36px;
    box-sizing: border-box;
    overflow: hidden;
  }

  .pane {
    display: flex;
    flex-direction: column;
    overflow: hidden;
    transition:
      flex 0.3s cubic-bezier(0.16, 1, 0.3, 1),
      transform 0.3s cubic-bezier(0.16, 1, 0.3, 1);
    min-width: 0;
  }

  .pane.editor-pane {
    background: var(--color-canvas-default);
  }

  .pane.viewer-pane {
    background: var(--color-canvas-default);
  }

  /* View Mode */
  .layout-container:not(.split):not(.editing) .editor-pane {
    width: 0 !important;
    flex: 0 !important;
    opacity: 0;
  }

  .layout-container:not(.split):not(.editing) .viewer-pane {
    width: 100%;
    flex: 1 !important;
  }

  /* Edit Mode */
  .layout-container:not(.split).editing .editor-pane {
    width: 100%;
    flex: 1 !important;
  }

  .layout-container:not(.split).editing .viewer-pane {
    width: 0 !important;
    flex: 0 !important;
    opacity: 0;
  }

  /* Split Mode Transition Logic */
  /* Editor slides in from left */
  /* Viewer slides right */

  .pane {
    height: 100%;
    position: relative;
  }

  .split-bar {
    width: 4px;
    background: var(--color-border-default);
    cursor: col-resize;
    position: relative;
    z-index: 100;
    transition: background 0.2s;
  }

  .split-bar:hover {
    background: var(--color-accent-fg);
  }

  .editor-wrapper {
    /* Legacy mapping */
    width: 100%;
    height: 100%;
  }

  .metadata-popup {
    position: absolute;
    top: 48px;
    right: 24px;
    width: 400px;
    max-height: 400px;
    background: var(--color-canvas-overlay, var(--color-canvas-default));
    border: 1px solid var(--color-border-default);
    border-radius: 8px;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.2);
    z-index: 1000;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .metadata-content {
    padding: 16px;
    overflow-y: auto;
    font-family: 'JetBrains Mono', 'Fira Code', monospace;
    font-size: 13px;
  }

  .metadata-content pre {
    margin: 0;
    white-space: pre-wrap;
  }

  .toc-sidebar {
    width: 240px;
    flex: 0 0 240px !important;
    border-right: 1px solid var(--color-border-default);
    background: var(--color-canvas-subtle);
    display: flex;
    flex-direction: column;
    padding: 20px 0;
    z-index: 10;
    overflow-y: auto !important;
    overflow-x: hidden !important;
  }

  .toc-title {
    font-size: 11px;
    font-weight: 600;
    color: var(--color-fg-muted);
    padding: 0 20px 12px;
    letter-spacing: 0.05em;
    flex-shrink: 0;
  }

  .toc-list {
    overflow-y: auto;
    flex: 1 1 auto;
    min-height: 0;
  }

  .toc-item {
    padding: 6px 20px;
    font-size: 13px;
    color: var(--color-fg-muted);
    cursor: pointer;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    transition: all 0.1s;
  }

  .toc-item:hover {
    background: var(--color-canvas-default);
    color: var(--color-fg-default);
  }

  .toc-item.level-1 { font-weight: 600; }
  .toc-item.level-2 { padding-left: 32px; }
  .toc-item.level-3 { padding-left: 44px; }
  .toc-item.level-4 { padding-left: 56px; }
  .toc-item.level-5 { padding-left: 68px; }
  .toc-item.level-6 { padding-left: 80px; }

  /* Upstream: Loading chip for large file progressive loading */
  .loading-chip {
    position: absolute;
    bottom: 30px;
    left: 50%;
    transform: translateX(-50%);
    background: var(--color-canvas-overlay);
    border: 1px solid var(--color-border-default);
    border-radius: 20px;
    padding: 8px 16px;
    display: flex;
    align-items: center;
    gap: 10px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    z-index: 100;
    color: var(--color-fg-muted);
    font-size: 13px;
  }

  .loading-spinner {
    width: 14px;
    height: 14px;
    border: 2px solid var(--color-border-muted);
    border-top-color: var(--color-accent-fg);
    border-radius: 50%;
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  /* Upstream: Viewer content wrapper */
  .viewer-content {
    position: relative;
    display: flex;
    flex-direction: column;
    height: 100%;
  }

  /* Upstream: Floating TOC overlay */
  .toc-overlay-wrapper {
    position: absolute;
    top: 0;
    left: 0;
    width: 240px;
    height: 100%;
    z-index: 50;
    background: var(--color-canvas-subtle);
    border-right: 1px solid var(--color-border-default);
    overflow-y: auto;
    padding-top: 36px;
    box-sizing: border-box;
  }

  .toc-overlay-wrapper.is-pinned {
    position: relative;
    flex-shrink: 0;
    padding-top: 0;
  }

  .toc-overlay-wrapper.on-right {
    left: auto;
    right: 0;
    border-right: none;
    border-left: 1px solid var(--color-border-default);
  }

  .toc-overlay-wrapper.is-pinned.on-right {
    border-left: 1px solid var(--color-border-default);
  }

  .toc-overlay-wrapper.is-pinned:not(.on-right) {
    border-right: 1px solid var(--color-border-default);
  }

  .toc-toggle-floating {
    position: absolute;
    top: 50%;
    left: 0;
    transform: translateY(-50%);
    width: 24px;
    height: 48px;
    background: var(--color-canvas-overlay);
    border: 1px solid var(--color-border-default);
    border-left: none;
    border-radius: 0 6px 6px 0;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 51;
    opacity: 0;
    transition: opacity 0.2s;
    color: var(--color-fg-muted);
  }

  .toc-toggle-floating.expanded {
    opacity: 1;
    left: 240px;
  }

  .toc-toggle-floating.on-right {
    left: auto;
    right: 0;
    border-left: 1px solid var(--color-border-default);
    border-right: none;
    border-radius: 6px 0 0 6px;
  }

  .toc-toggle-floating.on-right.expanded {
    right: 240px;
  }

  .layout-container:hover .toc-toggle-floating,
  .toc-toggle-floating:hover {
    opacity: 1;
  }

  .toc-toggle-floating:active {
    background: var(--color-canvas-default);
  }

  .toc-toggle-floating svg {
    transition: transform 0.2s;
  }

  .toc-toggle-floating.on-right svg {
    transform: rotate(180deg);
  }

  .toc-toggle-floating.expanded svg {
    transform: rotate(180deg);
  }

  .toc-toggle-floating.on-right.expanded svg {
    transform: rotate(0deg);
  }

  .toc-toggle-floating.in-edit-mode:not(.expanded) {
    opacity: 0.4;
  }

  /* Upstream: Toast container */
  .toast-container {
    position: fixed;
    bottom: 20px;
    right: 20px;
    z-index: 1000;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  /* Upstream: Layout adjustments for pinned TOC */
  .layout-container.has-pinned-toc {
    display: flex;
  }

  .layout-container.toc-on-left .toc-overlay-wrapper.is-pinned {
    order: -1;
  }

  .layout-container.editing .toc-overlay-wrapper:not(.on-right) {
    left: 0;
  }

  .layout-container.editing .toc-overlay-wrapper.on-right {
    right: 0;
  }

  .drag-overlay {
    position: fixed;
    inset: 0;
    z-index: 9999;
    pointer-events: none;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(0, 0, 0, 0.1);
  }

  .drag-zones {
    display: flex;
    gap: 16px;
    width: 80%;
    max-width: 600px;
  }

  .drag-zone {
    flex: 1;
    padding: 40px 20px;
    border: 2px dashed var(--color-border-muted);
    border-radius: 12px;
    text-align: center;
    transition: all 0.2s ease;
    opacity: 0.5;
  }

  .drag-zone.active {
    opacity: 1;
    border-color: var(--color-accent-fg);
    background: var(--color-accent-subtle);
  }

  .drag-message {
    color: var(--color-fg-muted);
    font-size: 14px;
  }

  .drag-zone.active .drag-message {
    color: var(--color-fg-default);
  }
</style>
