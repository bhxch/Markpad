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
| Vim 模式 | ✅ 已集成 | 添加工具栏切换按钮，显示激活状态 |
| 禅模式 | ✅ 已集成 | 添加工具栏切换按钮，显示激活状态 |

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

2. **测试 Linux 兼容性**: 上游添加了 Linux Wayland 的 WebKit 修复 - 应在 Linux 系统上验证。

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

---

# 第二轮上游合并报告（2026-10-06）

## 基线与范围

| 项 | 值 |
|----|----|
| merge-base | `1b53002` |
| 上游 | `2154730`（sftwrdotdev/Markpad master，v2.6.4 → **v2.8.3**，626 个上游提交） |
| 本地起点 | `30ee4f3`（master，154 个本地提交） |
| 集成分支 | `feat/upstream-merge-2`（自 master 线性前进） |
| 合并提交 | `ef663c5`（双亲 `db84385` + `2154730`），分支共 42 个新提交（重构 8 + 合并 1 + 收尾 11 + 审查修复 22），终态 `bba701b` |
| 冲突规模 | 19 个冲突文件 / 137 hunk（逐 hunk 档案见 spec `docs/superpowers/specs/2026-10-06-merge-upstream-round2-design.md` §6.10） |

## 架构策略

以特性原生主人定骨架、另一方移植差异点：`MarkdownViewer.svelte` 取上游 skeleton（从相对 1b53002 的 6377 行 diff 缩减为"上游轮廓 + pipeline/adapter 调用行"），本地渲染链抽为 `src/lib/pipeline/`（highlight、diagrams、latex、lightbox、copy 等步进管线），导出走本地 `src/lib/export.ts`（D6），图表分发走 `pipeline/diagrams.ts`（D12），settings 持久化取上游机制 + 本地字段迁入切片 `stores/slices/`。

## 裁决要点（关键决策）

| 决策 | 内容 |
|------|------|
| D6 | 导出引擎保持本地 `export.ts`（交互式 HTML/PDF/asset→dataURI），不吸收上游 MarkdownViewer 内 `exportAsHtml/exportAsPdf` 单体 |
| D10 | CSP 保留本地放宽项（`asset:`、connector 9555/9556、`wasm-unsafe-eval`），不采纳上游收紧版；零消费者的 Google Fonts 项已在审查修复中收紧（`ed0a72c`） |
| D12 | 图表分发由本地 pipeline 接管，上游 `rememberDiagramSource` 单写者约定不适用 |
| D13 | `stores/tabs.svelte.ts` 整文件取上游（1241 行为本地 372 行语义超集），分屏/滚动同步/最近关闭由上游版承接 |
| D14 | Home 菜单 / MoreMenu / metadata 弹窗由上游承接退役；本地 `export`/`vim_mode`/`zen_mode`/`metadata`/`theme_scheme`/`code_theme` 六动作注册进上游 `titlebarToolbar.ts` 注册表；Home 菜单仅保留 fork URL（`bhxch/Markpad`） |
| D15 | **已废弃（2026-10-07 用户终裁）**：内嵌 iframe 系上游 #47 旧特性而非本地独有，上游 #338/#388 已自行演进为缩略图外链方案，按"本地从上游移植的副本回归上游原版"规则跟随上游。初版合并曾静默丢失渲染端，审查修复曾回挂（`18dbf78`），终裁后反转回归上游版（`c6803dd`）：`replaceWithYoutubeLink` + CSP 删 frame-src，测试恢复上游契约并新增本地轨缩略图行为测试 |
| D17 | 测试三轨：上游 node --test 轨 + upstream-spec vitest 轨 + local-unit vitest 轨 |
| D21 | PDF 动态单页恢复（92baf54 测量 bug 修复：iframe 内实测页高）+ 默认项回归；多页分页维持储备；2026-10-09 spec（父仓库 docs/superpowers/specs/2026-10-09-export-restore-and-parity-design.md） |
| D22 | HTML 导出 TOC 修复：导出容器改取 .layout-container（二轮 ef663c5 误选 .viewer-content 致 TOC 死路）；夹具镜像真实 DOM + 接线钉子；2026-10-09 spec（父仓库 docs/superpowers/specs/2026-10-09-export-restore-and-parity-design.md） |
| D23 | 导出 lightbox 对齐应用内：乘法滚轮/光标锚定/拖拽平移/计数器（历史弱交互 + 二轮拉大差距）；2026-10-09 spec（父仓库 docs/superpowers/specs/2026-10-09-export-restore-and-parity-design.md） |
| D24 | 宽表 breakout/fit 规则随导出（三轮 3744b24 预览新增未同步导出）；2026-10-09 spec（父仓库 docs/superpowers/specs/2026-10-09-export-restore-and-parity-design.md） |
| D25 | VSCode 代码主题 --ts-* 导出保真（var() 化 + 覆盖块内联 + data-code-theme）；2026-10-09 spec（父仓库 docs/superpowers/specs/2026-10-09-export-restore-and-parity-design.md） |

## 验证（四门 + 差分归类）

| 门 | 结果 |
|----|------|
| `npm run build` | exit 0 |
| `npx svelte-check` | 0 errors / 0 warnings（初版 4 warnings 已治理，`bba701b`） |
| `npm test`（node --test） | 1112 pass / 0 fail（初版 10 个失败已全部收敛，见下"已知差异声明"） |
| `npx vitest run` | 546/546 pass（68 文件 = local-unit 7 + upstream-spec 61） |
| `cargo test` | 240 pass / 0 fail |

### 已知差异声明

合并后 `npm test` 初版有 10 个失败，经逐条独立取证（2026-10-07 审查修复批次）：2 项为实施疏漏（slices 死方法直写 localStorage、YouTube 内嵌半吊子态）、2 项为死代码触发（detectPlatform 等）、其余为测试断言未随 fork 决策（D6/D10/D12/D15）与重构形状同步。22 个修复提交后三轨全绿：决策分歧的断言已按 fork 契约改写并在注释中引用决策编号，实施疏漏与死代码已修复/清除。归因全文见父仓库 `docs/report/2026-10-06-round2-acceptance-smoke.md` §2 与其勘误记录。

### 审查修复批次（2026-10-07，`77d201f..bba701b`，22 提交）

终审代码审查发现并修复的问题（按批次）：

1. **export.ts 域**：`save_file_content` 调用补 `encoding` 参数（缺失会使 HTML 导出保存必败，spec §6.8 规划项被初版遗漏）；导出 HTML 内容宽度随预览设置派生（吸收上游 #467）；删零调用 `detectPlatform`；导出宽度契约改指本地管线。
2. **D15**：审查修复曾回挂内嵌播放（`18dbf78`/`9e5c5ef`）；经用户终裁确认内嵌系上游旧特性后反转回归上游缩略图外链方案（`c6803dd`），CSP 删 frame-src，本地轨保留行为测试。
3. **测试收敛**：editorTheme 定位、previewAnchorRestore 形状、mermaid/iframe/connect-src/PDF 导出五条规则按 fork 契约改写；local-unit 超时放宽至 15s 消除全量并行 flaky；导出接线测试加固。
4. **后端与配置**：删 slices 死持久化方法与 chrono/directories 零消费者依赖；CSP 收紧零消费者 Google Fonts 项；VSCode 主题读端改用 `app_config_dir` 同源路径（修复导入 .vsix 主题后代码块不着色的既有缺陷，Linux/Windows 双平台错位）；按 spec §6.8 注册 save_file_binary/delete_file/cleanup_empty_img_dir 储备命令（三命令实现自上游 v2.6.2 `79b697e` 恢复并改写为本仓现行风格）；退役本地 KaTeX 死分支（math 渲染由后端预处理 + 上游 richContent 完整接管）；semantic.rs 补记 latex 定界符预处理的着色差异注释。
5. **a11y**：ZoomOverlay/ExportModal 的 4 处 svelte-check 警告治理，基线归零。

### 人工 GUI 冒烟清单补录

Task 18 交接的人工冒烟清单（acceptance-smoke 报告 §4）存在两处清单缺口，在此显式补录：

1. **"编辑器中输入新代码块 → 即时高亮/图表"**：原清单仅覆盖既有代码块的渲染目测，需补充在编辑器中新输入 ```fence 代码块后预览区即时出现 tree-sitter 高亮、新输入 mermaid fence 即时出图。
2. **"excalidraw/bpmn/vega 图表类型验证"**：原清单"图表四模式"仅列 mermaid/graphviz/plantuml/svgbob，需补充 excalidraw / bpmn / vega 三种图表类型在 local 模式下的出图目测。

### updater 端点提示

`src-tauri/tauri.conf.json` 的 updater endpoint 指向上游 `https://github.com/sftwrdotdev/Markpad/releases/latest/download/latest.json`（spec D10 采纳上游配置）。后果：fork 用户在应用内"检查更新"会拉到**上游构建**并可能被上游版本号覆盖。若需指向自己的发布渠道，需同时修改 endpoint 与 `plugins.updater.pubkey`（当前 pubkey 为上游签名密钥，自建发布必须换自己的密钥对）。2026-10-07 用户终裁：维持现状（fork 暂不自主发版）。

## 遗留已知问题与限制

1. **自托管 Kroki http 被拦（既有缺陷）**：CSP `img-src` 无 `http:`，自托管 Kroki 使用 http 地址时图片会被拦（spec §7.3 表末行，非本次引入），如需支持需自行收紧决策后补 `img-src http:`。
2. **已知限制与后续建议**（自各任务台账 Minor 汇总）：
   - mermaid rejection 负缓存无重试——**已在 Task 14 修复**（负缓存带重试）；
   - `process_latex_delimiters` 对缩进码块的继承性存在转换边界缺口（资产原样继承，建议后续补注释或守卫）；
   - `themeScheme` 跨窗口同步依赖上游窗口体系，多窗口场景未专项验证；
   - 导出 `rewriteMarkdownHrefForExport` 将相对 `.txt` 链接一并改写为 `.html`（语义吸收，已披露接受）；
   - 导出截断守卫存在 tab 切换竞态（窗口极小概率触发）；
   - i18n 迁移词条仅 en/zh 双语；口径说明：本地合并前活键 26 个（spec §5.4 实测），其中 7 键新增迁入上游 locales、19 键复用上游现有键或由上游动作承接，仅预览右键菜单 undo/redo 两键未随迁移（2026-10-07 用户终裁接受现状：编辑操作属编辑器侧，Monaco 自带右键与 Ctrl+Z/Y 为等价物）；
   - 上游轨测试的 monacoStartupGraph 依赖显式文件路径导入（`./pipeline/index`），后续新增目录导入需沿用该写法。

## 文件变更摘要（相对 master 30ee4f3）

上游 626 个提交并入 + 集成分支 42 个新提交（重构/收尾/审查修复），核心变更：

```
 merged:    上游 626 提交（v2.8.3 基座：documentSession、frontmatter 面板、FindBar、
            多窗标签、更新器、splitPanes、TOC 重构、snapshot 测试轨等）
 new:       src/lib/pipeline/（本地渲染管线切片）、src/lib/stores/slices/（设置切片）、
            src/lib/export.ts、src/lib/diagrams、tests 三轨配置（vitest upstream-spec/local-unit）
 retired:   本地 i18n 目录（活键 24/26 迁移或复用上游）、metadata-popup、MoreMenu、
            旧 tabs store、dev:installer 入口、本地 KaTeX 管线步骤（上游 richContent 接管）
```

## 结论（第二轮）

626 个上游提交以本地特性保全方式并入。终审审查修复 22 项后，三轨测试全绿（npm test 1112/0、vitest 546/546、cargo test 240/0）、svelte-check 0 errors / 0 warnings；初版合并的两处实施疏漏（HTML 导出保存必败、YouTube 内嵌丢失）已修复，10 个测试差分全部收敛为 fork 契约。人工 GUI 冒烟清单（含本文补录两处，HTML 导出全链路须在 encoding 修复后重验）交接给有 GUI 环境的后续验证。
## 第三轮（v2.8.4，2026-10-09）

上游增量 3 提交（2154730..a7ce006）：宽表格适配设置（`preview.tableBreakout`/`preview.tableScroll`，#927/#959）、npm audit 清理（source-map-js、mermaid katex override，#960）、版本号 2.8.4（#961）。**零冲突自动合并**（合并点 3744b24，触及 11 文件均为上游/共享文件，本地命名空间文件无一被波及）。

合并后验收：本地特性源码在位（D18 math 守卫、D20 迁移接线、本地图表依赖全保留）；三轨测试全绿（npm test 0 失败、vitest 679/679、svelte-check 0 errors）；唯一语义处置——上游轨守卫测试 `singleImplementationConvention.test.ts` 的"localStorage 单写入口"规则拦下 D20 标记键裸写，按测试指引登记 `allowed` 并注明理由（写一次永不变的簿记键，且 titlebarMigration 须保持叶子模块）。GUI 冒烟通过（demo 文档渲染、math 块无浮层按钮、placement 表完整、标记在位）。
