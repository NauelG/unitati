import { error, json } from '@sveltejs/kit';
import { APP_ENV } from '$app/env/public';
import { isProduction } from '#lib/environment.js';
import type { RequestHandler } from './$types';

/**
 * The gallery's `AssetPicker` needs something to ask. Invented assets, filtered
 * by the same rule the real endpoints apply, so the workbench shows the picker
 * working with no database behind it. Gated like the gallery page itself.
 */
const FIXTURES = [
	{ id: '5f0c0000-0000-4000-8000-000000000001', assetTag: 'AST-0001', name: 'MacBook Pro 14' },
	{ id: '5f0c0000-0000-4000-8000-000000000002', assetTag: 'AST-0002', name: 'Impresora de planta' },
	{ id: '5f0c0000-0000-4000-8000-000000000003', assetTag: 'AST-0003', name: 'Monitor Dell 27' },
	{ id: '5f0c0000-0000-4000-8000-000000000004', assetTag: 'AST-0004', name: 'Dock Thunderbolt' }
];

export const GET: RequestHandler = ({ url }) => {
	if (isProduction(APP_ENV)) error(404, 'Not found');

	const term = (url.searchParams.get('q') ?? '').trim().toLowerCase();
	const matches = FIXTURES.filter(
		(asset) =>
			term === '' ||
			asset.assetTag.toLowerCase().includes(term) ||
			asset.name.toLowerCase().includes(term)
	);

	return json(matches);
};
