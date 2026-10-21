import { error, json } from '@sveltejs/kit';
import { requirePermission } from '#lib/server/auth/guards.js';
import { searchMentionables } from '#lib/server/service-desk/index.js';
import type { RequestHandler } from './$types';

/**
 * The @mention picker of a comment (#303): at most 8 people who can see what is
 * being written, never the viewer. `visibility` decides who counts as seeing it.
 */
export const GET: RequestHandler = async ({ locals, params, url }) => {
	const user = requirePermission(locals.user, 'tickets.view');
	const visibility = url.searchParams.get('visibility');
	if (visibility !== 'public' && visibility !== 'internal') error(400, 'Bad visibility');

	const outcome = await searchMentionables(
		user,
		params.tag,
		visibility,
		url.searchParams.get('q') ?? ''
	);
	if (!outcome.ok) error(404, 'Not found');
	return json(outcome.value);
};
