import { listSpaces } from '#lib/server/knowledge/index.js';
import { create, requireKnowledgeStaff } from './actions';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, url }) => {
	const user = requireKnowledgeStaff(locals.user, url);
	return { spaces: await listSpaces(user) };
};

export const actions = { create };
