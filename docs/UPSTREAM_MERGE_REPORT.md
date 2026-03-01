# 上游合并报告

**日期**: 2026-03-01  
**合并提交**: 36df8f6  
**上游仓库**: https://github.com/alecdotdev/Markpad  
**上游提交**: d976b82 (master)  
**分叉点**: d0781f4

## 概述

本文档记录了从 alecdotdev/Markpad 合并上游更改到我们 fork 的过程。合并旨在集成原始项目的新功能，同时保留我们的自定义实现。

## 分支差异

### 分叉点
我们的 fork 在提交 `d0781f4` 处与上游分叉。

### 上游更改 (45 个提交)
从分叉点到 upstream/master，添加了以下主要功能：

| 功能 | 描述 | PR/Issue |
|---------|-------------|----------|
| 设置页面 | 编辑器和预览的字体自定义 | #62 |
| Vim 模式 | vim 风格快捷键切换 | #31 |
| 禅模式 | 无干扰编辑模式 | #57 |
| 全宽切换 | 将预览扩展到全宽 | #29 |
| 自定义右键菜单 | 自定义右键菜单 | #59 |
| 缩放级别持久化 | 在启动之间记住缩放 | #58 |
| Linux WebKit 修复 | Wayland 环境变量变通方案 | #55 |
| Snap/Choco 包 | Linux Snap 和 Windows Chocolatey 打包 | #63 |
| Mermaid 安全 | SVG foreignObject 的 DOMPurify 清理 | #27 |
| 窗口焦点 | 修复从终端打开时的焦点问题 | #44 |
| 自动重载 | 从"监视模式"重命名 | #40 |
| 多媒体嵌入 | 视频/音频嵌入支持 | #46 |
| YouTube 嵌入 | YouTube 视频嵌入 | #47 |
| GFM 警告块 | GitHub 风格的警告块 | - |

### 我们的更改 (31 个提交)
我们的 fork 包含以下自定义功能：

| 功能 | 描述 |
|---------|-------------|
| Tree-sitter 语法高亮 | 264 种语言语法，支持延迟加载 |
| Kroki 图表支持 | 通过 Kroki API 扩展图表类型 |
| TOC 侧边栏 | 目录导航 |
| 自定义主题系统 | 多种配色主题 (GitHub, One Dark, Monokai, Nord, Solarized, Vue) |
| 代码主题切换 | 代码高亮的独立主题 |
| 元数据显示 | Frontmatter 提取和显示 |
| 可定制工具栏 | 拖放式工具栏自定义 |
| 查询文件嵌入 | 嵌入查询文件以实现单文件分发 |

## 冲突解决

### 冲突文件 (10 个文件)

| 文件 | 解决策略 |
|------|---------------------|
| `.gitignore` | 合并双方的添加 |
| `package.json` | 保留 `pako` 和 `monaco-vim` 依赖 |
| `package-lock.json` | 通过 `npm install` 重新生成 |
| `src-tauri/Cargo.lock` | 接受上游版本 |
| `src-tauri/src/lib.rs` | 保留 tree-sitter 命令，添加上游的 `save_theme` 和 `get_system_fonts` |
| `src/lib/MarkdownViewer.svelte` | **正确合并** - 集成了上游的设置、多媒体嵌入、DOMPurify、缩放持久化，同时保留 tree-sitter 和 Kroki |
| `src/lib/components/Tab.svelte` | 保留我们的活动标签下划线样式 |
| `src/lib/components/TitleBar.svelte` | **正确合并** - 添加上游的 props (newFile, openFile, saveFile, saveFileAs, exit, fullWidth, settings)，同时保留可定制工具栏 |
| `src/lib/stores/settings.svelte.ts` | 合并双方功能集 |
| `src/styles.css` | 自动合并（初始合并后无冲突） |

### 关键决策

1. **MarkdownViewer.svelte**: 正确集成了上游功能：
   - 添加 Settings 组件和 `showSettings` 状态
   - 添加 `isFullWidth` 状态，支持 localStorage 持久化
   - 添加多媒体嵌入支持（通过 `<video>` 标签嵌入视频/音频）
   - 添加 Mermaid SVG foreignObject 的 DOMPurify 清理
   - 添加缩放级别持久化到 localStorage
   - 添加 `saveContentAs` 函数实现另存为功能
   - 添加 Ctrl+Q 退出快捷键
   - 保留 tree-sitter 语法高亮和 Kroki 图表支持

2. **TitleBar.svelte**: 正确集成了上游功能：
   - 添加 props: `onnewFile`, `onopenFile`, `onsaveFile`, `onsaveFileAs`, `onexit`, `isFullWidth`, `ontoggleFullWidth`, `onopenSettings`
   - 添加全宽切换和设置的工具栏按钮
   - 保留可定制工具栏系统的拖放重排功能
   - 保留主题切换集成

3. **settings.svelte.ts**: 合并双方功能集：
   - 添加上游的 vimMode、zenMode、statusBar 等
   - 保留我们的 themeScheme、codeTheme、toolbarLayout

## 上游功能集成状态

以下上游功能已成功集成：

| 功能 | 状态 | 备注 |
|---------|--------|-------|
| Settings.svelte | ✅ 已集成 | 添加 Settings 组件和 `showSettings` 状态，从工具栏触发 |
| 全宽切换 | ✅ 已集成 | 添加 `isFullWidth` 状态，支持 localStorage 持久化，可从工具栏访问 |
| 多媒体嵌入 | ✅ 已集成 | 通过 processMarkdownHtml 中的 `<video>` 标签嵌入视频/音频 |
| Mermaid 安全 | ✅ 已集成 | SVG foreignObject 的 DOMPurify 清理 |
| 缩放持久化 | ✅ 已集成 | 缩放级别保存到 localStorage |
| 另存为 | ✅ 已集成 | 添加 `saveContentAs` 函数和工具栏操作 |
| 退出快捷键 | ✅ 已集成 | Ctrl+Q 关闭窗口 |
| Vim 模式 | ⚠️ 部分 | 设置已存在，需要在工具栏中暴露 UI |
| 禅模式 | ⚠️ 部分 | 设置已存在，需要实现 UI |

## 验证

### 前端检查
```
npm run check
```
结果: 0 个错误，3 个警告（仅 a11y 和 CSS 警告）

### 后端检查
```
cargo check
```
结果: 编译成功，5 个警告（未使用的导入和死代码）

## 合并后建议

1. **测试设置集成**: 验证设置页面与我们的主题系统正确配合。

2. **添加 Vim 模式 UI**: vim 模式切换已存在于设置中，但需要在工具栏中暴露 UI 以便快速访问。

3. **实现禅模式**: 设置已存在，但实际的禅模式 UI 实现需要添加。

4. **测试 Linux 兼容性**: 上游添加了 Linux Wayland 的 WebKit 修复 - 应在 Linux 系统上验证。

5. **清理未使用代码**: 清理高亮模块中关于未使用导入和死代码的警告。

## 文件变更摘要

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

## 结论

合并已成功完成，所有冲突已解决。我们的自定义功能（tree-sitter 语法高亮、Kroki 图表、TOC 侧边栏、主题系统、可定制工具栏）已保留，同时获得了上游的新功能（设置页面、vim 模式、禅模式等）。建议进行一些额外的集成工作以充分利用合并的功能。