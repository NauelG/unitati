import { error, json } from '@sveltejs/kit';
import { APP_ENV } from '$app/env/public';
import { isProduction } from '#lib/environment.js';
import type { RequestHandler } from './$types';

/**
 * The gallery's `SearchSelectField` needs a remote list to ask, the same way
 * `assets/+server.ts` feeds `AssetPicker`. Invented people, filtered server
 * side like a real scoped search endpoint would be. Gated like the gallery
 * page itself.
 */
const FIXTURES = [
	{ value: 'p-1', label: 'Anna Puig' },
	{ value: 'p-2', label: 'Bernat Soler' },
	{ value: 'p-3', label: 'Clara Roig' },
	{ value: 'p-4', label: 'David Camps' },
	{ value: 'p-5', label: 'Elena Ferrer' }
];

export const GET: RequestHandler = ({ url }) => {
	if (isProduction(APP_ENV)) error(404, 'Not found');

	const term = (url.searchParams.get('q') ?? '').trim().toLowerCase();
	const matches = FIXTURES.filter(
		(person) => term === '' || person.label.toLowerCase().includes(term)
	);

	return json(matches);
};
