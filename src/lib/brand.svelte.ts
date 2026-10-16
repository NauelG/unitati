import { page } from '$app/state';
import { DEFAULT_BRAND, type BrandView } from '#lib/domain/brand.js';

/**
 * The organisation's brand as the current page sees it (ADR 0026). The root
 * layout loads it on the server for every page, so the first paint already
 * carries the right name and nothing flashes.
 */

/**
 * The brand of the page being rendered. Falls back to the default when the root
 * load did not run (an error page after a failed load, a component rendered
 * outside a page), so a missing brand never takes the shell down with it.
 */
export function currentBrand(): BrandView {
	return page.data?.brand ?? DEFAULT_BRAND;
}

/** The name the product goes by here: the organisation's own, or "Unitati". */
export function productName(): string {
	return currentBrand().productName;
}

/** A `<title>`: the parts the page names, then the product, joined with " · ". */
export function documentTitle(...parts: string[]): string {
	return [...parts, productName()].join(' · ');
}
