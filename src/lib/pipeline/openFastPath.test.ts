import { describe, expect, it } from 'vitest';
import { isIdenticalRenderSkippable } from './openFastPath.js';

const base = {
	rawContent: 'same',
	content: '<p>rendered</p>',
	isDirty: false,
	previewedRawContent: undefined as string | undefined,
};

describe('isIdenticalRenderSkippable（D31，spec 2026-10-10）', () => {
	it('同内容已渲染未脏 → 短路', () => {
		expect(isIdenticalRenderSkippable({ ...base }, 'same', { isFull: true, editingLike: false })).toBe(true);
	});

	it('无既有 tab → 不短路', () => {
		expect(isIdenticalRenderSkippable(undefined, 'same', { isFull: true, editingLike: false })).toBe(false);
	});

	it('脏缓冲 → 不短路（#471 脏缓冲不静默覆盖契约）', () => {
		expect(isIdenticalRenderSkippable({ ...base, isDirty: true }, 'same', { isFull: true, editingLike: false })).toBe(false);
	});

	it('编辑/分屏路径 → 不短路', () => {
		expect(isIdenticalRenderSkippable({ ...base }, 'same', { isFull: true, editingLike: true })).toBe(false);
	});

	it('切片读（isFull=false）→ 不短路', () => {
		expect(isIdenticalRenderSkippable({ ...base }, 'same', { isFull: false, editingLike: false })).toBe(false);
	});

	it('内容不同 → 不短路', () => {
		expect(isIdenticalRenderSkippable({ ...base }, 'changed', { isFull: true, editingLike: false })).toBe(false);
	});

	it('content 为空（从未渲染过）→ 不短路', () => {
		expect(isIdenticalRenderSkippable({ ...base, content: '' }, 'same', { isFull: true, editingLike: false })).toBe(false);
	});

	it('previewedRawContent 落后于 rawContent（预览未跟上缓冲）→ 不短路', () => {
		expect(isIdenticalRenderSkippable({ ...base, previewedRawContent: 'older' }, 'same', { isFull: true, editingLike: false })).toBe(false);
	});

	it('previewedRawContent 与 rawContent 一致 → 短路', () => {
		expect(isIdenticalRenderSkippable({ ...base, previewedRawContent: 'same' }, 'same', { isFull: true, editingLike: false })).toBe(true);
	});
});
