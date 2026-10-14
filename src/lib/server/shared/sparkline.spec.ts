import { describe, expect, it } from 'vitest';
import { isEmptySeries } from '#lib/domain/sparkline.js';
import {
	densifyDailyCounts,
	sparklineSince,
	sparklineWindow,
	utcDayKey,
	SPARKLINE_MAX_DAYS,
	SPARKLINE_MIN_DAYS
} from './sparkline';

/** Mid-afternoon, so a day-boundary bug shows up as an off-by-one rather than a coin flip. */
const NOW = new Date('2026-03-15T14:32:09.123Z');

describe('sparklineWindow', () => {
	it('passes a sane window through untouched', () => {
		expect(sparklineWindow(7)).toBe(7);
		expect(sparklineWindow(30)).toBe(30);
	});

	it('clamps a window nothing could draw', () => {
		expect(sparklineWindow(1)).toBe(SPARKLINE_MIN_DAYS);
		expect(sparklineWindow(0)).toBe(SPARKLINE_MIN_DAYS);
		expect(sparklineWindow(-90)).toBe(SPARKLINE_MIN_DAYS);
	});

	it('caps a window nobody could read', () => {
		expect(sparklineWindow(3650)).toBe(SPARKLINE_MAX_DAYS);
	});

	it('survives the values a query string can actually produce', () => {
		expect(sparklineWindow(Number.NaN)).toBe(SPARKLINE_MIN_DAYS);
		expect(sparklineWindow(Number.POSITIVE_INFINITY)).toBe(SPARKLINE_MIN_DAYS);
		expect(sparklineWindow(7.9)).toBe(7);
	});
});

describe('sparklineSince', () => {
	it('starts at midnight UTC, counting today as one of the buckets', () => {
		// 7 days ending 15 March starts on the 9th, not the 8th.
		expect(sparklineSince(NOW, 7).toISOString()).toBe('2026-03-09T00:00:00.000Z');
	});

	it('discards the time of day, so two calls on the same day agree', () => {
		const earlier = sparklineSince(new Date('2026-03-15T00:00:00.000Z'), 7);
		const later = sparklineSince(new Date('2026-03-15T23:59:59.999Z'), 7);
		expect(earlier.toISOString()).toBe(later.toISOString());
	});

	it('crosses a month boundary', () => {
		expect(sparklineSince(new Date('2026-03-02T09:00:00Z'), 7).toISOString()).toBe(
			'2026-02-24T00:00:00.000Z'
		);
	});

	it('crosses a leap day', () => {
		expect(sparklineSince(new Date('2028-03-01T09:00:00Z'), 3).toISOString()).toBe(
			'2028-02-28T00:00:00.000Z'
		);
	});
});

describe('utcDayKey', () => {
	it('formats as YYYY-MM-DD', () => {
		expect(utcDayKey(NOW)).toBe('2026-03-15');
	});

	it('reads the UTC day, not the host’s', () => {
		// 00:30 on the 16th in Madrid (UTC+1) is still the 15th in UTC. The
		// bucket boundary has to be the one the SQL used, or a row lands in a
		// day the series does not contain.
		expect(utcDayKey(new Date('2026-03-15T23:30:00.000Z'))).toBe('2026-03-15');
	});
});

describe('densifyDailyCounts', () => {
	it('returns exactly one point per requested day, in ascending order', () => {
		const series = densifyDailyCounts([], NOW, 7);

		expect(series).toHaveLength(7);
		expect(series.map((point) => point.date)).toEqual([
			'2026-03-09',
			'2026-03-10',
			'2026-03-11',
			'2026-03-12',
			'2026-03-13',
			'2026-03-14',
			'2026-03-15'
		]);
	});

	it('fills a day with no rows with a zero rather than omitting it', () => {
		const series = densifyDailyCounts(
			[
				{ day: '2026-03-09', count: 4 },
				{ day: '2026-03-15', count: 2 }
			],
			NOW,
			7
		);

		// The five silent days in the middle are the whole point: without them a
		// line would run straight from 4 to 2 and report a gentle decline across
		// a week in which nothing happened at all.
		expect(series.map((point) => point.count)).toEqual([4, 0, 0, 0, 0, 0, 2]);
	});

	it('ignores rows outside the window instead of lengthening the series', () => {
		const series = densifyDailyCounts(
			[
				{ day: '2020-01-01', count: 99 },
				{ day: '2026-03-14', count: 1 }
			],
			NOW,
			7
		);

		expect(series).toHaveLength(7);
		expect(series.at(-2)).toEqual({ date: '2026-03-14', count: 1 });
		expect(series.some((point) => point.count === 99)).toBe(false);
	});

	it('clamps the window the same way sparklineSince does', () => {
		expect(densifyDailyCounts([], NOW, 0)).toHaveLength(SPARKLINE_MIN_DAYS);
		expect(densifyDailyCounts([], NOW, 10_000)).toHaveLength(SPARKLINE_MAX_DAYS);
	});

	it('keeps the series aligned with its own start date', () => {
		const series = densifyDailyCounts([], NOW, 30);
		expect(series[0].date).toBe(utcDayKey(sparklineSince(NOW, 30)));
		expect(series.at(-1)?.date).toBe(utcDayKey(NOW));
	});
});

describe('isEmptySeries', () => {
	it('treats all-zero as empty, which is what sends a chart to its empty state', () => {
		expect(isEmptySeries(densifyDailyCounts([], NOW, 7))).toBe(true);
	});

	it('treats a single non-zero day as having data', () => {
		expect(isEmptySeries(densifyDailyCounts([{ day: '2026-03-12', count: 1 }], NOW, 7))).toBe(
			false
		);
	});

	it('an empty array has nothing to draw', () => {
		expect(isEmptySeries([])).toBe(true);
	});
});
