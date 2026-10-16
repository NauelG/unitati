/**
 * The organisation's brand, as every page sees it (ADR 0026). No database, so it
 * is importable from the client and the server alike.
 */

import type { Hex } from './brand-color.js';

export const DEFAULT_PRODUCT_NAME = 'Unitati';

/** The "powered by" name: it names the software, so it is never configurable. */
export const UPSTREAM_PRODUCT_NAME = 'Unitati';

export const PRODUCT_NAME_MAX = 40;

/** What every page receives as `page.data.brand`. */
export interface BrandView {
	productName: string;
	/** True once the brand differs from Unitati's default: Unitati's art then never shows. */
	customised: boolean;
	/** The one colour the admin picked, or `null` for Unitati's hand-tuned tokens. */
	brandColor: Hex | null;
	/**
	 * The inline stylesheet that applies `brandColor` (`brandCss(deriveBrand(…))`),
	 * built once with the view and cached with it. `null` injects nothing.
	 */
	css: string | null;
}

export const DEFAULT_BRAND: BrandView = {
	productName: DEFAULT_PRODUCT_NAME,
	customised: false,
	brandColor: null,
	css: null
};

/** Counts user-perceived characters, so a ZWJ emoji or "ñ" written with a combining mark is one. */
export function graphemeCount(text: string): number {
	return [...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(text)].length;
}

/**
 * First user-perceived character, uppercased, for the monogram. Uses
 * `Intl.Segmenter` so "Ñandú" gives "Ñ" and an emoji stays whole.
 */
export function monogramLetter(productName: string): string {
	const first = new Intl.Segmenter(undefined, { granularity: 'grapheme' })
		.segment(productName.trim())
		[Symbol.iterator]()
		.next();
	return first.done ? '' : first.value.segment.toLocaleUpperCase();
}
