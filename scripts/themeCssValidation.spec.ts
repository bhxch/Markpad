import assert from 'node:assert/strict';
import { test } from 'vitest';

import { isHexColor, isSafeCssColor, sanitizeThemeColors } from '../src/lib/utils/theme.js';
import { readSource } from './sourceTree.js';

// P1-C-3: an imported VS Code theme's colour values are interpolated into a
// global <style> block that is replayed on every launch (the theme name is
// persisted in theme.txt), so an unvalidated value is a permanent UI takeover
// that can only be undone by deleting the config file by hand.

const injectionPoc = '#fff; } * { display:none; background-image:url(https://evil.tld/beacon) } :root {';

test('[P1-C-3] the theme.json injection PoC is rejected', () => {
	assert.equal(isSafeCssColor(injectionPoc), false);

	const safe = sanitizeThemeColors({
		'editor.background': injectionPoc,
		'editor.foreground': '#d4d4d4',
	});

	assert.deepEqual(safe, { 'editor.foreground': '#d4d4d4' });
	assert.equal(Object.prototype.hasOwnProperty.call(safe, 'editor.background'), false);
});

test('[P1-C-3] every shape that can escape a declaration block is rejected', () => {
	for (const value of [
		injectionPoc,
		'#fff;}*{display:none',
		'red; }',
		'url(https://evil.tld/beacon)',
		'#fff /* } */',
		'var(--x)',
		'expression(alert(1))',
		'#fff\n}',
		'#ggg',
		'#12345',
		'rgb(0,0,0);}',
		'rgba(0,0,0,0) !important',
		'',
		'   ',
		'#'.repeat(200),
	]) {
		assert.equal(isSafeCssColor(value), false, `must reject ${JSON.stringify(value)}`);
	}

	for (const value of [null, undefined, 42, {}, [], true]) {
		assert.equal(isSafeCssColor(value), false, `must reject ${String(value)}`);
	}
});

test('[P1-C-3] real VS Code theme colour values still pass', () => {
	for (const value of [
		'#fff',
		'#FFFA',
		'#1e1e1e',
		'#1E1E1EFF',
		'rgb(30, 30, 30)',
		'rgba(255, 255, 255, 0.1)',
		'rgba(0,0,0,.35)',
		'rgb(0 0 0 / 50%)',
		'transparent',
		'Black',
	]) {
		assert.equal(isSafeCssColor(value), true, `must allow ${value}`);
	}
});

test('[P1-C-3] Monaco only receives hex colours', () => {
	assert.equal(isHexColor('#1e1e1e'), true);
	assert.equal(isHexColor('#1e1e1eff'), true);
	assert.equal(isHexColor('rgba(0, 0, 0, 0.1)'), false);
	assert.equal(isHexColor('transparent'), false);
	assert.equal(isHexColor(injectionPoc), false);
});

test('[P1-C-3] sanitizeThemeColors survives a hostile theme.json shape', () => {
	assert.deepEqual(sanitizeThemeColors(null), {});
	assert.deepEqual(sanitizeThemeColors(undefined), {});
	assert.deepEqual(sanitizeThemeColors('#fff'), {});
	assert.deepEqual(
		sanitizeThemeColors({ a: '  #fff  ', b: 12, c: { toString: () => '#fff' }, d: ['#fff'] }),
		{ a: '#fff' },
	);
});

// T10: the preset Dark/Light Modern code themes are pinned to VSCode upstream
// tokenColors — vscode@91b51fe (master, fetched 2026-10-07),
// extensions/theme-defaults/themes/{dark,light}_vs.json overlaid by
// {dark,light}_plus.json (the include chain behind {dark,light}_modern.json).
// A scope with no matching upstream rule keeps the existing value and is
// marked "no upstream rule" below; --ts-bracket has no tokenColors equivalent
// at all (VSCode colours brackets via editor.editorBracketHighlight.* UI
// colours, and dark's default #1 is #FFD700), so it stays as-is too.

const TS_DARK_UPSTREAM: Record<string, string> = {
	comment: '#6A9955',
	keyword: '#569CD6',
	'keyword-control': '#C586C0', // keyword.control
	string: '#CE9178',
	'string-regexp': '#D16969', // string.regexp
	number: '#B5CEA8', // constant.numeric
	constant: '#4FC1FF', // no upstream rule for bare "constant" — kept
	'constant-builtin': '#569CD6', // no upstream rule for "constant.builtin" — kept
	boolean: '#569CD6', // constant.language
	type: '#4EC9B0', // entity.name.type
	'type-builtin': '#4EC9B0', // support.type
	function: '#DCDCAA', // entity.name.function / support.function
	method: '#DCDCAA', // entity.name.function
	macro: '#DCDCAA', // entity.name.function
	variable: '#9CDCFE', // variable
	'variable-builtin': '#569CD6', // variable.language
	parameter: '#9CDCFE', // variable.parameter (no rule of its own; inherits "variable")
	property: '#9CDCFE', // variable.other.property (no rule of its own; inherits "variable")
	operator: '#D4D4D4', // keyword.operator
	punctuation: '#D4D4D4', // no upstream rule for bare "punctuation" — kept
	bracket: '#FFD700', // no tokenColors equivalent — kept
	constructor: '#DCDCAA', // entity.name.function (constructor context)
	namespace: '#4EC9B0', // entity.name.namespace
	tag: '#569CD6', // entity.name.tag
	attribute: '#9CDCFE', // entity.other.attribute-name
	special: '#CE9178', // string.special (inherits "string")
	escape: '#D7BA7D', // constant.character.escape
};

const TS_LIGHT_UPSTREAM: Record<string, string> = {
	comment: '#008000',
	keyword: '#0000FF',
	'keyword-control': '#AF00DB',
	string: '#A31515',
	'string-regexp': '#811F3F',
	number: '#098658',
	constant: '#0070C1', // no upstream rule for bare "constant" — kept
	'constant-builtin': '#0000FF', // no upstream rule for "constant.builtin" — kept
	boolean: '#0000FF',
	type: '#267F99',
	'type-builtin': '#267F99',
	function: '#795E26',
	method: '#795E26',
	macro: '#795E26',
	variable: '#001080',
	'variable-builtin': '#0000FF',
	parameter: '#001080',
	property: '#001080',
	operator: '#000000',
	punctuation: '#000000', // no upstream rule for bare "punctuation" — kept
	bracket: '#000000', // no tokenColors equivalent — kept
	constructor: '#795E26',
	namespace: '#267F99',
	tag: '#800000',
	attribute: '#E50000', // entity.other.attribute-name
	special: '#A31515', // string.special (inherits "string")
	escape: '#EE0000',
};

const RUST_KEY_FOR_VAR: Record<string, string> = {
	comment: 'comment',
	keyword: 'keyword',
	'keyword-control': 'keyword.control',
	string: 'string',
	'string-regexp': 'string.regexp',
	number: 'constant.numeric',
	constant: 'constant',
	'constant-builtin': 'constant.builtin',
	boolean: 'constant.builtin.boolean',
	type: 'type',
	'type-builtin': 'type.builtin',
	function: 'function',
	method: 'function.method',
	macro: 'function.macro',
	variable: 'variable',
	'variable-builtin': 'variable.builtin',
	parameter: 'variable.parameter',
	property: 'property',
	operator: 'operator',
	punctuation: 'punctuation',
	bracket: 'punctuation.bracket',
	constructor: 'constructor',
	namespace: 'namespace',
	tag: 'tag',
	attribute: 'attribute',
	special: 'special',
	escape: 'constant.character.escape',
};

/** Pull one `--ts-*` declaration out of a `:root` block of styles.css. */
function tsVarFromCss(css: string, blockSelector: string, varName: string): string {
	const block = css.match(
		new RegExp(`${blockSelector.replaceAll(/[.*+?^${}()|[\]\\]/g, '\\$&')}[^{]*\\{([^}]*)\\}`),
	)?.[1];
	assert.ok(block, `styles.css must contain the ${blockSelector} block`);
	const value = block.match(new RegExp(`--ts-${varName}:\\s*(#[0-9A-Fa-f]{6})`))?.[1];
	assert.ok(value, `block must declare --ts-${varName}`);
	return value.toUpperCase();
}

function themeBlock(theme: 'dark' | 'light', table: Record<string, string>): void {
	const css = readSource('src/styles.css');
	const selector =
		theme === 'dark'
			? ':root,\n:root[data-code-theme="dark-modern"]'
			: ':root[data-code-theme="light-modern"]';
	for (const [name, expected] of Object.entries(table)) {
		assert.equal(
			tsVarFromCss(css, selector, name),
			expected,
			`--ts-${name} (${theme}-modern) must match vscode@91b51fe tokenColors`,
		);
	}
}

test('[T10] dark-modern preset --ts-* colours match vscode@91b51fe tokenColors', () => {
	themeBlock('dark', TS_DARK_UPSTREAM);
});

test('[T10] light-modern preset --ts-* colours match vscode@91b51fe tokenColors', () => {
	themeBlock('light', TS_LIGHT_UPSTREAM);
});

test('[T10] Rust dark_modern map matches the same vscode@91b51fe colours', () => {
	const source = readSource('src-tauri/src/highlight/themes/dark_modern.rs');
	for (const [name, expected] of Object.entries(TS_DARK_UPSTREAM)) {
		const key = RUST_KEY_FOR_VAR[name];
		assert.match(
			source,
			new RegExp(`m\\.insert\\("${key.replaceAll('.', '\\.')}"\\.to_string\\(\\), "${expected}"`),
			`dark_modern.rs "${key}" must be ${expected} (vscode@91b51fe)`,
		);
	}
});

test('[T10] Rust light_modern map matches the same vscode@91b51fe colours', () => {
	const source = readSource('src-tauri/src/highlight/themes/light_modern.rs');
	for (const [name, expected] of Object.entries(TS_LIGHT_UPSTREAM)) {
		const key = RUST_KEY_FOR_VAR[name];
		assert.match(
			source,
			new RegExp(`m\\.insert\\("${key.replaceAll('.', '\\.')}"\\.to_string\\(\\), "${expected}"`),
			`light_modern.rs "${key}" must be ${expected} (vscode@91b51fe)`,
		);
	}
});

test('[P1-C-3] the injected style tag is built only from validated values', () => {
	const source = readSource('src/lib/utils/theme.ts');

	assert.match(source, /const colors = sanitizeThemeColors\(theme\.colors\)/);
	assert.match(
		source,
		/\.filter\(\(\[, v\]\) => isSafeCssColor\(v\)\)/,
		'the final interpolation must re-check each value',
	);
	assert.doesNotMatch(
		source,
		/styleTag\.innerHTML\s*=/,
		'use textContent so the style tag can never be parsed as markup',
	);
});
