// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { deriveBrand, type Hex } from './brand-color';
import { graphemeCount, monogramLetter, monogramSpec, monogramSvg } from './brand';

describe('monogramLetter', () => {
	it('uppercases the first letter', () => {
		expect(monogramLetter('acme')).toBe('A');
	});

	it('keeps an accented letter whole', () => {
		expect(monogramLetter('ñandú')).toBe('Ñ');
	});

	it('keeps a ZWJ emoji sequence whole', () => {
		expect(monogramLetter('👩‍💻 Dev')).toBe('👩‍💻');
	});
});

describe('graphemeCount', () => {
	it('counts user-perceived characters, not UTF-16 units', () => {
		expect(graphemeCount('👩‍💻'.repeat(3))).toBe(3);
		expect(graphemeCount('abc')).toBe(3);
	});
});

describe('monogramSvg', () => {
	const input = { letter: 'A', background: '#1d5cf0', foreground: '#ffffff' };

	it('draws a rounded square with a centred letter on a 64 grid', () => {
		const svg = monogramSvg(input);
		const doc = new DOMParser().parseFromString(svg, 'image/svg+xml');

		expect(doc.querySelector('parsererror')).toBeNull();
		expect(doc.documentElement.getAttribute('viewBox')).toBe('0 0 64 64');
		expect(doc.querySelector('rect')?.getAttribute('rx')).toBe('14');
		expect(doc.querySelector('rect')?.getAttribute('fill')).toBe('#1d5cf0');
		expect(doc.querySelector('text')?.getAttribute('fill')).toBe('#ffffff');
		expect(doc.querySelector('text')?.textContent).toBe('A');
	});

	it.each([
		['<', '&lt;'],
		['&', '&amp;'],
		['>', '&gt;'],
		['"', '&quot;'],
		["'", '&apos;']
	])('escapes %s in the letter', (letter, escaped) => {
		const svg = monogramSvg({ ...input, letter });
		const doc = new DOMParser().parseFromString(svg, 'image/svg+xml');

		expect(svg).toContain(`>${escaped}</text>`);
		expect(doc.querySelector('parsererror')).toBeNull();
		expect(doc.querySelector('text')?.textContent).toBe(letter);
	});
});

describe('monogramSpec', () => {
	it('uses Unitati blue and white without a brand colour', () => {
		expect(monogramSpec('Acme', null)).toEqual({
			letter: 'A',
			background: '#1d5cf0',
			foreground: '#ffffff'
		});
	});

	it('uses the derived light brand and its ink with a brand colour', () => {
		const spec = monogramSpec('Acme', '#ffcc00' as Hex);
		const { light } = deriveBrand('#ffcc00' as Hex);

		expect(spec.background).toBe(light.brand);
		expect(spec.foreground).toBe(light.onBrand);
	});
});
