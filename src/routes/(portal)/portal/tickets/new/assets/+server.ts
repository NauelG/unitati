import { json } from '@sveltejs/kit';
import { requirePermission } from '#lib/server/auth/guards.js';
import { listAssetChoices } from '#lib/server/assets/index.js';
import type { RequestHandler } from './$types';

/**
 * The portal form's asset picker asks here as the user types. The scope lives
 * in the domain: an employee gets the equipment they hold and the shared
 * items, whatever the query string says.
 */
export const GET: RequestHandler = async ({ locals, url }) => {
	const user = requirePermission(locals.user, 'tickets.create');
	const choices = await listAssetChoices(user, { search: url.searchParams.get('q') ?? '' });

	return json(choices);
};
