import { error, json } from '@sveltejs/kit';
import { requirePermission } from '#lib/server/auth/guards.js';
import { searchMentionables } from '#lib/server/service-desk/index.js';
import type { RequestHandler } from './$types';

/**
 * The portal's @mention picker (#303): public comments only, and only the
 * assignee and the staff who have answered the ticket. An employee cannot browse
 * the directory through here.
 */
export const GET: RequestHandler = async ({ locals, params, url }) => {
	const user = requirePermission(locals.user, 'tickets.view.own');
	const outcome = await searchMentionables(
		user,
		params.tag,
		'public',
		url.searchParams.get('q') ?? ''
	);
	if (!outcome.ok) error(404, 'Not found');
	return json(outcome.value);
};
