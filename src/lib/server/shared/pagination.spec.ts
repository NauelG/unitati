import { describe, expect, it } from 'vitest';
import { DEFAULT_PER_PAGE, MAX_PER_PAGE, page, pageWindow, pageWindowFrom } from './pagination';

describe('pageWindow', () => {
	it('defaults to the first page', () => {
		expect(pageWindow()).toEqual({
			page: 1,
			perPage: DEFAULT_PER_PAGE,
			limit: DEFAULT_PER_PAGE,
			offset: 0
		});
	});

	it('turns a page number into an offset', () => {
		expect(pageWindow({ page: 3, perPage: 20 })).toEqual({
			page: 3,
			perPage: 20,
			limit: 20,
			offset: 40
		});
	});

	it('caps perPage, so a query string cannot ask for the whole table', () => {
		expect(pageWindow({ perPage: 100_000 }).perPage).toBe(MAX_PER_PAGE);
	});

	it('treats a page below the first as the first', () => {
		expect(pageWindow({ page: 0 }).page).toBe(1);
		expect(pageWindow({ page: -5 }).offset).toBe(0);
	});

	it('refuses a perPage below one', () => {
		expect(pageWindow({ perPage: 0 }).perPage).toBe(1);
	});

	it('truncates a fractional page rather than producing a fractional offset', () => {
		expect(pageWindow({ page: 2.9, perPage: 10 })).toMatchObject({ page: 2, offset: 10 });
	});

	it('falls back to the default when the number is not one', () => {
		expect(pageWindow({ page: Number.NaN, perPage: Number.NaN })).toEqual({
			page: 1,
			perPage: DEFAULT_PER_PAGE,
			limit: DEFAULT_PER_PAGE,
			offset: 0
		});
	});
});

describe('pageWindowFrom', () => {
	it('reads page and perPage off a query string', () => {
		expect(pageWindowFrom(new URLSearchParams('page=2&perPage=10'))).toMatchObject({
			page: 2,
			offset: 10
		});
	});

	it('ignores a malformed value instead of failing the request', () => {
		expect(pageWindowFrom(new URLSearchParams('page=abc')).page).toBe(1);
	});

	it('uses the defaults for an empty query string', () => {
		expect(pageWindowFrom(new URLSearchParams()).perPage).toBe(DEFAULT_PER_PAGE);
	});
});

describe('page', () => {
	it('reports the total, not the number of rows returned', () => {
		const result = page(['a', 'b'], 200, pageWindow({ page: 2, perPage: 2 }));

		expect(result).toEqual({
			rows: ['a', 'b'],
			page: 2,
			perPage: 2,
			total: 200,
			pageCount: 100
		});
	});

	it('rounds a partial last page up', () => {
		expect(page([], 201, pageWindow({ perPage: 100 })).pageCount).toBe(3);
	});

	it('reports one page when there is nothing, so a pager can render', () => {
		expect(page([], 0, pageWindow()).pageCount).toBe(1);
	});
});
