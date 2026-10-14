import { describe, expect, it } from 'vitest';
import { legacyCatalogueRedirect } from './legacy-redirects.js';

const target = (path: string) => legacyCatalogueRedirect(new URL(`http://localhost${path}`));

describe('legacyCatalogueRedirect', () => {
	it.each([
		['/assets/categories', '/settings/assets/categories'],
		['/assets/manufacturers', '/settings/assets/manufacturers'],
		['/assets/models', '/settings/assets/models'],
		['/service-desk/queues', '/settings/service-desk/queues']
	])('sends %s to %s', (from, to) => {
		expect(target(from)).toBe(to);
	});

	it('keeps the query string', () => {
		expect(target('/assets/models?q=dell&page=2')).toBe('/settings/assets/models?q=dell&page=2');
	});

	it('keeps sub-paths and a trailing slash', () => {
		expect(target('/assets/categories/')).toBe('/settings/assets/categories/');
		expect(target('/service-desk/queues/abc/edit?x=1')).toBe(
			'/settings/service-desk/queues/abc/edit?x=1'
		);
	});

	it('leaves everything else alone', () => {
		expect(target('/assets')).toBeNull();
		expect(target('/assets/new')).toBeNull();
		expect(target('/assets/categoriesx')).toBeNull();
		expect(target('/service-desk/new')).toBeNull();
		expect(target('/settings/assets/categories')).toBeNull();
	});
});
