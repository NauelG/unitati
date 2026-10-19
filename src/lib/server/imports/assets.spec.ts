import { describe, expect, it } from 'vitest';
import { stateValueSuggestions, suggestState } from './assets';

describe('suggestState', () => {
	it('strips a trailing parenthesis, as Snipe-IT renders its status labels', () => {
		expect(suggestState('Ready to Deploy (deployable)')).toBe('in_stock');
	});

	it.each([
		['Pending', 'in_repair'],
		['Archived', 'retired'],
		['Deployed', 'in_use'],
		['En almacén', 'in_stock'],
		['  AVERIADO ', 'in_repair'],
		['Baja', 'retired']
	])('%s → %s', (raw, expected) => {
		expect(suggestState(raw)).toBe(expected);
	});

	it('suggests nothing for a value it does not know', () => {
		expect(suggestState('Lent to the CEO')).toBeNull();
	});
});

describe('stateValueSuggestions', () => {
	const csv = (rows: string[]) => new TextEncoder().encode(['Status,Name', ...rows].join('\n'));

	it('lists the distinct non-empty values of each column with a suggestion', () => {
		const suggestions = stateValueSuggestions(
			csv(['Pending,a', 'Archived,b', 'Pending,c', ',d', 'Odd,e'])
		);
		expect(suggestions.Status).toEqual([
			{ value: 'Pending', suggested: 'in_repair' },
			{ value: 'Archived', suggested: 'retired' },
			{ value: 'Odd', suggested: null }
		]);
	});

	it('leaves out a column with more than 50 distinct values: it is not a state', () => {
		const rows = Array.from({ length: 51 }, (_, i) => `x,name ${i}`);
		expect(stateValueSuggestions(csv(rows)).Name).toBeUndefined();
		expect(stateValueSuggestions(csv(rows)).Status).toHaveLength(1);
	});
});
