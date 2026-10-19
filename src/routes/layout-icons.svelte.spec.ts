import { render } from '@testing-library/svelte';
import { createRawSnippet } from 'svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_BRAND, type BrandView } from '#lib/domain/brand.js';

vi.mock('$app/navigation', () => ({ onNavigate: vi.fn() }));
vi.mock('$app/env/public', () => ({ APP_ENV: 'production' }));

const { default: Layout } = await import('./+layout.svelte');

const children = createRawSnippet(() => ({ render: () => '<main></main>' }));
const art = (contentType: string) => ({ sha256: 'h', contentType });

function icons(brand: BrandView) {
	render(Layout, { children, data: { brand } } as never);
	return [...document.head.querySelectorAll('link[rel$="icon"]')].map((link) => ({
		rel: link.getAttribute('rel'),
		type: link.getAttribute('type'),
		href: link.getAttribute('href')
	}));
}

afterEach(() => {
	document.head.innerHTML = '';
});

describe('root layout browser icons', () => {
	it('keeps Unitati’s bundled icons when the brand is not customised', () => {
		const links = icons(DEFAULT_BRAND);

		expect(links.map((link) => link.rel)).toEqual(['icon', 'apple-touch-icon']);
		expect(links[0].type).toBe('image/svg+xml');
		expect(links.every((link) => !link.href?.startsWith('/brand/'))).toBe(true);
	});

	it('uses the generated PNG, the SVG mark and the apple-touch icon for an SVG mark', () => {
		const links = icons({
			...DEFAULT_BRAND,
			customised: true,
			assets: {
				mark: art('image/svg+xml'),
				favicon: art('image/png'),
				apple_touch: art('image/png')
			}
		});

		expect(links).toEqual([
			{ rel: 'icon', type: 'image/png', href: '/brand/favicon?v=h' },
			{ rel: 'icon', type: 'image/svg+xml', href: '/brand/mark?v=h' },
			{ rel: 'apple-touch-icon', type: null, href: '/brand/apple-touch?v=h' }
		]);
	});

	it('skips the SVG icon when the mark is a raster', () => {
		const links = icons({
			...DEFAULT_BRAND,
			customised: true,
			assets: { mark: art('image/webp'), favicon: art('image/png'), apple_touch: art('image/png') }
		});

		expect(links.map((link) => link.type)).toEqual(['image/png', null]);
	});

	it('uses only the monogram SVG, and no apple-touch icon, without a mark', () => {
		const links = icons({ ...DEFAULT_BRAND, customised: true, monogramVersion: 'abc' });

		expect(links).toEqual([
			{ rel: 'icon', type: 'image/svg+xml', href: '/brand/monogram.svg?v=abc' }
		]);
	});
});
