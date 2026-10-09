// src/lib/export.wiring.test.ts
// 契约：本地导出管线的调用链必须完整存在（TitleBar onexport → ExportModal → handleExport → export.ts）。
// 该测试读取源码做静态断言——合并时若上游 MarkdownViewer 骨架替换掉 handleExport/ExportModal 接线，
// 纯函数测试（export.test.ts）仍会全绿，唯有此测试变红。
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const mv = readFileSync(join(__dirname, 'MarkdownViewer.svelte'), 'utf8');
const titlebar = readFileSync(join(__dirname, 'components', 'TitleBar.svelte'), 'utf8');

describe('导出管线接线契约（spec §7.2 风险 1）', () => {
  it('MV 保留 handleExport 且以容器实参调用本地 export.ts 的两个入口', () => {
    expect(mv).toMatch(/function handleExport\(/);
    // 实际调用形态（容器为首参）+ 精确 import 路径：handleExport 改调上游
    // utils/export.ts 的同名函数（或 import 被换成 './utils/export'）时在此变红。
    expect(mv).toMatch(
      /import \{ exportAsHtml, exportAsPdf, type ExportFormat, type PdfPageSize \} from '\.\/export'/,
    );
    expect(mv).toMatch(/exportAsHtml\(container, settings\.showToc/);
    // D24 终审 M-2：PDF 路径第 5 参接通 previewContentWidth（null 回落 export.ts 缺省）。
    expect(mv).toMatch(
      /exportAsPdf\(container, settings\.showToc, pageSize, fileName, previewContentWidth \?\? undefined\)/,
    );
  });

  it('MV 导出容器是 TOC wrapper 公共祖先（D22，防上游骨架替换再次静默丢 TOC）', () => {
    expect(mv).toMatch(/const container = document\.querySelector\('\.layout-container'\)/);
  });

  it('MV 挂载 ExportModal 并以 handleExport 实绑定 onexport（防空绑定）', () => {
    expect(mv).toMatch(/<ExportModal\b/);
    // 字面绑定 handleExport：`onexport={() => {}}` 空壳也能通过"存在 onexport"
    // 的检查，接线的 ExportModal → handleExport 一跳必须钉死。
    expect(mv).toMatch(/onexport=\{handleExport\}/);
    // TitleBar 两个入口只负责打开弹窗，绑定同样不得是空函数。
    expect(mv).toMatch(/onexport=\{\(\) => \(showExportModal = true\)\}/);
  });

  it('TitleBar 保留 onexport prop（合并后与上游 onfind 并存）', () => {
    expect(titlebar).toMatch(/onexport/);
  });

  it('ExportModal 保留 dynamic 单页选项与 i18n 标签（D21）', () => {
    const modal = readFileSync(join(__dirname, 'components', 'ExportModal.svelte'), 'utf8');
    expect(modal).toMatch(/'dynamic' \| 'a4'/);
    expect(modal).toMatch(/\{ value: 'dynamic' \}/);
    expect(modal).toMatch(/t\('export\.pageSizeDynamic'/);
  });
});
