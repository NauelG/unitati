import jsQR from 'jsqr';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { signingLinkQr } from './handover-qr';

/**
 * #278: the QR code shown for in-person signing. Decoded with an independent
 * reader, not compared with what the encoder would produce, so the spec proves
 * a phone reads the link and not merely that the encoder ran.
 */

async function decode(svg: string): Promise<string | null> {
	const { data, info } = await sharp(Buffer.from(svg), { density: 300 })
		.resize(600, 600, { fit: 'contain', background: '#ffffff' })
		.flatten({ background: '#ffffff' })
		.ensureAlpha()
		.raw()
		.toBuffer({ resolveWithObject: true });
	return jsQR(new Uint8ClampedArray(data), info.width, info.height)?.data ?? null;
}

describe('signingLinkQr', () => {
	it('encodes exactly the signing URL', async () => {
		const link = 'https://unitati.example.com/handover/kB3x_9-QnVZ2mRt8yLwP0aHcJdE5fG7iK1oS4uX6vYz';

		expect(await decode(await signingLinkQr(link))).toBe(link);
	});
});
