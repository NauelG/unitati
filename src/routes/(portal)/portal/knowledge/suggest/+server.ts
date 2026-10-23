import { json } from '@sveltejs/kit';
import { can } from '#lib/server/access/permissions.js';
import { requirePermission } from '#lib/server/auth/guards.js';
import { searchPages } from '#lib/server/knowledge/index.js';
import type { RequestHandler } from './$types';

const MIN_LENGTH = 3;
const SUGGESTION_LIMIT = 5;

/**
 * "¿Te ayuda alguna de estas páginas?" under the subject of a free-form ticket
 * (#329). Same scope as every employee read: published pages of `portal` spaces.
 * Staff would also get drafts and `staff` spaces from the scope, and are not the
 * audience of a deflection, so they get nothing. Only title and code leave.
 */
export const GET: RequestHandler = async ({ locals, url }) => {
	const user = requirePermission(locals.user, 'knowledge.view', url);
	const query = (url.searchParams.get('q') ?? '').trim();
	if (query.length < MIN_LENGTH || can(user, 'knowledge.manage')) return json({ pages: [] });

	const hits = await searchPages(user, query, { limit: SUGGESTION_LIMIT });
	return json({ pages: hits.map(({ tag, title }) => ({ tag, title })) });
};
