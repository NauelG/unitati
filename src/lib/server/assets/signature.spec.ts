import { describe, expect, it } from 'vitest';
import { MAX_SIGNATURE_BYTES, signatureProblem } from './signature';
import { png, stroke, transparent } from './testing/png';

describe('signatureProblem', () => {
	it('accepts a drawn signature, whatever filter the encoder chose', () => {
		for (const filter of [0, 1, 2]) {
			expect(signatureProblem(png(40, 20, stroke, { filter }))).toBeNull();
		}
	});

	it('refuses a missing or empty upload', () => {
		expect(signatureProblem(null)).toBe('missing');
		expect(signatureProblem(new Uint8Array())).toBe('missing');
	});

	it('refuses an untouched, fully transparent canvas', () => {
		expect(signatureProblem(png(40, 20, transparent))).toBe('blank');
		expect(signatureProblem(png(40, 20, transparent, { filter: 1 }))).toBe('blank');
	});

	it('refuses anything that is not a PNG', () => {
		expect(signatureProblem(new TextEncoder().encode('GIF89a not a png'))).toBe('not_png');
		const truncated = png(40, 20, stroke).slice(0, 40);
		expect(signatureProblem(truncated)).toBe('not_png');
		expect(signatureProblem(png(40, 20, stroke, { interlace: 1 }))).toBe('not_png');
	});

	it('refuses more than 200 KB', () => {
		const big = new Uint8Array(MAX_SIGNATURE_BYTES + 1);
		big.set(png(4, 4, stroke));
		expect(signatureProblem(big)).toBe('too_large');
		expect(MAX_SIGNATURE_BYTES).toBe(200 * 1024);
	});
});
