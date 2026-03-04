# 导出功能设计

## 概述

为 Markpad 添加导出 HTML 和导出 PDF 功能，采用所见即所得的方式，当前渲染的主题和 TOC 都会被导出。

## 功能需求

### 导出 HTML
- 单页 HTML 文件
- 包含当前主题样式（CSS 变量）
- 包含 TOC（如果开启）
- 图表以 SVG 形式嵌入
- 代码高亮样式保留
- 不嵌入绘图组件的 JS 脚本

### 导出 PDF
- 使用浏览器打印 API（混合方案）
- 支持多种尺寸：
  - 单页（动态高度）- 默认选项
  - A4、A3、Letter、Legal
- 图表分页智能处理：
  - 大图表：移到新页面 + 自动缩放至 95% 页面高度
  - 中等图表（80%-100% 页面高度）：适度缩放
  - 小图表：保持原样，使用 `break-inside: avoid`

## UI 设计

### 工具栏按钮
- 在 TitleBar 添加导出按钮
- 点击后弹出 ExportModal 对话框

### ExportModal 对话框
```
┌─────────────────────────────────┐
│  导出                           │
├─────────────────────────────────┤
│  ○ 导出 HTML                    │
│  ○ 导出 PDF                     │
│                                 │
│  PDF 尺寸：                     │
│  ┌─────────────────────────┐    │
│  │ 单页（动态高度）        │ ▼  │
│  └─────────────────────────┘    │
│                                 │
│  [取消]        [导出]           │
└─────────────────────────────────┘
```

## 技术实现

### 文件结构
```
src/lib/components/ExportModal.svelte  # 导出对话框组件
src/lib/export.ts                       # 导出核心逻辑
```

### HTML 导出流程
1. 克隆 `.markdown-container` DOM 结构
2. 提取当前主题的 CSS 变量值
3. 生成内联 `<style>` 块（主题 + markdown + 高亮样式）
4. 移除交互元素（编辑器、split-bar、事件绑定）
5. 保留 TOC sidebar（如果存在）
6. 图表 SVG 已渲染完成，直接保留
7. 使用 Tauri dialog 选择保存位置
8. 写入文件

### PDF 导出流程
1. 生成导出 HTML（同 HTML 导出）
2. 创建新窗口/iframe 加载 HTML
3. 根据选择的尺寸注入 `@page` CSS 规则
4. 动态计算内容高度（单页模式）
5. 处理图表分页
6. 调用 `window.print()` 触发打印对话框

### 单页动态尺寸实现
```javascript
// 计算内容高度（像素转毫米）
const contentHeightPx = document.querySelector('.markdown-container').scrollHeight;
const pxToMm = contentHeightPx / 96 * 25.4;  // 96 DPI
const pageHeight = Math.ceil(pxToMm + 30);  // 加 margins

// 动态设置 CSS
style.textContent = `@page { size: 210mm ${pageHeight}mm; margin: 15mm; }`;
```

### 图表分页处理算法
```
1. 遍历所有图表元素
2. 计算每个图表高度
3. 对于固定尺寸页面：
   - 计算页面可用高度（页面高度 - margins）
   - 图表高度 > 页面可用高度：
     → 移到新页面 + 自动缩放至 95% 页面高度
   - 图表高度 80%-100% 页面可用高度：
     → 缩放至 95% 页面可用高度
   - 图表高度 < 80%：
     → 保持原样，使用 break-inside: avoid
```

### PDF 尺寸配置
```css
单页（动态高度）：
@page { size: 210mm {动态计算}mm; margin: 15mm; }

A4：
@page { size: A4; margin: 15mm; }

A3：
@page { size: A3; margin: 15mm; }

Letter：
@page { size: letter; margin: 15mm; }

Legal：
@page { size: legal; margin: 15mm; }
```

### 样式提取
需要从 styles.css 提取：
- CSS 变量定义（当前主题）
- `.markdown-body` 及相关样式
- 代码块样式（`.hljs-*`）
- TOC 样式
- 图表容器样式

## 实现步骤

1. 创建 `ExportModal.svelte` 对话框组件
2. 创建 `export.ts` 导出逻辑
3. 修改 `TitleBar.svelte` 添加导出按钮
4. 修改 `MarkdownViewer.svelte` 传递导出回调
5. 测试各尺寸导出效果
