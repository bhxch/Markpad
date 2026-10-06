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
  it('MV 保留 handleExport 且调用本地 export.ts 的两个入口', () => {
    expect(mv).toMatch(/function handleExport\(/);
    expect(mv).toMatch(/exportAsHtml\(/);
    expect(mv).toMatch(/exportAsPdf\(/);
    expect(mv).toMatch(/from '\.\/export'/);
  });

  it('MV 挂载 ExportModal 并向 TitleBar 传 onexport', () => {
    expect(mv).toMatch(/ExportModal/);
    expect(mv).toMatch(/onexport=\{/);
  });

  it('TitleBar 保留 onexport prop（合并后与上游 onfind 并存）', () => {
    expect(titlebar).toMatch(/onexport/);
  });
});
