import { describe, expect, it } from 'vitest';
import { formatDateTime } from './format-date';

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
