/**
 * The brand colour (ADR 0026, #160). The admin picks one hex; this derives the
 * whole brand token family for light and dark, moving lightness in OKLCH until
 * brand-coloured text meets WCAG 2.x AA. No dependencies, so it runs on the
 * server (SSR injection) and on the client (live preview) alike.
 */

export type Hex = `#${string}`;

export const MIN_CONTRAST = 4.5;
/** Lightness step of the search, in OKLCH L. */
export const LIGHTNESS_STEP = 0.01;
/** How far the hover state sits from the resting brand. */
export const HOVER_DELTA = 0.06;
export const LIGHT_LIGHTNESS_FLOOR = 0.25;
export const DARK_LIGHTNESS_CEILING = 0.95;
export const DARK_HOVER_CEILING = 0.98;
export const LIGHT_SOFT = { lightness: 0.96, maxChroma: 0.04 } as const;
export const DARK_SOFT = { lightness: 0.27, maxChroma: 0.06 } as const;
/** Binary-search rounds when pulling an out-of-gamut colour back into sRGB. */
export const GAMUT_ITERATIONS = 12;
const ACHROMATIC_CHROMA = 0.0001;

/** Surfaces and inks are not customisable (app.css), so they are constants here. */
const LIGHT_SURFACE: Hex = '#ffffff';
const DARK_SURFACE: Hex = '#121922';
const LIGHT_INK: Hex = '#0f1720';
const DARK_INK: Hex = '#0b1016';
const WHITE: Hex = '#ffffff';

export interface BrandTokens {
	brand: Hex;
	brandHover: Hex;
	brandSoft: Hex;
	onBrand: Hex;
}

export interface DerivedBrand {
	light: BrandTokens;
	dark: BrandTokens;
	/** True when the light `brand` differs from the input: the editor says so. */
	adjusted: boolean;
}

/** Accepts `#rgb` / `#rrggbb` in any case, trimmed. A `#` is required. */
export function parseHex(input: string): Hex | null {
	const value = input.trim().toLowerCase();
	if (/^#[0-9a-f]{6}$/.test(value)) return value as Hex;
	const short = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/.exec(value);
	if (short) return `#${short[1]}${short[1]}${short[2]}${short[2]}${short[3]}${short[3]}`;
	return null;
}

function channels(hex: Hex): [number, number, number] {
	return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number];
}

function toLinear(byte: number): number {
	const c = byte / 255;
	return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function fromLinear(value: number): number {
	const c = Math.min(1, Math.max(0, value));
	const encoded = c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055;
	return Math.round(encoded * 255);
}

function luminance(hex: Hex): number {
	const [r, g, b] = channels(hex).map(toLinear);
	return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG 2.x contrast ratio, 1..21. */
export function contrast(a: Hex, b: Hex): number {
	const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
	return (hi + 0.05) / (lo + 0.05);
}

interface Oklch {
	l: number;
	c: number;
	h: number;
}

function toOklch(hex: Hex): Oklch {
	const [r, g, b] = channels(hex).map(toLinear);
	const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
	const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
	const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
	const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
	const a = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
	const bb = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
	const c = Math.hypot(a, bb);
	return { l: L, c, h: c < ACHROMATIC_CHROMA ? 0 : Math.atan2(bb, a) };
}

function linearRgb({ l, c, h }: Oklch): [number, number, number] {
	const a = c * Math.cos(h);
	const b = c * Math.sin(h);
	const l_ = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3;
	const m_ = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3;
	const s_ = (l - 0.0894841775 * a - 1.291485548 * b) ** 3;
	return [
		4.0767416621 * l_ - 3.3077115913 * m_ + 0.2309699292 * s_,
		-1.2684380046 * l_ + 2.6097574011 * m_ - 0.3413193965 * s_,
		-0.0041960863 * l_ - 0.7034186147 * m_ + 1.707614701 * s_
	];
}

function inGamut(color: Oklch): boolean {
	const epsilon = 1e-4;
	return linearRgb(color).every((v) => v >= -epsilon && v <= 1 + epsilon);
}

/** Out-of-gamut: shrink chroma by binary search, so the hue is preserved. */
function toHex(color: Oklch): Hex {
	let { c } = color;
	if (!inGamut(color)) {
		let lo = 0;
		let hi = c;
		for (let i = 0; i < GAMUT_ITERATIONS; i++) {
			const mid = (lo + hi) / 2;
			if (inGamut({ ...color, c: mid })) lo = mid;
			else hi = mid;
		}
		c = lo;
	}
	const rgb = linearRgb({ ...color, c }).map(fromLinear);
	return `#${rgb.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

function bestInk(background: Hex, candidates: [Hex, Hex]): Hex {
	return contrast(candidates[0], background) >= contrast(candidates[1], background)
		? candidates[0]
		: candidates[1];
}

function soft(
	{ lightness, maxChroma }: { lightness: number; maxChroma: number },
	from: Oklch
): Hex {
	return toHex({ l: lightness, c: Math.min(from.c, maxChroma), h: from.h });
}

function derive(
	input: Hex,
	from: Oklch,
	options: {
		surface: Hex;
		brandSoft: Hex;
		direction: 1 | -1;
		limit: number;
		hoverLimit: number;
		inks: [Hex, Hex];
	}
): BrandTokens {
	const { surface, brandSoft, direction, limit, hoverLimit, inks } = options;
	const failing = (hex: Hex) =>
		contrast(hex, surface) < MIN_CONTRAST || contrast(hex, brandSoft) < MIN_CONTRAST;

	let brand = input;
	let lightness = from.l;
	while (failing(brand) && (direction === -1 ? lightness > limit : lightness < limit)) {
		lightness =
			direction === -1
				? Math.max(limit, lightness - LIGHTNESS_STEP)
				: Math.min(limit, lightness + LIGHTNESS_STEP);
		brand = toHex({ ...from, l: lightness });
	}

	const hoverLightness =
		direction === -1
			? Math.max(0, lightness - HOVER_DELTA)
			: Math.min(hoverLimit, lightness + HOVER_DELTA);
	return {
		brand,
		brandHover: toHex({ ...from, l: hoverLightness }),
		brandSoft,
		onBrand: bestInk(brand, inks)
	};
}

export function deriveBrand(input: Hex): DerivedBrand {
	const from = toOklch(input);

	const light = derive(input, from, {
		surface: LIGHT_SURFACE,
		brandSoft: soft(LIGHT_SOFT, from),
		direction: -1,
		limit: LIGHT_LIGHTNESS_FLOOR,
		hoverLimit: 1,
		inks: [WHITE, LIGHT_INK]
	});
	const dark = derive(input, from, {
		surface: DARK_SURFACE,
		brandSoft: soft(DARK_SOFT, from),
		direction: 1,
		limit: DARK_LIGHTNESS_CEILING,
		hoverLimit: DARK_HOVER_CEILING,
		inks: [DARK_INK, WHITE]
	});

	return { light, dark, adjusted: light.brand !== input };
}

function block(tokens: BrandTokens): string {
	return [
		`--brand:${tokens.brand}`,
		`--brand-hover:${tokens.brandHover}`,
		`--brand-soft:${tokens.brandSoft}`,
		`--on-brand:${tokens.onBrand}`,
		`--focus:${tokens.brand}`,
		`--action-accent:${tokens.brand}`,
		`--on-action-accent:${tokens.onBrand}`
	].join(';');
}

/**
 * The inline stylesheet the server injects.
 *
 * Why these selectors: `app.css` declares the tokens on `:root` (0-1-0) and
 * `.dark` (0-1-0), and the order of this `<style>` relative to the bundled
 * stylesheet is not guaranteed. `:root:root` (0-2-0) beats both whatever the
 * order. `:root.dark` (0-2-0) ties with it and wins by coming later in the same
 * sheet. `:root .dark` (0-2-0) covers the gallery's `<div class="dark">`
 * subtree, beating `app.css`'s `.dark` and overriding the light values that
 * element would otherwise inherit.
 *
 * Safety: the output is built only from `Hex` values that have passed
 * `parseHex` or come out of `toHex`, so it contains no user text and cannot
 * carry markup. That is why `{@html}` is acceptable where it is injected.
 */
export function brandCss(derived: DerivedBrand): string {
	return `:root:root{${block(derived.light)}}\n` + `:root.dark,:root .dark{${block(derived.dark)}}`;
}
