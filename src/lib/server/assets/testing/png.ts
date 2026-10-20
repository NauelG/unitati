import { crc32, deflateSync } from 'node:zlib';

/**
 * Builds a real RGBA PNG the way a browser's encoder would, for the signature
 * specs: `filter` is the PNG row filter used on every row, `interlace` the IHDR
 * flag (the bytes stay non-interlaced, which is enough to prove it is refused).
 */

type Rgba = [number, number, number, number];

export function png(
	width: number,
	height: number,
	pixel: (x: number, y: number) => Rgba,
	options: { filter?: number; interlace?: number } = {}
): Uint8Array {
	const filter = options.filter ?? 0;
	const stride = width * 4;
	const raw = Buffer.alloc((stride + 1) * height);
	let previous = Buffer.alloc(stride);
	for (let y = 0; y < height; y++) {
		const row = Buffer.alloc(stride);
		for (let x = 0; x < width; x++) row.set(pixel(x, y), x * 4);
		raw[y * (stride + 1)] = filter;
		for (let i = 0; i < stride; i++) {
			const left = i >= 4 ? row[i - 4] : 0;
			const up = previous[i];
			const predicted = filter === 1 ? left : filter === 2 ? up : 0;
			raw[y * (stride + 1) + 1 + i] = (row[i] - predicted) & 0xff;
		}
		previous = row;
	}

	const chunk = (type: string, data: Buffer) => {
		const length = Buffer.alloc(4);
		length.writeUInt32BE(data.length);
		const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
		const crc = Buffer.alloc(4);
		crc.writeUInt32BE(crc32(body));
		return Buffer.concat([length, body, crc]);
	};
	const header = Buffer.alloc(13);
	header.writeUInt32BE(width, 0);
	header.writeUInt32BE(height, 4);
	header[8] = 8; // bit depth
	header[9] = 6; // RGBA
	header[12] = options.interlace ?? 0;

	return new Uint8Array(
		Buffer.concat([
			Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
			chunk('IHDR', header),
			chunk('IDAT', deflateSync(raw)),
			chunk('IEND', Buffer.alloc(0))
		])
	);
}

export const transparent = (): Rgba => [0, 0, 0, 0];

/** One black diagonal: the smallest thing that counts as drawn. */
export const stroke = (x: number, y: number): Rgba => (x === y ? [0, 0, 0, 255] : [0, 0, 0, 0]);

/** A small drawn signature. */
export const drawnSignature = (): Uint8Array => png(40, 20, stroke);
