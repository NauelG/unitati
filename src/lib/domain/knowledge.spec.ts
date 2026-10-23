import { describe, expect, it } from 'vitest';
import { pageTagsIn } from './knowledge';

describe('pageTagsIn', () => {
	it('finds the canonical links, upper-cased, once each and in order', () => {
		const body =
			'See [A](/knowledge/DOC-0012), [b](/knowledge/doc-0003#steps) and [A again](/knowledge/DOC-0012).';

		expect(pageTagsIn(body)).toEqual(['DOC-0012', 'DOC-0003']);
	});

	it('ignores plain mentions, other hosts and other routes', () => {
		const body =
			'DOC-0012 is mentioned, [x](https://example.com/knowledge/DOC-0012), [y](/service-desk/DOC-0012), [z](/knowledge/DOC-1).';

		expect(pageTagsIn(body)).toEqual([]);
	});
});
