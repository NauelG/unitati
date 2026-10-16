import { beforeEach, describe, expect, it, vi } from 'vitest';

const getBrandAsset = vi.fn();
vi.mock('#lib/server/directory/index.js', () => ({ getBrandAsset }));

const { GET } = await import('./+server');

const SHA = 'a'.repeat(64);
const DATA = new TextEncoder().encode(
	'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"/>'
);

function call(
	asset: string,
	init: { query?: string; headers?: Record<string, string>; user?: object | null } = {}
) {
	const url = new URL(`http://localhost/brand/${asset}${init.query ?? ''}`);
	return GET({
		locals: { user: init.user ?? null },
		params: { asset },
		url,
		request: new Request(url, { headers: init.headers })
	} as unknown as Parameters<typeof GET>[0]);
}

beforeEach(() => {
	getBrandAsset.mockReset();
	getBrandAsset.mockResolvedValue({ contentType: 'image/svg+xml', data: DATA, sha256: SHA });
});

describe('GET /brand/[asset]', () => {
	it('serves the image inline with the hardening headers', async () => {
		const response = await call('mark');

		expect(response.status).toBe(200);
		expect(Object.fromEntries(response.headers)).toMatchObject({
			'content-type': 'image/svg+xml',
			'content-length': String(DATA.byteLength),
			etag: `"${SHA}"`,
			'x-content-type-options': 'nosniff',
			'content-disposition': 'inline',
			'content-security-policy':
				"default-src 'none'; style-src 'unsafe-inline'; img-src data:; sandbox",
			'cross-origin-resource-policy': 'same-origin'
		});
		expect(new Uint8Array(await response.arrayBuffer())).toEqual(DATA);
	});

	it('is immutable only when ?v matches the stored hash', async () => {
		const matching = await call('mark', { query: `?v=${SHA}` });
		const stale = await call('mark', { query: `?v=${'b'.repeat(64)}` });
		const bare = await call('mark');

		expect(matching.headers.get('cache-control')).toBe('public, max-age=31536000, immutable');
		expect(stale.status).toBe(200);
		expect(stale.headers.get('cache-control')).toBe('no-cache');
		expect(bare.headers.get('cache-control')).toBe('no-cache');
	});

	it('answers 304 with no body to a matching If-None-Match', async () => {
		const response = await call('mark', { headers: { 'if-none-match': `"${SHA}"` } });

		expect(response.status).toBe(304);
		expect(response.headers.get('etag')).toBe(`"${SHA}"`);
		expect(await response.text()).toBe('');
	});

	it.each([`W/"${SHA}"`, `"x", "${SHA}"`, '*'])(
		'answers 304 to If-None-Match: %s',
		async (header) => {
			const response = await call('mark', { headers: { 'if-none-match': header } });

			expect(response.status).toBe(304);
		}
	);

	it.each([
		['lockup', 'lockup'],
		['lockup-dark', 'lockup_dark'],
		['mark', 'mark'],
		['favicon', 'favicon'],
		['apple-touch', 'apple_touch']
	])('maps /brand/%s to the %s slot', async (segment, slot) => {
		await call(segment);

		expect(getBrandAsset).toHaveBeenCalledWith(null, slot);
	});

	it.each(['lockup_dark', 'apple_touch', 'monogram.svg', 'constructor', '__proto__'])(
		'is a 404 for the unknown asset %s',
		async (asset) => {
			await expect(call(asset)).rejects.toMatchObject({ status: 404 });
			expect(getBrandAsset).not.toHaveBeenCalled();
		}
	);

	it('is a 404 when the slot is empty', async () => {
		getBrandAsset.mockResolvedValue(null);

		await expect(call('lockup')).rejects.toMatchObject({ status: 404 });
	});

	it('resolves the installation without a session and the user’s organisation with one', async () => {
		await call('mark');
		await call('mark', { user: { organisationId: 'org-1' } });

		expect(getBrandAsset).toHaveBeenNthCalledWith(1, null, 'mark');
		expect(getBrandAsset).toHaveBeenNthCalledWith(2, 'org-1', 'mark');
	});
});
