import { error } from '@sveltejs/kit';
import { z } from 'zod';
import { listSpaces, listSpaceTree } from '#lib/server/knowledge/index.js';
import { create, move, reorder, requireKnowledgeStaff } from '../../actions';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, params, url }) => {
	const user = requireKnowledgeStaff(locals.user, url);
	if (!z.uuid().safeParse(params.id).success) error(404, 'Not found');

	const space = (await listSpaces(user)).find((entry) => entry.id === params.id);
	if (!space) error(404, 'Not found');

	const showArchived = url.searchParams.get('archived') === '1';
	return {
		space,
		showArchived,
		tree: await listSpaceTree(user, space.id, { includeArchived: showArchived })
	};
};

export const actions = { create, move, reorder };
