import { describe, expect, it } from 'vitest';
import { getLocale } from '#lib/paraglide/runtime.js';
import { formatDateTime, formatDay, formatRelative } from './format-date';

describe('formatDateTime', () => {
	const instant = new Date('2030-01-31T23:30:00Z');

	it('is deterministic for a fixed time zone', () => {
		const madrid = formatDateTime(instant, { timeZone: 'Europe/Madrid' });
		const lima = formatDateTime(instant, { timeZone: 'America/Lima' });

		expect(madrid).toBe(formatDateTime(instant, { timeZone: 'Europe/Madrid' }));
		// Madrid is past midnight (1 Feb), Lima is still on the 31st: the zone changes the text.
		expect(madrid).toContain('1');
		expect(madrid).not.toBe(lima);
	});

	it('shows the date and the time', () => {
		const text = formatDateTime(instant, { timeZone: 'UTC' });

		expect(text).toContain('2030');
		expect(text).toMatch(/23:30|11:30/);
	});

	it('renders the same text for server and first client render, whatever the process zone', () => {
		// Before hydration there is no zone to ask the browser for, so both sides
		// must agree on one: UTC.
		expect(formatDateTime(instant)).toBe(formatDateTime(instant, { timeZone: 'UTC' }));
	});
});

describe('formatRelative', () => {
	const now = new Date('2030-01-31T12:00:00Z');
	const ago = (ms: number) => new Date(now.getTime() - ms);
	const MINUTE = 60_000;
	const HOUR = 60 * MINUTE;
	const DAY = 24 * HOUR;

	it('says how long ago in the largest whole unit', () => {
		expect(formatRelative(ago(5 * MINUTE), now)).toBe(
			new Intl.RelativeTimeFormat(getLocale(), { numeric: 'auto' }).format(-5, 'minute')
		);
		expect(formatRelative(ago(3 * HOUR), now)).toContain('3');
		expect(formatRelative(ago(3 * DAY), now)).toContain('3');
	});

	it('treats under a minute as now', () => {
		expect(formatRelative(ago(10_000), now)).toBe(
			new Intl.RelativeTimeFormat(getLocale(), { numeric: 'auto' }).format(0, 'minute')
		);
	});

	it('falls back to the absolute day past a month', () => {
		expect(formatRelative(ago(45 * DAY), now)).toBe(formatDay('2029-12-17'));
	});
});
