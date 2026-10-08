/**
 * The listing contract, settled at the first list screen rather than the third.
 *
 * With 200 seeded assets, loading everything works — and that is exactly why it
 * is a trap: it keeps working until the install with 4,000 rows, by which point
 * three screens are written against an array and all three need rewriting.
 *
 * `shared/` may not import from a domain (ADR 0002), so nothing here knows what
 * it is counting.
 */

/** What a caller asks for. Both fields are optional; both are clamped. */
export interface PageRequest {
	/** 1-based, as it appears in the URL. */
	page?: number;
	perPage?: number;
}

/** What a query needs. Already clamped, so it is safe to interpolate. */
export interface PageWindow {
	page: number;
	perPage: number;
	limit: number;
	offset: number;
}

/** A page of rows plus what the caller needs to render a pager. */
export interface Page<T> {
	rows: T[];
	page: number;
	perPage: number;
	/** Total matching rows, not rows returned: the pager needs the whole count. */
	total: number;
	pageCount: number;
}

export const DEFAULT_PER_PAGE = 25;

/**
 * An upper bound, because `perPage` arrives from a query string. Without it,
 * `?perPage=100000` is a denial of service anyone can type.
 */
export const MAX_PER_PAGE = 100;

function clampInteger(value: number | undefined, fallback: number, min: number, max: number) {
	if (value === undefined || !Number.isFinite(value)) return fallback;
	return Math.min(Math.max(Math.trunc(value), min), max);
}

/**
 * Turns a request into a window. Nonsense in — a negative page, a fractional
 * `perPage`, `NaN` from a malformed query string — yields the first page rather
 * than an error: a bad page number is a navigation mistake, not a failure worth
 * showing someone.
 */
export function pageWindow(request: PageRequest = {}): PageWindow {
	const page = clampInteger(request.page, 1, 1, Number.MAX_SAFE_INTEGER);
	const perPage = clampInteger(request.perPage, DEFAULT_PER_PAGE, 1, MAX_PER_PAGE);

	return { page, perPage, limit: perPage, offset: (page - 1) * perPage };
}

/** Reads a window straight off a URL's query string. */
export function pageWindowFrom(params: URLSearchParams): PageWindow {
	const read = (key: string) => {
		const raw = params.get(key);
		return raw === null ? undefined : Number(raw);
	};

	return pageWindow({ page: read('page'), perPage: read('perPage') });
}

/**
 * Pairs rows with their total. `pageCount` is at least 1 so an empty result
 * reads as "page 1 of 1" rather than "page 1 of 0", which no pager can render.
 */
export function page<T>(rows: T[], total: number, window: PageWindow): Page<T> {
	return {
		rows,
		page: window.page,
		perPage: window.perPage,
		total,
		pageCount: Math.max(1, Math.ceil(total / window.perPage))
	};
}
