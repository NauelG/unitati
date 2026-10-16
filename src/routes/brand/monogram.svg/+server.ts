import { error } from '@sveltejs/kit';
import { monogramSpec, monogramSvg } from '#lib/domain/brand.js';
import { getBrand } from '#lib/server/directory/index.js';
import type { RequestHandler } from './$types';

/** Same rule as `/brand/[asset]`: `If-None-Match` may be a list, weak or `*`. */
function matches(header: string | null, etag: string): boolean {
	if (!header) return false;
	return header
		.split(',')
		.map((candidate) => candidate.trim().replace(/^W\//, ''))
		.some((candidate) => candidate === '*' || candidate === etag);
}

/**
 * The favicon of a customised brand that has no mark (Q11): its initial on its colour,
 * generated, never stored. SvelteKit ranks this static segment above `/brand/[asset]`,
 * so no asset slot is named "monogram.svg". Public, with the same headers as the
 * uploaded images.
 *
 * `?v` is `BrandView.monogramVersion`, a hash of what the SVG draws, so the URL changes
 * exactly when the picture does.
 */
export const GET: RequestHandler = async ({ locals, url, request }) => {
	const brand = await getBrand(locals.user?.organisationId ?? null);
	if (!brand.customised) error(404, 'Not found');

	const etag = `"${brand.monogramVersion}"`;
	const headers = {
		etag,
		'cache-control':
			url.searchParams.get('v') === brand.monogramVersion
				? 'public, max-age=31536000, immutable'
				: 'no-cache',
		'x-content-type-options': 'nosniff',
		'cross-origin-resource-policy': 'same-origin'
	};

	if (matches(request.headers.get('if-none-match'), etag)) {
		return new Response(null, { status: 304, headers });
	}

	const svg = monogramSvg(monogramSpec(brand.productName, brand.brandColor));
	return new Response(svg, {
		headers: {
			...headers,
			'content-type': 'image/svg+xml',
			'content-disposition': 'inline',
			'content-security-policy':
				"default-src 'none'; style-src 'unsafe-inline'; img-src data:; sandbox"
		}
	});
};
