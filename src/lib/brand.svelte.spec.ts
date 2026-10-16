import { describe, expect, it } from 'vitest';
import { DEFAULT_BRAND } from '#lib/domain/brand.js';
import { brandAssetUrl } from './brand.svelte';

const brand = {
	...DEFAULT_BRAND,
	customised: true,
	assets: { lockup_dark: { sha256: 'abc123', contentType: 'image/webp' } }
};

describe('brandAssetUrl', () => {
	it('is null for a slot with nothing stored', () => {
		expect(brandAssetUrl('mark', brand)).toBeNull();
	});

	it('is the versioned, kebab-case URL for a stored slot', () => {
		expect(brandAssetUrl('lockup_dark', brand)).toBe('/brand/lockup-dark?v=abc123');
	});

	it.each([
		['lockup', '/brand/lockup?v=h'],
		['mark', '/brand/mark?v=h'],
		['favicon', '/brand/favicon?v=h'],
		['apple_touch', '/brand/apple-touch?v=h']
	] as const)('maps %s to %s', (slot, url) => {
		const assets = { [slot]: { sha256: 'h', contentType: 'image/png' } };
		expect(brandAssetUrl(slot, { assets })).toBe(url);
	});
});
