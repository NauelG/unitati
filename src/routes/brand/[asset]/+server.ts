import { error } from '@sveltejs/kit';
import type { BrandAssetSlot } from '#lib/domain/brand.js';
import { getBrandAsset } from '#lib/server/directory/index.js';
import type { RequestHandler } from './$types';

/** URL segment to slot: kebab-case outside, snake_case in the database. */
const SLOTS: Record<string, BrandAssetSlot> = {
	lockup: 'lockup',
	'lockup-dark': 'lockup_dark',
	mark: 'mark',
	favicon: 'favicon',
	'apple-touch': 'apple_touch'
};

/** `If-None-Match` may be a list, weak (`W/`) or `*`; any of them naming this entity is a hit. */
function matches(header: string | null, etag: string): boolean {
	if (!header) return false;
	return header
		.split(',')
		.map((candidate) => candidate.trim().replace(/^W\//, ''))
		.some((candidate) => candidate === '*' || candidate === etag);
}

/**
 * Serves one brand image, with no session required: the login screen shows the logo
 * too. Unlike an attachment this renders inline, so the defence is the processing
 * the bytes went through (`branding/image.ts`) plus a CSP and a sandbox here, which
 * keep a script from running even if one were opened as a document.
 *
 * `?v=<sha256>` marks the URL as content-addressed: it is cached for a year. Any
 * other value still gets the current bytes, revalidated, so an old link never 404s.
 */
export const GET: RequestHandler = async ({ locals, params, url, request }) => {
	const slot = Object.hasOwn(SLOTS, params.asset) ? SLOTS[params.asset] : undefined;
	if (!slot) error(404, 'Not found');

	const asset = await getBrandAsset(locals.user?.organisationId ?? null, slot);
	if (!asset) error(404, 'Not found');

	const etag = `"${asset.sha256}"`;
	const headers = {
		etag,
		'cache-control':
			url.searchParams.get('v') === asset.sha256
				? 'public, max-age=31536000, immutable'
				: 'no-cache',
		'x-content-type-options': 'nosniff',
		'cross-origin-resource-policy': 'same-origin'
	};

	if (matches(request.headers.get('if-none-match'), etag)) {
		return new Response(null, { status: 304, headers });
	}

	return new Response(Buffer.from(asset.data), {
		headers: {
			...headers,
			'content-type': asset.contentType,
			'content-length': String(asset.data.byteLength),
			'content-disposition': 'inline',
			'content-security-policy':
				"default-src 'none'; style-src 'unsafe-inline'; img-src data:; sandbox"
		}
	});
};
