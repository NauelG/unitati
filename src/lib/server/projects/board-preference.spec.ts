import { describe, expect, it } from 'vitest';
import { readBoardPreference } from './board-preference.js';

const todo = '11111111-1111-4111-8111-111111111111';
const done = '22222222-2222-4222-8222-222222222222';
const gone = '99999999-9999-4999-8999-999999999999';
const catalogue = [todo, done];

const cookie = (value: unknown) => JSON.stringify(value);

describe('readBoardPreference', () => {
	it('reads a well-formed preference as it is', () => {
		const raw = cookie({ view: 'list', states: { [todo]: 'expanded', [done]: 'collapsed' } });

		expect(readBoardPreference(raw, catalogue)).toEqual({
			view: 'list',
			states: { [todo]: 'expanded', [done]: 'collapsed' }
		});
	});

	it('reads a missing cookie as no preference', () => {
		expect(readBoardPreference(undefined, catalogue)).toEqual({ view: null, states: {} });
	});

	it.each([
		['not JSON', '{nope'],
		['JSON of another shape', cookie([1, 2])],
		['an unknown view', cookie({ view: 'gantt', states: {} })],
		['an unknown state value', cookie({ view: null, states: { [todo]: 'hidden' } })],
		['no states', cookie({ view: 'board' })]
	])('reads %s as no preference instead of failing', (_label, raw) => {
		expect(readBoardPreference(raw, catalogue)).toEqual({ view: null, states: {} });
	});

	it('drops a state the organisation no longer has', () => {
		const raw = cookie({ view: 'board', states: { [todo]: 'collapsed', [gone]: 'collapsed' } });

		expect(readBoardPreference(raw, catalogue)).toEqual({
			view: 'board',
			states: { [todo]: 'collapsed' }
		});
	});

	it('never keeps more entries than the catalogue has states', () => {
		const raw = cookie({
			view: null,
			states: { [todo]: 'collapsed', [done]: 'collapsed', [gone]: 'collapsed' }
		});

		expect(Object.keys(readBoardPreference(raw, [todo]).states)).toEqual([todo]);
		expect(readBoardPreference(raw, []).states).toEqual({});
	});
});
