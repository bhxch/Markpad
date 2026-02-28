# Upstream Merge Report

**Date**: 2026-03-01  
**Merge Commit**: 36df8f6  
**Upstream Repository**: https://github.com/alecdotdev/Markpad  
**Upstream Commit**: d976b82 (master)  
**Fork Point**: d0781f4

## Overview

This report documents the merge of upstream changes from alecdotdev/Markpad into our fork. The merge was performed to integrate new features from the original project while preserving our custom implementations.

## Branch Divergence

### Fork Point
The fork diverged from upstream at commit `d0781f4`.

### Upstream Changes (45 commits)
From the fork point to upstream/master, the following major features were added:

| Feature | Description | PR/Issue |
|---------|-------------|----------|
| Settings Page | Font customization for editor and preview | #62 |
| Vim Mode | Toggle for vim-style keybindings | #31 |
| Zen Mode | Distraction-free editing mode | #57 |
| Full-width Toggle | Expand preview to full width | #29 |
| Custom Context Menu | Custom right-click menu | #59 |
| Zoom Level Persistence | Remember zoom between launches | #58 |
| Linux WebKit Fixes | Wayland environment variable workarounds | #55 |
| Snap/Choco Packages | Linux Snap and Windows Chocolateo packaging | #63 |
| Mermaid Security | DOMPurify sanitization for SVG foreignObject | #27 |
| Window Focus | Fix focus on open from terminal | #44 |
| Auto-reload | Renamed from "Watcher mode" | #40 |
| Multimedia Embed | Video/audio embedding support | #46 |
| YouTube Embed | YouTube video embedding | #47 |
| GFM Alerts | GitHub-style alert blocks | - |

### Our Changes (31 commits)
Our fork includes these custom features:

| Feature | Description |
|---------|-------------|
| Tree-sitter Highlighting | 264 language grammars with lazy loading |
| Kroki Diagram Support | Extended diagram types via Kroki API |
| TOC Sidebar | Table of contents navigation |
| Custom Theme System | Multiple color themes (GitHub, One Dark, Monokai, Nord, Solarized, Vue) |
| Code Theme Toggle | Separate theme for code highlighting |
| Metadata Display | Frontmatter extraction and display |
| Customizable Toolbar | Drag-and-drop toolbar customization |
| Query Embedding | Embedded query files for single-exe distribution |

## Conflict Resolution

### Files with Conflicts (10 files)

| File | Resolution Strategy |
|------|---------------------|
| `.gitignore` | Merged both additions |
| `package.json` | Kept both `pako` and `monaco-vim` dependencies |
| `package-lock.json` | Regenerated via `npm install` |
| `src-tauri/Cargo.lock` | Accepted upstream version |
| `src-tauri/src/lib.rs` | Preserved tree-sitter commands, added upstream's `save_theme` and `get_system_fonts` |
| `src/lib/MarkdownViewer.svelte` | **Properly merged** - Integrated upstream's settings, multimedia embeds, DOMPurify, zoom persistence while preserving tree-sitter and Kroki |
| `src/lib/components/Tab.svelte` | Kept our active tab underline style |
| `src/lib/components/TitleBar.svelte` | **Properly merged** - Added upstream's props (newFile, openFile, saveFile, saveFileAs, exit, fullWidth, settings) while preserving customizable toolbar |
| `src/lib/stores/settings.svelte.ts` | Merged both feature sets |
| `src/styles.css` | Auto-merged (no conflicts after initial merge) |

### Key Decisions

1. **MarkdownViewer.svelte**: Properly integrated upstream features:
   - Added Settings component and `showSettings` state
   - Added `isFullWidth` state with localStorage persistence
   - Added multimedia embed support (video/audio via `<video>` tags)
   - Added DOMPurify sanitization for Mermaid SVG foreignObject
   - Added zoom level persistence to localStorage
   - Added `saveContentAs` function for Save As functionality
   - Added Ctrl+Q exit shortcut
   - Preserved tree-sitter highlighting and Kroki diagram support

2. **TitleBar.svelte**: Properly integrated upstream features:
   - Added props: `onnewFile`, `onopenFile`, `onsaveFile`, `onsaveFileAs`, `onexit`, `isFullWidth`, `ontoggleFullWidth`, `onopenSettings`
   - Added toolbar actions for full-width toggle and settings
   - Preserved customizable toolbar system with drag-and-drop reordering
   - Preserved theme cycling integration

3. **settings.svelte.ts**: Merged both feature sets:
   - Added upstream's vimMode, zenMode, statusBar, etc.
   - Preserved our themeScheme, codeTheme, toolbarLayout

## Upstream Features Integrated

The following upstream features have been successfully integrated:

| Feature | Status | Notes |
|---------|--------|-------|
| Settings.svelte | ✅ Integrated | Added Settings component with `showSettings` state, triggered from toolbar |
| Full-width Toggle | ✅ Integrated | Added `isFullWidth` state with localStorage persistence, accessible from toolbar |
| Multimedia Embed | ✅ Integrated | Video/audio embedding via `<video>` tags in processMarkdownHtml |
| Mermaid Security | ✅ Integrated | DOMPurify sanitization for SVG foreignObject |
| Zoom Persistence | ✅ Integrated | Zoom level saved to localStorage |
| Save As | ✅ Integrated | Added `saveContentAs` function and toolbar actions |
| Exit Shortcut | ✅ Integrated | Ctrl+Q closes the window |
| Vim Mode | ⚠️ Partial | Settings exist, needs UI exposure in toolbar |
| Zen Mode | ⚠️ Partial | Settings exist, needs UI implementation |

## Verification

### Frontend Check
```
npm run check
```
Result: 0 errors, 3 warnings (a11y and CSS warnings only)

### Backend Check
```
cargo check
```
Result: Compiled successfully with 5 warnings (unused imports and dead code)

## Post-Merge Recommendations

1. **Test Settings Integration**: Verify Settings page works correctly with our theme system.

2. **Add Vim Mode UI**: The vim mode toggle exists in settings but needs UI exposure in our TitleBar for quick access.

3. **Implement Zen Mode**: Settings exist but the actual zen mode UI implementation needs to be added.

4. **Test Linux Compatibility**: Upstream added WebKit fixes for Linux Wayland - these should be verified on Linux systems.

5. **Remove Unused Code**: Clean up the warning about unused imports and dead code in the highlight module.

## Files Changed Summary

```
 new file:   .github/ISSUE_TEMPLATE/bug_report.md
 new file:   .github/ISSUE_TEMPLATE/feature_request.md
 modified:   .github/workflows/build.yml
 modified:   .gitignore
 deleted:    CHANGELOG.md
 modified:   README.md
 modified:   package-lock.json
 modified:   package.json
 new file:   packaging/choco/markpad.nuspec
 new file:   packaging/choco/tools/chocolateyInstall.ps1
 new file:   packaging/choco/tools/chocolateyUninstall.ps1
 new file:   snapcraft.yaml
 modified:   src-tauri/Cargo.lock
 modified:   src-tauri/Cargo.toml
 modified:   src-tauri/src/lib.rs
 modified:   src-tauri/tauri.conf.json
 modified:   src/app.html
 modified:   src/lib/Installer.svelte
 modified:   src/lib/MarkdownViewer.svelte
 modified:   src/lib/Uninstaller.svelte
 modified:   src/lib/components/ContextMenu.svelte
 modified:   src/lib/components/Editor.svelte
 modified:   src/lib/components/HomePage.svelte
 new file:   src/lib/components/Settings.svelte
 modified:   src/lib/components/Tab.svelte
 modified:   src/lib/components/TabList.svelte
 modified:   src/lib/stores/settings.svelte.ts
 modified:   src/styles.css
```

## Conclusion

The merge was completed successfully with all conflicts resolved. Our custom features (tree-sitter highlighting, Kroki diagrams, TOC sidebar, theme system, customizable toolbar) are preserved while gaining access to upstream's new features (settings page, vim mode, zen mode, etc.). Some additional integration work is recommended to fully leverage the merged features.
