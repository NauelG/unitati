import { json } from '@sveltejs/kit';
import { requirePermission } from '#lib/server/auth/guards.js';
import { listAssetChoices } from '#lib/server/assets/index.js';
import type { RequestHandler } from './$types';

/** The staff ticket form's asset picker asks here as the user types. */
export const GET: RequestHandler = async ({ locals, url }) => {
	const user = requirePermission(locals.user, 'tickets.manage');
	const choices = await listAssetChoices(user, { search: url.searchParams.get('q') ?? '' });

	return json(choices);
};
