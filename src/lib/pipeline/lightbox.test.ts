// src/lib/pipeline/lightbox.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

// D18 钉子：math 渲染面板（KaTeX）不得进入 lightbox 画廊。
// 背景：diagrams 管线把 ```math 块经 KaTeX 渲染进 diagram-wrapper，其 HTML 内部的
// svg 全是分式线/根号/括号等 stretchy 装饰碎片；收集器曾把它们当"图表 SVG"收进
// 画廊，浮层里只显示一个拉满白框的碎片而非完整公式（见外层 spec
// docs/superpowers/specs/2026-10-08-lightbox-math-and-svg-sizing-fix-design.md D18）。

function makeDiagramRoot(): HTMLElement {
  const root = document.createElement('div');
  const wrapper = document.createElement('div');
  wrapper.className = 'diagram-wrapper';
  const render = document.createElement('div');
  render.className = 'mermaid';
  render.dataset.diagramRender = 'true';
  render.innerHTML = '<svg viewBox="0 0 10 10"></svg>';
  wrapper.appendChild(render);
  root.appendChild(wrapper);
  return root;
}

function makeMathRoot(): HTMLElement {
  const root = document.createElement('div');
  const wrapper = document.createElement('div');
  wrapper.className = 'diagram-wrapper';
  // 与 diagrams.ts 的 math 分支一致：render 面板即 div.katex-display.math-block，
  // KaTeX 输出内嵌装饰 svg 碎片。
  const render = document.createElement('div');
  render.className = 'katex-display math-block';
  render.dataset.diagramRender = 'true';
  render.innerHTML = '<span class="katex"><svg width="0.78em" viewBox="0 0 400000 528"></svg></span>';
  wrapper.appendChild(render);
  root.appendChild(wrapper);
  return root;
}

function makeImgRoot(): HTMLElement {
  const root = document.createElement('div');
  const img = document.createElement('img');
  img.setAttribute('src', 'https://example.com/pic.png');
  img.width = 800;
  img.height = 600;
  root.appendChild(img);
  return root;
}

beforeEach(() => {
  vi.resetModules(); // items 是模块级单例状态，逐用例隔离
});

describe('lightbox 收集管线（spec D18）', () => {
  it('math 面板不产生画廊项、不安装悬停按钮', async () => {
    const { injectLightboxButtons, getViewableItems } = await import('./lightbox');
    const root = makeMathRoot();
    await injectLightboxButtons(root);
    expect(getViewableItems()).toEqual([]);
    expect(root.querySelector('.img-lightbox-btn')).toBeNull();
  });

  it('普通图表仍收集为 svg 项并安装悬停按钮', async () => {
    const { injectLightboxButtons, getViewableItems } = await import('./lightbox');
    const root = makeDiagramRoot();
    await injectLightboxButtons(root);
    expect(getViewableItems()).toEqual([{ type: 'svg', html: '<svg viewBox="0 0 10 10"></svg>' }]);
    expect(root.querySelector('.diagram-wrapper .img-lightbox-btn')).not.toBeNull();
  });

  it('普通图片仍收集为 img 项并安装悬停按钮', async () => {
    const { injectLightboxButtons, getViewableItems } = await import('./lightbox');
    const root = makeImgRoot();
    await injectLightboxButtons(root);
    expect(getViewableItems()).toEqual([{ type: 'img', src: 'https://example.com/pic.png' }]);
    expect(root.querySelector('.img-lightbox-wrapper .img-lightbox-btn')).not.toBeNull();
  });
});
