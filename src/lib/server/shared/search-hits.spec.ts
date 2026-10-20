import { describe, expect, it } from 'vitest';
import { parseSearchTerm } from './search-hits';

describe('parseSearchTerm', () => {
	it('keeps a bare tag as typed', () => {
		expect(parseSearchTerm(' AST-0001 ')?.raw).toBe('AST-0001');
	});

	it('reads the code out of a scanned label URL, whatever the host', () => {
		const term = parseSearchTerm('https://anything.example/s/AST-0001');
		expect(term?.raw).toBe('AST-0001');
		expect(term?.tsquery).toBe('AST:* & 0001:*');
	});
});
