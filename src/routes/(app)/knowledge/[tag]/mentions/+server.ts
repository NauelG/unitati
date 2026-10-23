import { error, json } from '@sveltejs/kit';
import { getPageByTag, mentionablesForPage } from '#lib/server/knowledge/index.js';
import { requireKnowledgeStaff } from '../../actions';
import type { RequestHandler } from './$types';

/**
 * The @mention picker of a page comment (#326): at most 8 active staff, never the
 * viewer. Staff only, like the comments themselves.
 */
export const GET: RequestHandler = async ({ locals, params, url }) => {
	const user = requireKnowledgeStaff(locals.user, url);

	// The page must be one the viewer can read, as everywhere else: an unknown tag is 404.
	const found = await getPageByTag(user, params.tag);
	if (!found.ok) error(404, 'Not found');

	return json(await mentionablesForPage(user, url.searchParams.get('q') ?? ''));
};
