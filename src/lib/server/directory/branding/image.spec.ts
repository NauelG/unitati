import { createHash, randomBytes } from 'node:crypto';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import {
	LOCKUP_MAX,
	MARK_SIZE,
	MAX_INPUT_BYTES,
	deriveIcons,
	processUpload,
	type ProcessedImage
} from './image';

const enc = (text: string) => new TextEncoder().encode(text);
const dec = (data: Uint8Array) => new TextDecoder().decode(data);

/** A solid opaque rectangle of `inner` size centred on a transparent canvas. */
async function marginedPng(width: number, height: number, margin: number): Promise<Uint8Array> {
	const inner = await sharp({
		create: {
			width: width - margin * 2,
			height: height - margin * 2,
			channels: 4,
			background: { r: 200, g: 30, b: 30, alpha: 1 }
		}
	})
		.png()
		.toBuffer();
	return sharp({
		create: { width, height, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } }
	})
		.composite([{ input: inner, left: margin, top: margin }])
		.png()
		.toBuffer();
}

function solidPng(width: number, height: number): Promise<Uint8Array> {
	return sharp({
		create: { width, height, channels: 3, background: { r: 10, g: 120, b: 200 } }
	})
		.png()
		.toBuffer();
}

async function ok(slot: Parameters<typeof processUpload>[0], input: Uint8Array) {
	const outcome = await processUpload(slot, input);
	if (!outcome.ok) throw new Error(`expected success, got ${outcome.error}`);
	return outcome.value;
}

async function fails(slot: Parameters<typeof processUpload>[0], input: Uint8Array) {
	const outcome = await processUpload(slot, input);
	if (outcome.ok) throw new Error('expected a failure');
	return outcome.error;
}

describe('processUpload: raster', () => {
	it('trims the margin of a lockup, caps it at 960×120 and keeps the aspect ratio', async () => {
		const out = await ok('lockup', await marginedPng(2000, 600, 200));

		expect(out.contentType).toBe('image/webp');
		expect(out.height).toBeLessThanOrEqual(LOCKUP_MAX.height);
		expect(out.width).toBeLessThanOrEqual(LOCKUP_MAX.width);
		// The opaque rectangle is 1600×200 = 8:1, so a 120 px height gives ~960 px.
		expect(Math.abs(out.width! / out.height! - 8)).toBeLessThan(0.2);
		// Trimmed: no transparent border left.
		const { data, info } = await sharp(out.data).raw().ensureAlpha().toBuffer({
			resolveWithObject: true
		});
		expect(data[3]).toBe(255);
		expect(data[(info.width * info.height - 1) * 4 + 3]).toBe(255);
	});

	it('does not upscale a small lockup', async () => {
		const out = await ok('lockup', await solidPng(100, 30));

		expect(out.height).toBe(30);
		expect(out.width).toBe(100);
	});

	it('makes a mark a 512×512 square with transparent padding', async () => {
		const out = await ok('mark', await solidPng(1200, 800));

		expect(out.width).toBe(MARK_SIZE);
		expect(out.height).toBe(MARK_SIZE);
		const { data } = await sharp(out.data)
			.raw()
			.ensureAlpha()
			.toBuffer({ resolveWithObject: true });
		expect(data[3]).toBe(0); // top-left corner is padding
		expect(data[(256 * MARK_SIZE + 256) * 4 + 3]).toBe(255); // centre is the image
	});

	it('applies the EXIF orientation', async () => {
		const jpeg = await sharp({
			create: { width: 300, height: 100, channels: 3, background: { r: 1, g: 2, b: 3 } }
		})
			.jpeg()
			.withMetadata({ orientation: 6 })
			.toBuffer();
		const raw = await sharp(jpeg).metadata();
		expect(raw.width).toBe(300);

		const out = await ok('lockup', jpeg);

		// Rotated: 100 wide × 300 tall, then capped to a 120 px height.
		expect(out.width!).toBeLessThan(out.height!);
	});

	it('drops EXIF, ICC and XMP from the output', async () => {
		const png = await sharp({
			create: { width: 64, height: 64, channels: 3, background: { r: 9, g: 9, b: 9 } }
		})
			.withExif({ IFD0: { Copyright: 'secret' } })
			.withIccProfile('p3')
			.png()
			.toBuffer();

		const out = await ok('mark', png);
		const meta = await sharp(out.data).metadata();

		expect(meta.exif).toBeUndefined();
		expect(meta.icc).toBeUndefined();
		expect(meta.xmp).toBeUndefined();
	});

	it('keeps only the first frame of an animated WebP', async () => {
		const frames = await sharp(
			Buffer.concat([
				await sharp({ create: { width: 40, height: 40, channels: 3, background: '#f00' } })
					.raw()
					.toBuffer(),
				await sharp({ create: { width: 40, height: 40, channels: 3, background: '#00f' } })
					.raw()
					.toBuffer()
			]),
			{ raw: { width: 40, height: 80, channels: 3, pageHeight: 40 } }
		)
			.webp({ loop: 0, delay: [100, 100] })
			.toBuffer();
		expect((await sharp(frames, { animated: true }).metadata()).pages).toBe(2);

		const out = await ok('mark', frames);

		expect((await sharp(out.data, { animated: true }).metadata()).pages ?? 1).toBe(1);
	});

	it('rejects a raster with too many pixels', async () => {
		const huge = await sharp({
			create: { width: 8000, height: 6000, channels: 3, background: '#fff' }
		})
			.png({ compressionLevel: 9 })
			.toBuffer();
		expect(huge.length).toBeLessThan(MAX_INPUT_BYTES);

		expect(await fails('lockup', huge)).toBe('too-many-pixels');
	});

	it('rejects input over the byte limit before looking at it', async () => {
		expect(await fails('lockup', new Uint8Array(MAX_INPUT_BYTES + 1))).toBe('too-large');
	});

	it('rejects types it does not accept, by content', async () => {
		expect(await fails('mark', enc('GIF89a-and-then-some-bytes'))).toBe('unsupported-type');
		expect(await fails('mark', enc('%PDF-1.7 rest of it'))).toBe('unsupported-type');
		expect(await fails('mark', randomBytes(256))).toBe('unsupported-type');
	});

	it('rejects a truncated PNG as an invalid image', async () => {
		const png = await solidPng(200, 200);
		expect(await fails('mark', png.subarray(0, 40))).toBe('invalid-image');
	});

	it('reports a sha256 of the stored bytes', async () => {
		const out = await ok('mark', await solidPng(50, 50));

		expect(out.sha256).toBe(createHash('sha256').update(out.data).digest('hex'));
	});
});

const DIRTY_SVG = `<?xml version="1.0"?>
<!-- a comment -->
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="200" height="50" viewBox="0 0 200 50" onload="alert(1)">
  <script>alert(1)</script>
  <foreignObject width="10" height="10"><div xmlns="http://www.w3.org/1999/xhtml">hi</div></foreignObject>
  <a href="https://evil.example/"><rect id="shape" width="100" height="50" fill="#c81e1e"/></a>
  <image xlink:href="http://evil.example/x.png" width="10" height="10"/>
  <circle cx="150" cy="25" r="20" style="background:url(http://evil.example/y.png)" fill="#1e1ec8"/>
</svg>`;

describe('processUpload: SVG', () => {
	it('removes scripts, handlers, foreignObject and external references, keeping the shapes', async () => {
		const out = await ok('lockup', enc(DIRTY_SVG));
		const text = dec(out.data);

		expect(out.contentType).toBe('image/svg+xml');
		expect(out.width).toBeNull();
		expect(out.height).toBeNull();
		expect(text).toContain('viewBox');
		expect(text).toContain('<path');
		expect(text).toContain('<circle');
		expect(text).not.toMatch(/<script/i);
		expect(text).not.toMatch(/\son\w+\s*=/i);
		expect(text).not.toMatch(/foreignObject/i);
		expect(text).not.toMatch(/javascript:/i);
		expect(text).not.toContain('evil.example');
		expect(text).not.toMatch(/href="https/);
	});

	it('turns width and height into a viewBox', async () => {
		const out = await ok(
			'mark',
			enc(
				'<svg xmlns="http://www.w3.org/2000/svg" width="40" height="20"><rect width="40" height="20"/></svg>'
			)
		);

		expect(dec(out.data)).toMatch(/viewBox="0 0 40 20"/);
		expect(dec(out.data)).not.toMatch(/\swidth="40"\s+height="20"\s+viewBox|<svg[^>]*\swidth=/);
	});

	it('keeps an embedded data:image reference', async () => {
		const png = Buffer.from(await solidPng(4, 4)).toString('base64');
		const out = await ok(
			'mark',
			enc(
				`<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 4 4"><image xlink:href="data:image/png;base64,${png}" width="4" height="4"/></svg>`
			)
		);

		expect(dec(out.data)).toContain('data:image/png;base64');
	});

	it('rejects a DOCTYPE or ENTITY', async () => {
		const xxe = `<?xml version="1.0"?><!DOCTYPE svg [<!ENTITY x "boom">]><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"><text>&x;</text></svg>`;

		expect(await fails('mark', enc(xxe))).toBe('invalid-svg');
	});

	it('rejects malformed SVG', async () => {
		expect(await fails('mark', enc('<svg xmlns="http://www.w3.org/2000/svg"><rect></svg>'))).toBe(
			'invalid-svg'
		);
	});

	it('treats a document whose root is not <svg> as an unsupported type', async () => {
		expect(await fails('mark', enc('<html><body>hi</body></html>'))).toBe('unsupported-type');
	});

	it('rejects an SVG that embeds a large bitmap', async () => {
		const big = randomBytes(400 * 1024).toString('base64');
		const svg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 10 10"><image xlink:href="data:image/png;base64,${big}" width="10" height="10"/></svg>`;

		expect(await fails('lockup', enc(svg))).toBe('output-too-large');
	});
});

describe('deriveIcons', () => {
	async function check(mark: ProcessedImage) {
		const { favicon, apple_touch } = await deriveIcons(mark);

		expect(favicon.contentType).toBe('image/png');
		expect([favicon.width, favicon.height]).toEqual([64, 64]);
		expect(apple_touch.contentType).toBe('image/png');
		expect([apple_touch.width, apple_touch.height]).toEqual([180, 180]);
		expect(apple_touch.sha256).toBe(createHash('sha256').update(apple_touch.data).digest('hex'));

		const { data } = await sharp(apple_touch.data)
			.raw()
			.ensureAlpha()
			.toBuffer({ resolveWithObject: true });
		expect([...data.subarray(0, 4)]).toEqual([255, 255, 255, 255]);
	}

	it('derives a favicon and an opaque apple-touch icon from a raster mark', async () => {
		await check(await ok('mark', await solidPng(300, 300)));
	});

	it('derives the same sizes from an SVG mark', async () => {
		await check(
			await ok(
				'mark',
				enc(
					'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><circle cx="5" cy="5" r="5" fill="#c81e1e"/></svg>'
				)
			)
		);
	});
});
