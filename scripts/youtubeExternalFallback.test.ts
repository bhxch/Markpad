import assert from 'node:assert/strict';
import test from 'node:test';

import { installShimDom, parseHtml, type ShimElement } from './renderProtocolDom.ts';
import { readSource } from './sourceTree.js';

installShimDom();

const { processMarkdownHtml } = await import('../src/lib/utils/markdown.ts');

const tauriConfig = readSource('src-tauri/tauri.conf.json');

// Fork contract (design note D15): YouTube keeps playing INSIDE Markpad as an
// embedded iframe. The upstream thumbnail-anchor rendering — an `a.youtube-link`
// wrapping an `i.ytimg.com` poster that opens the browser — was reviewed and
// rejected; the merge that brought the skeleton in dropped the local
// `replaceWithYoutubeEmbed` while keeping the CSP `frame-src`, which this
// suite now pins as a pair the other way round: the iframe is the feature and
// the CSP entry is what loads it. A thumbnail renderer returning here without
// reopening that decision is the regression.
//
// The file keeps its historical name from the upstream half of the story.

const VIDEO = 'dQw4w9WgXcQ'; // 11 chars, which is what getYoutubeId requires

function render(html: string) {
	return parseHtml(processMarkdownHtml(html, '/doc.md', new Set()));
}

function embed(iframe: ShimElement, videoId: string, message: string) {
	assert.equal(iframe.getAttribute('src'), `https://www.youtube.com/embed/${videoId}`, message);
	assert.equal(iframe.getAttribute('allowfullscreen'), '', 'the player fills its 16:9 container');
	assert.ok(iframe.getAttribute('allow'), 'and carries the usual player permissions');
	assert.equal(iframe.getAttribute('frameborder'), '0');
}

test('a YouTube link on its own becomes an embedded player', () => {
	const root = render(`<p><a href="https://www.youtube.com/watch?v=${VIDEO}">watch this</a></p>`);

	const container = root.querySelector('.video-container') as unknown as ShimElement | null;
	assert.ok(container, 'the link is replaced by the 16:9 container');

	const iframe = container.querySelector('iframe') as unknown as ShimElement | null;
	assert.ok(iframe, 'holding exactly one player');
	embed(iframe!, VIDEO, 'it plays the linked video in place');

	assert.equal(root.querySelectorAll('a').length, 0, 'no external anchor survives');
});

test('every recognised YouTube spelling gets the same treatment', () => {
	// `youtube.com/embed/` in particular is the URL people paste FROM an embed
	// snippet; the upstream detection list widened to include it and the iframe
	// path benefits from the same list.
	for (const href of [
		`https://www.youtube.com/watch?v=${VIDEO}`,
		`https://www.youtube.com/embed/${VIDEO}`,
		`https://www.youtube.com/v/${VIDEO}`,
		`https://youtu.be/${VIDEO}`,
	]) {
		const root = render(`<p><a href="${href}">link</a></p>`);
		const iframe = root.querySelector('.video-container iframe') as unknown as ShimElement | null;
		assert.ok(iframe, `${href} is recognised`);
		embed(iframe!, VIDEO, href);
	}
});

test('a YouTube image embed becomes the same player', () => {
	// `![](https://youtu.be/…)` renders as an <img> whose src is a video page.
	// Left alone it is a broken image.
	const root = render(`<p><img src="https://youtu.be/${VIDEO}" alt="video"></p>`);

	const iframe = root.querySelector('.video-container iframe') as unknown as ShimElement | null;
	assert.ok(iframe, 'the image is replaced by the player');
	embed(iframe!, VIDEO, 'same embed URL as the link path');
});

test('a YouTube link with words around it is left as a link', () => {
	// Only a paragraph that is nothing but the link becomes a player. Swapping
	// a link inside a sentence for a 16:9 frame would rewrite the prose.
	const root = render(`<p>see <a href="https://youtu.be/${VIDEO}">this</a> for context</p>`);

	assert.equal(root.querySelectorAll('.video-container').length, 0);
	assert.equal(root.querySelectorAll('iframe').length, 0);
	const link = root.querySelector('a') as unknown as ShimElement | null;
	assert.ok(link);
	assert.equal(link.getAttribute('href'), `https://youtu.be/${VIDEO}`, 'the link keeps where it points');
	assert.equal(link.textContent, 'this', 'and its own text');
});

test('a link that is not YouTube at all is never rewritten', () => {
	const root = render('<p><a href="https://example.com/watch?v=dQw4w9WgXcQ">watch</a></p>');

	assert.equal(root.querySelectorAll('.video-container').length, 0);
	assert.equal(root.querySelectorAll('iframe').length, 0);
	const link = root.querySelector('a') as unknown as ShimElement | null;
	assert.ok(link, 'the anchor survives untouched');
});

test('a URL that only looks like YouTube is not rewritten', () => {
	// getYoutubeId requires an 11-character id; anything else stays a link
	// rather than becoming a frame that 404s.
	const root = render('<p><a href="https://youtu.be/short">link</a></p>');

	assert.equal(root.querySelectorAll('.video-container').length, 0);
	assert.equal(root.querySelectorAll('iframe').length, 0);
});

// --- the half that is not this module's output ---

test('the packaged app permits exactly the YouTube embed origin', () => {
	// A contract with the packaged app rather than with a function: the CSP
	// lives in tauri.conf.json, nothing type-checks it, and a `frame-src` that
	// outlived the iframe (or went missing while the iframe stayed) ships a
	// blank rectangle either way. D15 keeps both halves.
	const frameSrc = tauriConfig.match(/"frame-src":\s*"([^"]+)"/);
	assert.ok(frameSrc, 'frame-src is present');
	assert.match(frameSrc![1], /https:\/\/www\.youtube\.com/, 'it allows the embed origin');
	assert.match(frameSrc![1], /https:\/\/www\.youtube-nocookie\.com/, 'and the nocookie origin');
	assert.doesNotMatch(tauriConfig, /i\.ytimg\.com/, 'the rejected thumbnail host stays out');
});
