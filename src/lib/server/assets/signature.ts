import { inflateSync } from 'node:zlib';

/**
 * The drawn signature of an accepted handover (ADR 0035, decision 6), checked
 * before it becomes evidence. The browser sends the canvas as a PNG; the server
 * does not trust that it is one, that it is small, or that anything was drawn on
 * it: an empty canvas is refused here as well as in the page, since a crafted
 * request skips the page.
 *
 * "Blank" means every pixel is fully transparent, which is what an untouched
 * canvas encodes to. Only PNGs with an alpha channel can be told blank; the
 * signing page always produces one.
 */

export const MAX_SIGNATURE_BYTES = 200 * 1024;

/** A phone at 3x is about 1200 px wide; this leaves room and bounds the inflate. */
const MAX_SIDE = 4096;
const MAX_PIXELS = 4_000_000;

export type SignatureProblem = 'missing' | 'too_large' | 'not_png' | 'blank';

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/** Channels per pixel, by PNG colour type. */
const CHANNELS: Record<number, number> = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };

/** `null` when the bytes are an acceptable signature, otherwise why not. */
export function signatureProblem(png: Uint8Array | null): SignatureProblem | null {
	if (!png || png.byteLength === 0) return 'missing';
	if (png.byteLength > MAX_SIGNATURE_BYTES) return 'too_large';

	const image = parse(png);
	if (!image) return 'not_png';
	if (image.colourType !== 4 && image.colourType !== 6) return null;

	const pixels = unfilter(image);
	if (!pixels) return 'not_png';
	return hasInk(pixels, image) ? null : 'blank';
}

interface Image {
	width: number;
	height: number;
	bitDepth: number;
	colourType: number;
	data: Uint8Array;
}

function parse(png: Uint8Array): Image | null {
	if (png.byteLength < 8 || PNG_SIGNATURE.some((byte, i) => png[i] !== byte)) return null;
	const view = new DataView(png.buffer, png.byteOffset, png.byteLength);

	let header: Omit<Image, 'data'> | null = null;
	const idat: Uint8Array[] = [];
	let offset = 8;
	let ended = false;

	while (offset + 8 <= png.byteLength) {
		const length = view.getUint32(offset);
		const type = String.fromCharCode(...png.subarray(offset + 4, offset + 8));
		const start = offset + 8;
		const end = start + length;
		if (end + 4 > png.byteLength) return null;

		if (header === null && type !== 'IHDR') return null;
		if (type === 'IHDR') {
			if (length !== 13) return null;
			const interlace = png[start + 12];
			if (interlace !== 0) return null;
			header = {
				width: view.getUint32(start),
				height: view.getUint32(start + 4),
				bitDepth: png[start + 8],
				colourType: png[start + 9]
			};
		} else if (type === 'IDAT') {
			idat.push(png.subarray(start, end));
		} else if (type === 'IEND') {
			ended = true;
			break;
		}
		offset = end + 4;
	}

	if (!header || !ended || idat.length === 0) return null;
	const { width, height, bitDepth, colourType } = header;
	if (!(colourType in CHANNELS) || ![1, 2, 4, 8, 16].includes(bitDepth)) return null;
	if (width === 0 || height === 0 || width > MAX_SIDE || height > MAX_SIDE) return null;
	if (width * height > MAX_PIXELS) return null;

	const joined = new Uint8Array(idat.reduce((sum, part) => sum + part.byteLength, 0));
	let at = 0;
	for (const part of idat) {
		joined.set(part, at);
		at += part.byteLength;
	}
	return { ...header, data: joined };
}

function strideOf(image: Image): number {
	return Math.ceil((image.width * CHANNELS[image.colourType] * image.bitDepth) / 8);
}

/** The raw scanlines, with each row's filter undone; `null` when the data is corrupt. */
function unfilter(image: Image): Uint8Array | null {
	const stride = strideOf(image);
	const expected = (stride + 1) * image.height;

	let inflated: Uint8Array;
	try {
		// Bounded, so a small file cannot inflate into a large allocation.
		inflated = inflateSync(image.data, { maxOutputLength: expected });
	} catch {
		return null;
	}
	if (inflated.byteLength !== expected) return null;

	const bpp = Math.max(1, (CHANNELS[image.colourType] * image.bitDepth) / 8);
	const out = new Uint8Array(stride * image.height);
	for (let y = 0; y < image.height; y++) {
		const filter = inflated[y * (stride + 1)];
		if (filter > 4) return null;
		const row = y * stride;
		const previous = row - stride;
		for (let i = 0; i < stride; i++) {
			const x = inflated[y * (stride + 1) + 1 + i];
			const a = i >= bpp ? out[row + i - bpp] : 0;
			const b = y > 0 ? out[previous + i] : 0;
			const c = y > 0 && i >= bpp ? out[previous + i - bpp] : 0;
			out[row + i] = (x + predict(filter, a, b, c)) & 0xff;
		}
	}
	return out;
}

function predict(filter: number, a: number, b: number, c: number): number {
	switch (filter) {
		case 1:
			return a;
		case 2:
			return b;
		case 3:
			return Math.floor((a + b) / 2);
		case 4: {
			const p = a + b - c;
			const pa = Math.abs(p - a);
			const pb = Math.abs(p - b);
			const pc = Math.abs(p - c);
			return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
		}
		default:
			return 0;
	}
}

/** Whether any pixel has a non-zero alpha. Only called for grey+alpha and RGBA, 8 or 16 bit. */
function hasInk(pixels: Uint8Array, image: Image): boolean {
	const sampleBytes = image.bitDepth / 8;
	const pixelBytes = CHANNELS[image.colourType] * sampleBytes;
	const alphaAt = pixelBytes - sampleBytes;
	for (let i = alphaAt; i < pixels.byteLength; i += pixelBytes) {
		if (pixels[i] !== 0 || (sampleBytes === 2 && pixels[i + 1] !== 0)) return true;
	}
	return false;
}
