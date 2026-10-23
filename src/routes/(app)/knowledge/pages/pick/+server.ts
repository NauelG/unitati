import { json } from '@sveltejs/kit';
import { m } from '#lib/paraglide/messages.js';
import { requirePermission } from '#lib/server/auth/guards.js';
import { pickPages } from '#lib/server/knowledge/index.js';
import type { RequestHandler } from './$types';

/**
 * The page picker of the `document` editor (#324): the pages the viewer may link
 * to, by title or code. Readable is the domain's to decide, in the query
 * (published pages, and drafts for staff); this only shapes the answer the
 * editor lists.
 */
export const GET: RequestHandler = async ({ locals, url }) => {
	const user = requirePermission(locals.user, 'knowledge.view');
	const picks = await pickPages(user, url.searchParams.get('q') ?? '');
	return json(
		picks.map((pick) => ({
			tag: pick.tag,
			title: pick.title,
			hint: [pick.tag, pick.spaceName, pick.status === 'draft' ? m.knowledge_status_draft() : null]
				.filter(Boolean)
				.join(' · ')
		}))
	);
};
