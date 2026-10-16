/**
 * The organisation's brand, as every page sees it (ADR 0026). No database, so it
 * is importable from the client and the server alike.
 */

import { deriveBrand, type Hex } from './brand-color.js';

export const DEFAULT_PRODUCT_NAME = 'Unitati';

/** The "powered by" name: it names the software, so it is never configurable. */
export const UPSTREAM_PRODUCT_NAME = 'Unitati';

export const PRODUCT_NAME_MAX = 40;

/** The largest logo file accepted. The server enforces it; the editor checks it first to save an upload. */
export const LOGO_MAX_BYTES = 5 * 1024 * 1024;

export const UPLOAD_SLOTS = ['lockup', 'lockup_dark', 'mark'] as const;
export const DERIVED_SLOTS = ['favicon', 'apple_touch'] as const;
export const BRAND_ASSET_SLOTS = [...UPLOAD_SLOTS, ...DERIVED_SLOTS] as const;

export type UploadSlot = (typeof UPLOAD_SLOTS)[number];
export type DerivedSlot = (typeof DERIVED_SLOTS)[number];
export type BrandAssetSlot = (typeof BRAND_ASSET_SLOTS)[number];

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
	/** Metadata of the stored images, never their bytes: those are served from `/brand/*`. */
	assets: Partial<Record<BrandAssetSlot, { sha256: string; contentType: string }>>;
	/**
	 * Version of the generated monogram favicon (`/brand/monogram.svg?v=…`): a hash of what
	 * it draws, so the URL changes exactly when the picture does.
	 */
	monogramVersion: string;
}

export const DEFAULT_BRAND: BrandView = {
	productName: DEFAULT_PRODUCT_NAME,
	customised: false,
	brandColor: null,
	css: null,
	assets: {},
	monogramVersion: ''
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

/** Unitati's own blue and its ink, for a monogram drawn before any colour is chosen. */
const UNITATI_MONOGRAM = { background: '#1d5cf0', foreground: '#ffffff' } as const;

export interface MonogramSpec {
	letter: string;
	background: string;
	foreground: string;
}

/** What the monogram favicon draws: the initial on the light brand colour, as the HTML monogram does. */
export function monogramSpec(productName: string, brandColor: Hex | null): MonogramSpec {
	const letter = monogramLetter(productName);
	if (!brandColor) return { letter, ...UNITATI_MONOGRAM };
	const { light } = deriveBrand(brandColor);
	return { letter, background: light.brand, foreground: light.onBrand };
}

const XML_ESCAPES: Record<string, string> = {
	'&': '&amp;',
	'<': '&lt;',
	'>': '&gt;',
	'"': '&quot;',
	"'": '&apos;'
};

function escapeXml(text: string): string {
	return text.replace(/[&<>"']/g, (char) => XML_ESCAPES[char]);
}

/**
 * The favicon for a brand with no mark: the initial on a rounded square. Text, not
 * paths, because the server may have no fonts to rasterise with; the browser draws
 * the letter with the visitor's own system font.
 */
export function monogramSvg({ letter, background, foreground }: MonogramSpec): string {
	return (
		`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">` +
		`<rect width="64" height="64" rx="14" fill="${escapeXml(background)}"/>` +
		`<text x="32" y="32" font-family="system-ui, -apple-system, 'Segoe UI', sans-serif" ` +
		`font-weight="600" font-size="36" dominant-baseline="central" text-anchor="middle" ` +
		`fill="${escapeXml(foreground)}">${escapeXml(letter)}</text>` +
		`</svg>`
	);
}
