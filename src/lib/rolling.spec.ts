import { describe, expect, it } from 'vitest';
import { countToken, rollingPlural, splitRolling } from './rolling.js';

describe('splitRolling', () => {
	it('returns plain text untouched', () => {
		expect(splitRolling('Sin tickets', [])).toEqual(['Sin tickets']);
	});

	it('swaps a count token for its number, keeping the words around it', () => {
		expect(splitRolling(`${countToken(0)} sin asignar`, [3])).toEqual([3, ' sin asignar']);
	});

	it('handles several counts in one sentence, in the order they appear', () => {
		const text = `${countToken(0)} abiertos · ${countToken(1)} esperando`;
		expect(splitRolling(text, [12, 2])).toEqual([12, ' abiertos · ', 2, ' esperando']);
	});

	it('is order-independent: the token index picks the count, not its position', () => {
		expect(splitRolling(`${countToken(1)} y ${countToken(0)}`, [5, 9])).toEqual([9, ' y ', 5]);
	});

	it('leaves a token with no matching count as visible text instead of dropping it', () => {
		expect(splitRolling(`a ${countToken(4)} b`, [1])).toEqual([`a ${countToken(4)} b`]);
	});
});

describe('rollingPlural', () => {
	const one = () => '1 activo';
	const other = ({ count }: { count: string }) => `${count} activos`;

	it('keeps the number in the same slot across the singular/plural switch', () => {
		const single = splitRolling(rollingPlural(1, one, other, 0), [1]);
		const many = splitRolling(rollingPlural(3, one, other, 0), [3]);

		expect(single).toEqual([1, ' activo']);
		expect(many).toEqual([3, ' activos']);
	});
});
