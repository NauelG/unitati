import { describe, expect, it } from 'vitest';
import {
	calendarDayIn,
	decimalHours,
	formatElapsed,
	formatMinutes,
	MAX_ENTRY_MINUTES,
	parseDuration,
	suggestedMinutes
} from './time';

describe('parseDuration', () => {
	it.each([
		['1h 30m', 90],
		['1h30m', 90],
		['1h', 60],
		['45m', 45],
		['90m', 90],
		['1.5h', 90],
		['1,5h', 90],
		['.5h', 30],
		['0.25h', 15],
		['  2H  ', 120],
		['2h 0m', 120],
		['1 h', 60],
		['1h 59m', 119],
		['24h', 1440],
		['1440m', 1440]
	])('reads %j as %i minutes', (text, minutes) => {
		expect(parseDuration(text)).toBe(minutes);
	});

	it.each([
		'',
		'   ',
		'90',
		'1.5',
		'1:30',
		'abc',
		'1h 30',
		'30m 1h',
		'1.5h 30m',
		'-1h',
		'1h -5m',
		'0m',
		'0h',
		'0.001h',
		'1 hour',
		'1h30m5s',
		'1e3m',
		'2',
		'1h 90m',
		'1h 60m',
		'1h 75m',
		'25h',
		'1441m',
		'24h 1m',
		'150h'
	])('refuses %j', (text) => {
		expect(parseDuration(text)).toBeNull();
	});

	it('refuses a duration beyond one day', () => {
		expect(MAX_ENTRY_MINUTES).toBe(1440);
		expect(parseDuration(`${MAX_ENTRY_MINUTES}m`)).toBe(MAX_ENTRY_MINUTES);
		expect(parseDuration(`${MAX_ENTRY_MINUTES + 1}m`)).toBeNull();
		expect(parseDuration('99999999999999999999m')).toBeNull();
	});

	it('rounds decimal hours to the nearest minute', () => {
		expect(parseDuration('1.333h')).toBe(80);
	});
});

describe('formatMinutes', () => {
	it.each([
		[45, '45m'],
		[60, '1h'],
		[90, '1h 30m'],
		[605, '10h 5m']
	])('shows %i as %j, which parseDuration reads back', (minutes, text) => {
		expect(formatMinutes(minutes)).toBe(text);
		expect(parseDuration(text)).toBe(minutes);
	});
});

describe('decimalHours', () => {
	it('carries two places', () => {
		expect(decimalHours(90)).toBe('1.50');
		expect(decimalHours(20)).toBe('0.33');
	});
});

describe('formatElapsed', () => {
	it('shows hours and minutes of a running timer', () => {
		expect(formatElapsed(42 * 60_000)).toBe('00:42');
		expect(formatElapsed(125 * 60_000 + 59_000)).toBe('02:05');
		expect(formatElapsed(-5)).toBe('00:00');
	});
});

describe('suggestedMinutes', () => {
	const start = new Date('2026-10-25T10:00:00Z');

	it('rounds the elapsed time to the nearest minute', () => {
		expect(suggestedMinutes(start, new Date('2026-10-25T10:42:20Z'))).toBe(42);
		expect(suggestedMinutes(start, new Date('2026-10-25T10:42:40Z'))).toBe(43);
	});

	it('is never below one minute', () => {
		expect(suggestedMinutes(start, new Date('2026-10-25T10:00:10Z'))).toBe(1);
		expect(suggestedMinutes(start, start)).toBe(1);
	});
});

describe('calendarDayIn', () => {
	it('reads the day in the organisation zone, not in UTC', () => {
		const instant = new Date('2026-10-25T23:30:00Z');
		expect(calendarDayIn('UTC', instant)).toBe('2026-10-25');
		expect(calendarDayIn('Europe/Madrid', instant)).toBe('2026-10-26');
	});
});
