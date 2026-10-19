import { describe, expect, it } from 'vitest';
import {
	addAttachments,
	formatBytes,
	MAX_ATTACHMENT_BYTES,
	MAX_ATTACHMENTS_PER_COMMENT
} from './attachments.js';

describe('formatBytes', () => {
	it('prints bytes below 1 KB', () => {
		expect(formatBytes(0)).toBe('0 B');
		expect(formatBytes(1023)).toBe('1023 B');
	});

	it('prints one decimal under 10 and none above', () => {
		expect(formatBytes(1536)).toBe('1.5 KB');
		expect(formatBytes(20 * 1024)).toBe('20 KB');
		expect(formatBytes(5 * 1024 * 1024)).toBe('5 MB');
		expect(formatBytes(10 * 1024 * 1024)).toBe('10 MB');
	});

	it('climbs to GB and stops there', () => {
		expect(formatBytes(2 * 1024 ** 3)).toBe('2 GB');
		expect(formatBytes(2048 * 1024 ** 3)).toBe('2048 GB');
	});
});

describe('addAttachments', () => {
	const file = (size = 1) => ({ size });

	it('keeps everything that fits', () => {
		const result = addAttachments([file()], [file(), file()]);
		expect(result.files).toHaveLength(3);
		expect(result.tooLarge).toHaveLength(0);
		expect(result.overflow).toHaveLength(0);
	});

	it('rejects files over the size limit and keeps the others', () => {
		const big = file(MAX_ATTACHMENT_BYTES + 1);
		const result = addAttachments([], [file(), big]);
		expect(result.files).toHaveLength(1);
		expect(result.tooLarge).toEqual([big]);
	});

	it('accepts a file of exactly the limit', () => {
		expect(addAttachments([], [file(MAX_ATTACHMENT_BYTES)]).files).toHaveLength(1);
	});

	it('rejects files beyond the count limit', () => {
		const current = Array.from({ length: MAX_ATTACHMENTS_PER_COMMENT }, () => file());
		const extra = file();
		const result = addAttachments(current, [extra]);
		expect(result.files).toHaveLength(MAX_ATTACHMENTS_PER_COMMENT);
		expect(result.overflow).toEqual([extra]);
	});
});
