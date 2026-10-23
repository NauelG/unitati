import { error } from '@sveltejs/kit';
import { getPageByTag, listRevisions } from '#lib/server/knowledge/index.js';
import { requireKnowledgeStaff } from '../../actions';
import type { PageServerLoad } from './$types';

/** A page's history (#324): every revision, newest first. Staff only, archived pages included. */
export const load: PageServerLoad = async ({ locals, params, url }) => {
	const user = requireKnowledgeStaff(locals.user, url);
	const found = await getPageByTag(user, params.tag);
	if (!found.ok) error(404, 'Not found');
	const page = found.value;

	const revisions = await listRevisions(user, page.id);
	if (!revisions.ok) error(404, 'Not found');

	return {
		page: { tag: page.tag, title: page.title, revision: page.revision },
		space: { id: page.space.id, name: page.space.name },
		path: page.path,
		revisions: revisions.value
	};
};
