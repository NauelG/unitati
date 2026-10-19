import { describe, expect, it } from 'vitest';
import { parseIsoDate, toIsoDate } from './calendar-date';

describe('calendar-date', () => {
	it('round-trips a valid ISO date', () => {
		const date = parseIsoDate('2026-11-30');
		expect(date?.year).toBe(2026);
		expect(date?.month).toBe(11);
		expect(date?.day).toBe(30);
		expect(toIsoDate(date)).toBe('2026-11-30');
	});

	it('zero-pads month and day', () => {
		expect(toIsoDate(parseIsoDate('2026-01-05'))).toBe('2026-01-05');
	});

	it.each([null, undefined, ''])('parses %s as no date', (input) => {
		expect(parseIsoDate(input)).toBeUndefined();
	});

	it.each(['not-a-date', '2026-13-01', '2026-02-30', '30/11/2026', '2026-1-5'])(
		'rejects invalid input %s',
		(input) => {
			expect(parseIsoDate(input)).toBeUndefined();
		}
	);

	it('formats no date as an empty string', () => {
		expect(toIsoDate(undefined)).toBe('');
		expect(toIsoDate(null)).toBe('');
	});
});
