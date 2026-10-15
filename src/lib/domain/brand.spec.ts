import { describe, expect, it } from 'vitest';
import { graphemeCount, monogramLetter } from './brand';

describe('monogramLetter', () => {
	it('uppercases the first letter', () => {
		expect(monogramLetter('acme')).toBe('A');
	});

	it('keeps an accented letter whole', () => {
		expect(monogramLetter('ñandú')).toBe('Ñ');
	});

	it('keeps a ZWJ emoji sequence whole', () => {
		expect(monogramLetter('👩‍💻 Dev')).toBe('👩‍💻');
	});
});

describe('graphemeCount', () => {
	it('counts user-perceived characters, not UTF-16 units', () => {
		expect(graphemeCount('👩‍💻'.repeat(3))).toBe(3);
		expect(graphemeCount('abc')).toBe(3);
	});
});
