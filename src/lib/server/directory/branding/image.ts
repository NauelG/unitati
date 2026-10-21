import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { optimize, type CustomPlugin, type PluginConfig } from 'svgo';
import { failure, success, type Outcome } from '../../shared/outcome';

/**
 * Pure image processing for the brand (ADR 0026, #161). Everything an admin uploads
 * is reduced and transformed here before it is stored, and only the output is kept:
 * no original, no metadata, no script. The module touches neither the database nor
 * the request, so it is tested on generated fixtures.
 */

export type { UploadSlot, DerivedSlot, BrandAssetSlot } from '#lib/domain/brand.js';
import { LOGO_MAX_BYTES, type UploadSlot } from '#lib/domain/brand.js';

export type ImageFailure =
	| 'too-large'
	| 'unsupported-type'
	| 'too-many-pixels'
	| 'invalid-image'
	| 'invalid-svg'
	| 'output-too-large';

export interface ProcessedImage {
	contentType: 'image/svg+xml' | 'image/webp' | 'image/png';
	data: Uint8Array;
	/** Lowercase hex of `data`. */
	sha256: string;
	/** Null for SVG. */
	width: number | null;
	height: number | null;
}

export const MAX_INPUT_BYTES = LOGO_MAX_BYTES;
export const MAX_INPUT_PIXELS = 40_000_000;
export const MAX_OUTPUT_BYTES = 256 * 1024;
/** 3× the largest rendered height (h-10 = 40px). */
export const LOCKUP_MAX = { width: 960, height: 120 };
export const MARK_SIZE = 512;

const TRANSPARENT = { r: 0, g: 0, b: 0, alpha: 0 };

const sha256Of = (data: Uint8Array) => createHash('sha256').update(data).digest('hex');

function processed(
	contentType: ProcessedImage['contentType'],
	data: Uint8Array,
	width: number | null,
	height: number | null
): ProcessedImage {
	return { contentType, data, sha256: sha256Of(data), width, height };
}

type Detected = 'png' | 'jpeg' | 'webp' | 'svg' | null;

function startsWith(input: Uint8Array, bytes: number[], offset = 0): boolean {
	return bytes.every((byte, index) => input[offset + index] === byte);
}

/** Skips a BOM, whitespace, the XML declaration and comments, which may precede the root. */
function afterProlog(text: string): string {
	let rest = text.replace(/^\uFEFF/, '');
	for (;;) {
		const next = rest
			.replace(/^\s+/, '')
			.replace(/^<\?xml[\s\S]*?\?>/i, '')
			.replace(/^<!--[\s\S]*?-->/, '');
		if (next === rest) return next;
		rest = next;
	}
}

/** By content only: the file name and the client's `Content-Type` are never consulted. */
function detect(input: Uint8Array): Detected {
	if (startsWith(input, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'png';
	if (startsWith(input, [0xff, 0xd8, 0xff])) return 'jpeg';
	if (startsWith(input, [0x52, 0x49, 0x46, 0x46]) && startsWith(input, [0x57, 0x45, 0x42, 0x50], 8))
		return 'webp';

	let text: string;
	try {
		text = new TextDecoder('utf-8', { fatal: true }).decode(input);
	} catch {
		return null;
	}
	const rest = afterProlog(text);
	if (/^<svg[\s/>]/.test(rest)) return 'svg';
	// A DOCTYPE in front of the root is still an SVG attempt; it is refused later, as unsafe.
	if (/^<!DOCTYPE/i.test(rest) && /<svg[\s/>]/.test(rest)) return 'svg';
	return null;
}

/** An external `url(...)` reference. Only `#fragment` and `data:image/` targets are safe. */
function hasExternalUrl(value: string): boolean {
	for (const match of value.matchAll(/url\(\s*(['"]?)\s*([^'")\s]*)/gi)) {
		const target = match[2];
		if (!target.startsWith('#') && !target.toLowerCase().startsWith('data:image/')) return true;
	}
	return /@import/i.test(value);
}

/**
 * Removes what `removeScripts` does not: `<foreignObject>`, hyperlinks and
 * references to anything outside the file, in attributes and in `<style>`.
 */
const sanitiseReferences: CustomPlugin = {
	name: 'sanitiseReferences',
	fn: () => ({
		element: {
			enter(node, parent) {
				if (node.name === 'foreignObject') {
					parent.children = parent.children.filter((child) => child !== node);
					return;
				}
				for (const [name, value] of Object.entries(node.attributes)) {
					const isHref = name === 'href' || name.endsWith(':href');
					const safeHref = value.startsWith('#') || value.toLowerCase().startsWith('data:image/');
					if ((isHref && !safeHref) || (!isHref && hasExternalUrl(value))) {
						delete node.attributes[name];
					}
				}
				if (node.name === 'style') {
					for (const child of node.children) {
						if ((child.type === 'text' || child.type === 'cdata') && hasExternalUrl(child.value)) {
							child.value = '';
						}
					}
				}
			}
		}
	})
};

// The sanitiser runs last: `preset-default` can move styles into attributes.
const SVG_PLUGINS: PluginConfig[] = [
	'preset-default',
	'removeDimensions',
	'removeScripts',
	sanitiseReferences
];

function processSvg(input: Uint8Array): Outcome<ProcessedImage, ImageFailure> {
	const text = new TextDecoder().decode(input);
	if (/<!DOCTYPE|<!ENTITY/i.test(text)) return failure('invalid-svg');

	let optimised: string;
	try {
		optimised = optimize(text, { multipass: true, plugins: SVG_PLUGINS }).data;
	} catch {
		return failure('invalid-svg');
	}

	// Defence in depth: whatever the plugins did, the result must still be clean.
	if (
		/<script/i.test(optimised) ||
		/\son\w+\s*=/i.test(optimised) ||
		/<foreignObject/i.test(optimised) ||
		/javascript:/i.test(optimised) ||
		/\s(?:xlink:)?href\s*=\s*["'](?!#|data:image\/)/i.test(optimised) ||
		hasExternalUrl(optimised) ||
		!/<svg[^>]*\sviewBox=/i.test(optimised)
	) {
		return failure('invalid-svg');
	}

	const data = new TextEncoder().encode(optimised);
	if (data.byteLength > MAX_OUTPUT_BYTES) return failure('output-too-large');
	return success(processed('image/svg+xml', data, null, null));
}

/** Trims uniform or transparent margins; an image trimming cannot handle is left whole. */
async function trimmed(png: Buffer): Promise<Buffer> {
	try {
		const out = await sharp(png).trim().png().toBuffer({ resolveWithObject: true });
		return out.info.width > 0 && out.info.height > 0 ? out.data : png;
	} catch {
		return png;
	}
}

async function processRaster(
	slot: UploadSlot,
	input: Uint8Array
): Promise<Outcome<ProcessedImage, ImageFailure>> {
	let normalised: Buffer;
	try {
		normalised = await sharp(input, {
			limitInputPixels: MAX_INPUT_PIXELS,
			animated: false,
			failOn: 'error'
		})
			.rotate()
			.toColourspace('srgb')
			.ensureAlpha()
			.png()
			.toBuffer();
	} catch (error) {
		return failure(/pixel limit/i.test(String(error)) ? 'too-many-pixels' : 'invalid-image');
	}

	try {
		const source = await trimmed(normalised);
		let image = sharp(source);

		if (slot === 'mark') {
			const resized = await image
				.resize({ width: MARK_SIZE, height: MARK_SIZE, fit: 'inside', withoutEnlargement: true })
				.png()
				.toBuffer({ resolveWithObject: true });
			const side = Math.max(resized.info.width, resized.info.height);
			const horizontal = side - resized.info.width;
			const vertical = side - resized.info.height;
			image = sharp(resized.data).extend({
				left: Math.floor(horizontal / 2),
				right: Math.ceil(horizontal / 2),
				top: Math.floor(vertical / 2),
				bottom: Math.ceil(vertical / 2),
				background: TRANSPARENT
			});
		} else {
			image = image.resize({
				width: LOCKUP_MAX.width,
				height: LOCKUP_MAX.height,
				fit: 'inside',
				withoutEnlargement: true
			});
		}

		// No `withMetadata`: EXIF, ICC and XMP never reach the output.
		const out = await image
			.webp({ lossless: true, effort: 6 })
			.toBuffer({ resolveWithObject: true });
		if (out.data.byteLength > MAX_OUTPUT_BYTES) return failure('output-too-large');
		return success(processed('image/webp', out.data, out.info.width, out.info.height));
	} catch {
		return failure('invalid-image');
	}
}

export async function processUpload(
	slot: UploadSlot,
	input: Uint8Array
): Promise<Outcome<ProcessedImage, ImageFailure>> {
	if (input.byteLength > MAX_INPUT_BYTES) return failure('too-large');

	const kind = detect(input);
	if (!kind) return failure('unsupported-type');
	if (kind === 'svg') return processSvg(input);
	return processRaster(slot, input);
}

const FAVICON_SIZE = 64;
const APPLE_TOUCH_SIZE = 180;
/** 12% of padding on each side. */
const APPLE_TOUCH_MARK = Math.round(APPLE_TOUCH_SIZE * 0.76);

/** Rasterises a mark at twice the largest size we need, so a vector stays crisp. */
async function rasterOf(mark: ProcessedImage): Promise<Buffer> {
	if (mark.contentType !== 'image/svg+xml') return Buffer.from(mark.data);

	const probe = await sharp(mark.data).metadata();
	const longest = Math.max(probe.width ?? 1, probe.height ?? 1);
	const density = Math.min(2400, Math.max(72, (72 * APPLE_TOUCH_SIZE * 2) / longest));
	return sharp(mark.data, { density }).png().toBuffer();
}

/**
 * The favicon and the apple-touch icon, generated from the mark (Q11). The
 * apple-touch icon is opaque white because iOS paints transparency black.
 */
export async function deriveIcons(
	mark: ProcessedImage
): Promise<{ favicon: ProcessedImage; apple_touch: ProcessedImage }> {
	const source = await rasterOf(mark);

	const favicon = await sharp(source)
		.resize(FAVICON_SIZE, FAVICON_SIZE, { fit: 'contain', background: TRANSPARENT })
		.png()
		.toBuffer();

	const padding = APPLE_TOUCH_SIZE - APPLE_TOUCH_MARK;
	const apple = await sharp(source)
		.resize(APPLE_TOUCH_MARK, APPLE_TOUCH_MARK, { fit: 'contain', background: TRANSPARENT })
		.flatten({ background: '#ffffff' })
		.extend({
			top: Math.floor(padding / 2),
			bottom: Math.ceil(padding / 2),
			left: Math.floor(padding / 2),
			right: Math.ceil(padding / 2),
			background: '#ffffff'
		})
		.png()
		.toBuffer();

	return {
		favicon: processed('image/png', favicon, FAVICON_SIZE, FAVICON_SIZE),
		apple_touch: processed('image/png', apple, APPLE_TOUCH_SIZE, APPLE_TOUCH_SIZE)
	};
}

/** Printed lockups are at most this many pixels tall: a 34pt logo at 300 dpi. */
const PRINT_LOCKUP_HEIGHT = 142;

/**
 * A stored lockup as a PNG for print (a handover document): PDF engines embed
 * PNG and JPEG, not WebP or SVG. A vector is rasterised tall enough to stay
 * sharp at print resolution; a raster is only ever scaled down.
 */
export async function lockupForPrint(lockup: {
	contentType: string;
	data: Uint8Array;
}): Promise<Uint8Array> {
	let source = sharp(lockup.data);
	if (lockup.contentType === 'image/svg+xml') {
		const probe = await sharp(lockup.data).metadata();
		const density = Math.min(2400, Math.max(72, (72 * PRINT_LOCKUP_HEIGHT) / (probe.height ?? 1)));
		source = sharp(lockup.data, { density });
	}
	const png = await source
		.resize({ height: PRINT_LOCKUP_HEIGHT, withoutEnlargement: true })
		.png()
		.toBuffer();
	return new Uint8Array(png);
}
