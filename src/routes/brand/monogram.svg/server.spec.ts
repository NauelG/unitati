import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_BRAND, type BrandView } from '#lib/domain/brand.js';

const getBrand = vi.fn();
const getBrandAsset = vi.fn();
vi.mock('#lib/server/directory/index.js', () => ({ getBrand, getBrandAsset }));

const { GET } = await import('./+server');
const { GET: GET_ASSET } = await import('../[asset]/+server');

const acme: BrandView = {
	...DEFAULT_BRAND,
	productName: 'Acme',
	customised: true,
	monogramVersion: 'abcdef0123456789'
};

function call(
	init: { query?: string; headers?: Record<string, string>; user?: object | null } = {}
) {
	const url = new URL(`http://localhost/brand/monogram.svg${init.query ?? ''}`);
	return GET({
		locals: { user: init.user ?? null },
		url,
		request: new Request(url, { headers: init.headers })
	} as unknown as Parameters<typeof GET>[0]);
}

beforeEach(() => {
	getBrand.mockReset();
	getBrandAsset.mockReset();
	getBrand.mockResolvedValue(acme);
});

describe('GET /brand/monogram.svg', () => {
	it('serves the monogram as an SVG with the hardening headers', async () => {
		const response = await call();
		const body = await response.text();

		expect(response.status).toBe(200);
		expect(Object.fromEntries(response.headers)).toMatchObject({
			'content-type': 'image/svg+xml',
			etag: '"abcdef0123456789"',
			'x-content-type-options': 'nosniff',
			'content-disposition': 'inline',
			'content-security-policy':
				"default-src 'none'; style-src 'unsafe-inline'; img-src data:; sandbox",
			'cross-origin-resource-policy': 'same-origin'
		});
		expect(body).toContain('viewBox="0 0 64 64"');
		expect(body).toContain('>A</text>');
	});

	it('is a 404 when the brand is not customised', async () => {
		getBrand.mockResolvedValue(DEFAULT_BRAND);

		await expect(call()).rejects.toMatchObject({ status: 404 });
	});

	it('is immutable only when ?v matches', async () => {
		const matching = await call({ query: '?v=abcdef0123456789' });
		const stale = await call({ query: '?v=0000' });

		expect(matching.headers.get('cache-control')).toBe('public, max-age=31536000, immutable');
		expect(stale.status).toBe(200);
		expect(stale.headers.get('cache-control')).toBe('no-cache');
	});

	it('answers 304 to a matching If-None-Match', async () => {
		const response = await call({ headers: { 'if-none-match': '"abcdef0123456789"' } });

		expect(response.status).toBe(304);
	});

	it('resolves the user’s organisation, or the installation without a session', async () => {
		await call();
		await call({ user: { organisationId: 'org-1' } });

		expect(getBrand).toHaveBeenNthCalledWith(1, null);
		expect(getBrand).toHaveBeenNthCalledWith(2, 'org-1');
	});
});

describe('route precedence', () => {
	it('keeps /brand/monogram.svg out of [asset] and /brand/lockup in it', async () => {
		const { readdirSync } = await import('node:fs');
		const dir = new URL('../', import.meta.url);
		const entries = readdirSync(dir).sort();

		expect(entries).toContain('monogram.svg');
		expect(entries).toContain('[asset]');

		const asset = new URL('http://localhost/brand/lockup');
		getBrandAsset.mockResolvedValue({
			contentType: 'image/svg+xml',
			data: new Uint8Array([1]),
			sha256: 'x'
		});
		await GET_ASSET({
			locals: { user: null },
			params: { asset: 'lockup' },
			url: asset,
			request: new Request(asset)
		} as unknown as Parameters<typeof GET_ASSET>[0]);

		expect(getBrandAsset).toHaveBeenCalledWith(null, 'lockup');
		expect(getBrand).not.toHaveBeenCalled();
	});
});
