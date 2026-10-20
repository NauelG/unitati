import { describe, expect, it } from 'vitest';
import {
	LABEL_FORMATS,
	LABEL_FORMAT_KEYS,
	MAX_LABELS,
	labelsPerSheet,
	layoutSheets,
	parseFormat,
	parseSkip
} from './label-formats';

describe('LABEL_FORMATS', () => {
	it('fits every grid inside its page', () => {
		for (const key of LABEL_FORMAT_KEYS) {
			const format = LABEL_FORMATS[key];
			const usedWidth = format.columns * format.cellMm.width;
			const usedHeight = format.rows * format.cellMm.height + format.marginTopMm * 2;
			expect(usedWidth).toBeLessThanOrEqual(format.pageMm.width);
			expect(usedHeight).toBeLessThanOrEqual(format.pageMm.height);
		}
	});

	it('holds 24, 40 and 1 labels per sheet', () => {
		expect(labelsPerSheet('a4-3x8')).toBe(24);
		expect(labelsPerSheet('a4-4x10')).toBe(40);
		expect(labelsPerSheet('roll-62x29')).toBe(1);
	});

	it('prints the asset name on the large format only', () => {
		expect(LABEL_FORMATS['a4-3x8'].showName).toBe(true);
		expect(LABEL_FORMATS['a4-4x10'].showName).toBe(false);
		expect(LABEL_FORMATS['roll-62x29'].showName).toBe(false);
	});

	it('only the sheets accept a start position', () => {
		expect(LABEL_FORMATS['a4-3x8'].sheet).toBe(true);
		expect(LABEL_FORMATS['roll-62x29'].sheet).toBe(false);
	});
});

describe('layoutSheets', () => {
	const tags = (count: number) => Array.from({ length: count }, (_, i) => `T-${i + 1}`);

	it('starts the first sheet at the skipped cell and spills to a second sheet', () => {
		const sheets = layoutSheets('a4-3x8', tags(30), 5);

		expect(sheets).toHaveLength(2);
		expect(sheets[0].slice(0, 5)).toEqual([null, null, null, null, null]);
		expect(sheets[0][5]).toBe('T-1');
		expect(sheets[0]).toHaveLength(24);
		// 24 - 5 = 19 on the first sheet, 11 left for the second, which starts at cell 1.
		expect(sheets[1][0]).toBe('T-20');
		expect(sheets[1].filter((cell) => cell !== null)).toHaveLength(11);
	});

	it('does not pad the last sheet with blank cells past the final label', () => {
		const sheets = layoutSheets('a4-3x8', tags(3), 0);
		expect(sheets).toHaveLength(1);
		expect(sheets[0]).toEqual(['T-1', 'T-2', 'T-3']);
	});

	it('puts one label on each page of the roll and ignores skip', () => {
		const sheets = layoutSheets('roll-62x29', tags(3), 7);
		expect(sheets).toEqual([['T-1'], ['T-2'], ['T-3']]);
	});

	it('is empty without labels', () => {
		expect(layoutSheets('a4-3x8', [], 0)).toEqual([]);
	});
});

describe('parseFormat', () => {
	it('defaults to the 3 x 8 sheet', () => {
		expect(parseFormat(null)).toBe('a4-3x8');
		expect(parseFormat('nonsense')).toBe('a4-3x8');
	});

	it('accepts the three formats', () => {
		expect(parseFormat('a4-4x10')).toBe('a4-4x10');
		expect(parseFormat('roll-62x29')).toBe('roll-62x29');
	});
});

describe('parseSkip', () => {
	it('reads a non-negative integer below the labels per sheet', () => {
		expect(parseSkip('5', 'a4-3x8')).toBe(5);
		expect(parseSkip('23', 'a4-3x8')).toBe(23);
	});

	it('falls back to zero for anything else', () => {
		expect(parseSkip(null, 'a4-3x8')).toBe(0);
		expect(parseSkip('-1', 'a4-3x8')).toBe(0);
		expect(parseSkip('24', 'a4-3x8')).toBe(0);
		expect(parseSkip('2.5', 'a4-3x8')).toBe(0);
		expect(parseSkip('abc', 'a4-3x8')).toBe(0);
	});

	it('ignores skip on the roll', () => {
		expect(parseSkip('3', 'roll-62x29')).toBe(0);
	});
});

describe('MAX_LABELS', () => {
	it('is 500', () => {
		expect(MAX_LABELS).toBe(500);
	});
});
