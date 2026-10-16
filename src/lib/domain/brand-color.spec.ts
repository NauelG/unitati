import { describe, expect, it } from 'vitest';
import {
	brandCss,
	contrast,
	deriveBrand,
	parseHex,
	type BrandTokens,
	type Hex
} from './brand-color';

/** Independent reference: OKLCH to hex, written out so the test does not call the module's own maths. */
function fromOklch(l: number, c: number, hDeg: number): Hex {
	const h = (hDeg * Math.PI) / 180;
	const a = c * Math.cos(h);
	const b = c * Math.sin(h);
	const l_ = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3;
	const m_ = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3;
	const s_ = (l - 0.0894841775 * a - 1.291485548 * b) ** 3;
	const lin = [
		4.0767416621 * l_ - 3.3077115913 * m_ + 0.2309699292 * s_,
		-1.2684380046 * l_ + 2.6097574011 * m_ - 0.3413193965 * s_,
		-0.0041960863 * l_ - 0.7034186147 * m_ + 1.707614701 * s_
	];
	const byte = (v: number) => {
		const x = Math.min(1, Math.max(0, v));
		const e = x <= 0.0031308 ? x * 12.92 : 1.055 * x ** (1 / 2.4) - 0.055;
		return Math.round(e * 255)
			.toString(16)
			.padStart(2, '0');
	};
	return `#${lin.map(byte).join('')}`;
}

function hueOf(hex: Hex): number {
	const [r, g, b] = [1, 3, 5].map((i) => {
		const c = parseInt(hex.slice(i, i + 2), 16) / 255;
		return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
	});
	const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
	const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
	const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
	const a = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
	const bb = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
	return ((Math.atan2(bb, a) * 180) / Math.PI + 360) % 360;
}

function expectAccessible(tokens: BrandTokens, surface: Hex) {
	expect(contrast(tokens.brand, surface)).toBeGreaterThanOrEqual(4.5);
	expect(contrast(tokens.brand, tokens.brandSoft)).toBeGreaterThanOrEqual(4.5);
	expect(contrast(tokens.onBrand, tokens.brand)).toBeGreaterThanOrEqual(4.5);
	for (const hex of Object.values(tokens)) expect(hex).toMatch(/^#[0-9a-f]{6}$/);
}

describe('parseHex', () => {
	it.each([
		['#1D5CF0', '#1d5cf0'],
		['#abc', '#aabbcc'],
		[' #abc ', '#aabbcc'],
		['1d5cf0', null],
		['#ggg000', null],
		['red', null]
	])('%s -> %s', (input, expected) => {
		expect(parseHex(input)).toBe(expected);
	});
});

describe('contrast', () => {
	it('is 21 between white and black', () => {
		expect(contrast('#ffffff', '#000000')).toBeCloseTo(21, 2);
	});

	it('matches the WCAG reference for Unitati blue on white', () => {
		// Worked by hand: relative luminance 0.0026 + 0.0765 + 0.0629 = 0.142, so 1.05 / 0.192 ≈ 5.47.
		expect(contrast('#1d5cf0', '#ffffff')).toBeCloseTo(5.47, 1);
	});
});

describe('deriveBrand', () => {
	it('keeps every pairing accessible across the hue × chroma × lightness grid', () => {
		for (let hue = 0; hue < 360; hue += 10) {
			for (const chroma of [0, 0.05, 0.1, 0.2]) {
				for (const lightness of [0.2, 0.5, 0.7, 0.9]) {
					const derived = deriveBrand(fromOklch(lightness, chroma, hue));
					expectAccessible(derived.light, '#ffffff');
					expectAccessible(derived.dark, '#121922');
				}
			}
		}
	});

	it('leaves Unitati blue alone', () => {
		const derived = deriveBrand('#1d5cf0');
		expect(derived.adjusted).toBe(false);
		expect(derived.light.brand).toBe('#1d5cf0');
	});

	it('darkens an orange that fails on white, keeping its hue', () => {
		const derived = deriveBrand('#ff6600');
		expect(derived.adjusted).toBe(true);
		expect(contrast(derived.light.brand, '#ffffff')).toBeGreaterThan(
			contrast('#ff6600', '#ffffff')
		);
		expect(Math.abs(hueOf(derived.light.brand) - hueOf('#ff6600'))).toBeLessThanOrEqual(3);
	});

	it.each(['#000000', '#ffffff'] as const)('terminates and stays accessible for %s', (input) => {
		const derived = deriveBrand(input);
		expectAccessible(derived.light, '#ffffff');
		expectAccessible(derived.dark, '#121922');
	});
});

describe('brandCss', () => {
	const css = brandCss(deriveBrand('#ff6600'));

	it('carries no markup, quotes or at-rules', () => {
		expect(css).toMatch(/^[:\w\s.{}();#,-]+$/);
	});

	it('sets the seven properties in each of the two blocks', () => {
		const [light, dark] = css.split('\n');
		expect(light.startsWith(':root:root{')).toBe(true);
		expect(dark.startsWith(':root.dark,:root .dark{')).toBe(true);
		for (const block of [light, dark]) {
			const names = [...block.matchAll(/(--[\w-]+):/g)].map((match) => match[1]);
			expect(names).toEqual([
				'--brand',
				'--brand-hover',
				'--brand-soft',
				'--on-brand',
				'--focus',
				'--action-accent',
				'--on-action-accent'
			]);
		}
	});
});
