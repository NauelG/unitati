import { error, json } from '@sveltejs/kit';
import { APP_ENV } from '$app/env/public';
import { isProduction } from '#lib/environment.js';
import type { RequestHandler } from './$types';

/**
 * The gallery's remote `multiple` `SearchSelectField` needs something to ask. Invented assets, filtered
 * by the same rule the real endpoints apply, so the workbench shows the picker
 * working with no database behind it. Gated like the gallery page itself.
 */
const FIXTURES = [
	{ value: '5f0c0000-0000-4000-8000-000000000001', label: 'AST-0001 · MacBook Pro 14' },
	{ value: '5f0c0000-0000-4000-8000-000000000002', label: 'AST-0002 · Impresora de planta' },
	{ value: '5f0c0000-0000-4000-8000-000000000003', label: 'AST-0003 · Monitor Dell 27' },
	{ value: '5f0c0000-0000-4000-8000-000000000004', label: 'AST-0004 · Dock Thunderbolt' }
];

export const GET: RequestHandler = ({ url }) => {
	if (isProduction(APP_ENV)) error(404, 'Not found');

	const term = (url.searchParams.get('q') ?? '').trim().toLowerCase();
	const matches = FIXTURES.filter(
		(asset) => term === '' || asset.label.toLowerCase().includes(term)
	);

	return json(matches);
};
