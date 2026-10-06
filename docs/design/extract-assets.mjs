#!/usr/bin/env node
/**
 * Unpack a self-contained design handoff into real files.
 *
 * Design handoffs arrive as a single HTML document with every asset inlined as a
 * base64 `data:` URI and the stylesheet duplicated into a `<style>` block. That
 * shape is unreviewable (binary diffs), unusable from application code, and it
 * carries the same CSS twice, so the rendered examples and the downloadable
 * stylesheet drift apart in silence.
 *
 * This script turns that document into:
 *   - `assets/` holding each blob exactly once, addressed by content hash
 *   - an HTML shell that links those files instead of embedding them
 *
 * The stylesheet becomes the single source of truth: the CSS that renders the
 * examples is byte-identical to the CSS you download, because it is one file.
 *
 * Usage:
 *   node docs/design/extract-assets.mjs [handoff.html]
 *   node docs/design/extract-assets.mjs --check     # verify, write nothing
 *
 * Re-running on an already-unpacked document is a no-op.
 */

import { createHash } from 'node:crypto';
import { deflateSync, inflateSync } from 'node:zlib';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const DESIGN_DIR = dirname(fileURLToPath(import.meta.url));
const ASSETS_DIR = join(DESIGN_DIR, 'assets');

/** Blobs the handoff never names. Keyed by the `alt` text on the carrying element. */
const UNNAMED = { 'Unitati logo concept': 'img/logo-concept.png' };

/** Where a named download belongs, by file extension. */
const FOLDERS = { css: 'css', json: '.', svg: 'brand', png: 'img' };

/**
 * Stylesheets split out of the inline `<style>`, in cascade order.
 *
 * The token sheet is told apart by *declaring* a custom property with a literal
 * value. Testing for the property name alone is not enough: the component sheet
 * is full of `var(--surface-0)` references, so a substring test matches both.
 */
const SHEETS = [
	{
		file: 'css/tokens.css',
		banner: '/* ===== Unitati tokens (generated from tokens.json) ===== */',
		match: (css) => /--surface-0\s*:\s*#[0-9a-f]{3,8}/i.test(css)
	},
	{
		file: 'css/components.css',
		banner: '/* ===== Unitati component styles (components/bundle.css) ===== */',
		match: (css) => !/--surface-0\s*:\s*#[0-9a-f]{3,8}/i.test(css)
	}
];

const DOCS_SHEET = 'css/docs-page.css';

/** `alt` values that name a Lucide icon rather than describing an image. */
const ICON_NAME = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;
const ICON_MAX_BYTES = 1536;

// ---------------------------------------------------------------------------
// PNG: lossless recompression
// ---------------------------------------------------------------------------

/**
 * Re-deflate a PNG's pixel data at maximum effort and drop metadata chunks.
 *
 * Export tools favour speed over ratio, so the original IDAT stream is routinely
 * 20-30% larger than it needs to be. Decoding and re-encoding the same filtered
 * scanlines changes no pixel: `IHDR` is preserved verbatim, so dimensions, bit
 * depth, colour type and filter bytes all survive. Only the deflate stream and
 * the metadata chunks change.
 *
 * `sRGB` is kept because it declares colour intent and affects rendering. `eXIf`
 * is dropped because it carries capture metadata of no use to a design doc.
 *
 * Returns the original buffer when recompression fails to win, so the caller
 * never pays a size penalty for trying.
 */
function shrinkPng(png) {
	const KEEP = new Set(['IHDR', 'PLTE', 'tRNS', 'sRGB', 'gAMA', 'cHRM', 'iCCP']);
	const kept = [];
	const idat = [];

	let offset = 8;
	while (offset < png.length) {
		const length = png.readUInt32BE(offset);
		const type = png.toString('ascii', offset + 4, offset + 8);
		const body = png.subarray(offset + 8, offset + 8 + length);
		if (type === 'IDAT') idat.push(body);
		else if (KEEP.has(type)) kept.push({ type, body });
		offset += 12 + length;
	}
	if (idat.length === 0) return png;

	const scanlines = inflateSync(Buffer.concat(idat));
	const packed = deflateSync(scanlines, { level: 9, memLevel: 9, windowBits: 15 });

	const chunk = (type, body) => {
		const out = Buffer.alloc(12 + body.length);
		out.writeUInt32BE(body.length, 0);
		out.write(type, 4, 'ascii');
		body.copy(out, 8);
		out.writeUInt32BE(crc32(out.subarray(4, 8 + body.length)), 8 + body.length);
		return out;
	};

	const rebuilt = Buffer.concat([
		png.subarray(0, 8),
		...kept.map((c) => chunk(c.type, c.body)),
		chunk('IDAT', packed),
		chunk('IEND', Buffer.alloc(0))
	]);

	return rebuilt.length < png.length ? rebuilt : png;
}

const CRC_TABLE = Int32Array.from({ length: 256 }, (_, n) => {
	let c = n;
	for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
	return c;
});

function crc32(buf) {
	let c = -1;
	for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
	return (c ^ -1) >>> 0;
}

// ---------------------------------------------------------------------------
// Extraction
// ---------------------------------------------------------------------------

/**
 * Collect every `data:` URI in the document together with the attributes of the
 * element carrying it, which is where the intended filename hides.
 */
function readBlobs(html) {
	const pattern =
		/<(\w+)\b([^>]*?)(?:src|href)\s*=\s*"(data:([a-z+/.-]+);base64,([A-Za-z0-9+/=]+))"([^>]*)>/gi;
	const blobs = new Map();

	for (const [, , before, uri, mime, base64, after] of html.matchAll(pattern)) {
		const attrs = `${before} ${after}`;
		const bytes = Buffer.from(base64, 'base64');
		const hash = createHash('sha256').update(bytes).digest('hex').slice(0, 12);
		const blob = blobs.get(hash) ?? { hash, mime, bytes, uris: new Set(), names: new Set() };

		blob.uris.add(uri);
		const download = attrs.match(/download\s*=\s*"([^"]*)"/i)?.[1];
		const alt = attrs.match(/alt\s*=\s*"([^"]*)"/i)?.[1];
		if (download) blob.names.add(download);
		if (alt) blob.alt ??= alt;
		blobs.set(hash, blob);
	}
	return [...blobs.values()];
}

/**
 * Resolve the path a blob is written to.
 *
 * A handoff already states the filename it means for an asset, in the
 * `download` attribute of its download link. Honouring that keeps the unpacked
 * names stable across handoffs. Icons carry their name in `alt` instead, since
 * they have no download link. Anything the document never names has to be
 * listed in `UNNAMED`; an unresolved blob is a hard error rather than a
 * generated `blob-7.svg`, because a meaningless name silently becomes a
 * permanent reference once the HTML links it.
 */
function resolvePath(blob) {
	const [named] = blob.names;
	if (named) {
		const ext = named.split('.').pop().toLowerCase();
		const folder = FOLDERS[ext];
		if (!folder) throw new Error(`No folder mapped for .${ext} (asset "${named}")`);
		return folder === '.' ? named : `${folder}/${named}`;
	}

	if (blob.alt && UNNAMED[blob.alt]) return UNNAMED[blob.alt];

	const isIcon =
		blob.mime === 'image/svg+xml' &&
		blob.bytes.length <= ICON_MAX_BYTES &&
		blob.alt &&
		ICON_NAME.test(blob.alt);
	if (isIcon) return `icons/${blob.alt}.svg`;

	throw new Error(
		`Unnamed ${blob.mime} blob, ${blob.bytes.length} bytes, alt="${blob.alt ?? ''}". ` +
			`Add it to UNNAMED in ${relative(process.cwd(), fileURLToPath(import.meta.url))}.`
	);
}

/**
 * Split the inline `<style>` into the stylesheets the handoff already treats as
 * separate downloads, plus whatever is left over.
 *
 * The bundled `<style>` is a concatenation: each downloadable stylesheet appears
 * inside it verbatim. Locating those exact substrings and lifting them out
 * leaves the documentation page's own chrome as the remainder. Verbatim is the
 * load-bearing word: if a stylesheet is not found character for character, the
 * two copies have already diverged and we must stop rather than pick a winner.
 */
function splitStyles(style, blobs) {
	const sheets = [];
	let chrome = style;

	for (const { file, banner, match } of SHEETS) {
		const blob = blobs.find((b) => b.mime === 'text/css' && match(b.bytes.toString('utf8')));
		if (!blob) throw new Error(`No downloadable stylesheet matched ${file}`);

		const css = blob.bytes.toString('utf8');
		if (!chrome.includes(css)) {
			throw new Error(
				`${file} is not embedded verbatim in <style>. The inline copy and the ` +
					`downloadable copy have diverged; reconcile them by hand before unpacking.`
			);
		}
		chrome = chrome.replace(banner, '').replace(css, '');
		sheets.push({ file, css: `${css.trim()}\n` });
	}

	return { sheets, chrome: `${chrome.trim()}\n` };
}

/** Rewrite the document so it links `assets/` instead of embedding it. */
function buildShell(html, placed, sheets) {
	let out = html;
	for (const { blob, path } of placed) {
		for (const uri of blob.uris) out = out.split(uri).join(`assets/${path}`);
	}

	const links = [...sheets, { file: DOCS_SHEET }]
		.map(({ file }) => `<link rel="stylesheet" href="assets/${file}">`)
		.join('\n');

	return out.replace(/<style>[\s\S]*?<\/style>/i, links);
}

// ---------------------------------------------------------------------------

function main() {
	const args = process.argv.slice(2);
	const check = args.includes('--check');
	const source = resolve(
		args.find((a) => !a.startsWith('--')) ?? join(DESIGN_DIR, 'design-system.html')
	);
	const html = readFileSync(source, 'utf8');

	const style = html.match(/<style>([\s\S]*?)<\/style>/i)?.[1];
	if (!style) {
		console.log(`${relative(process.cwd(), source)} is already unpacked; nothing to do.`);
		return;
	}

	const blobs = readBlobs(html);
	const placed = blobs.map((blob) => ({ blob, path: resolvePath(blob) }));
	const { sheets, chrome } = splitStyles(style, blobs);

	const collisions = new Map();
	for (const { path, blob } of placed) {
		if (collisions.has(path)) throw new Error(`Two different blobs both claim assets/${path}`);
		collisions.set(path, blob);
	}

	const files = [
		...placed
			// Stylesheets are written from the inline copy, not the download copy, so
			// the shell keeps rendering exactly what it rendered before.
			.filter(({ path }) => !sheets.some((s) => s.file === path))
			.map(({ blob, path }) => ({
				path,
				bytes: blob.mime === 'image/png' ? shrinkPng(blob.bytes) : blob.bytes,
				was: blob.bytes.length
			})),
		...sheets.map(({ file, css }) => ({ path: file, bytes: Buffer.from(css, 'utf8') })),
		{ path: DOCS_SHEET, bytes: Buffer.from(chrome, 'utf8') }
	];

	const shell = buildShell(html, placed, sheets);
	const leftover = shell.match(/data:[a-z+/.-]+;base64,/i);
	if (leftover) throw new Error(`Shell still embeds a data URI: ${leftover[0]}`);

	if (check) {
		console.log(`${files.length} assets would be written; shell would be ${fmt(shell.length)}.`);
		return;
	}

	rmSync(ASSETS_DIR, { recursive: true, force: true });
	for (const file of files) {
		const target = join(ASSETS_DIR, file.path);
		mkdirSync(dirname(target), { recursive: true });
		writeFileSync(target, file.bytes);
	}
	writeFileSync(source, shell);

	const total = files.reduce((sum, f) => sum + f.bytes.length, 0);
	for (const f of [...files].sort((a, b) => b.bytes.length - a.bytes.length).slice(0, 6)) {
		const saved = f.was && f.was > f.bytes.length ? ` (was ${fmt(f.was)})` : '';
		console.log(`  ${fmt(f.bytes.length).padStart(10)}  assets/${f.path}${saved}`);
	}
	console.log(`\n${files.length} assets, ${fmt(total)} total.`);
	console.log(`${relative(process.cwd(), source)}: ${fmt(html.length)} -> ${fmt(shell.length)}.`);
}

const fmt = (n) =>
	n < 1024
		? `${n} B`
		: n < 1024 * 1024
			? `${(n / 1024).toFixed(1)} KB`
			: `${(n / 1048576).toFixed(2)} MB`;

main();
