import { describe, expect, it } from 'vitest';
import { parseBoardPreference, resolveView, serializeBoardPreference } from './board-preference.js';

describe('resolveView', () => {
	it('lets an explicit ?view= win over the stored choice', () => {
		expect(resolveView('board', 'list')).toBe('board');
		expect(resolveView('list', 'board')).toBe('list');
	});

	it('falls back to the stored choice, then to the board', () => {
		expect(resolveView(null, 'list')).toBe('list');
		expect(resolveView(null, null)).toBe('board');
	});

	it('treats a view it does not know as absent', () => {
		expect(resolveView('gantt', 'list')).toBe('list');
		expect(resolveView('gantt', null)).toBe('board');
	});
});

describe('the cookie value', () => {
	it('survives a round trip', () => {
		const preference = { view: 'list' as const, states: { a: 'collapsed' as const } };

		expect(parseBoardPreference(serializeBoardPreference(preference))).toEqual(preference);
	});

	it('reads nothing as no preference', () => {
		expect(parseBoardPreference(undefined)).toEqual({ view: null, states: {} });
		expect(parseBoardPreference('')).toEqual({ view: null, states: {} });
	});
});
