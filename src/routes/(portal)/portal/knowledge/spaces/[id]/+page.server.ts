import { error } from '@sveltejs/kit';
import { listSpaces, listSpaceTree } from '#lib/server/knowledge/index.js';
import { requirePortalReader, requireUuid } from '../../reader';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, params, url }) => {
	const user = requirePortalReader(locals.user, url);
	requireUuid(params.id);

	const space = (await listSpaces(user)).find((entry) => entry.id === params.id);
	if (!space) error(404, 'Not found');

	const tree = await listSpaceTree(user, space.id);
	return {
		space: {
			id: space.id,
			name: space.name,
			description: space.description,
			icon: space.icon,
			colour: space.colour
		},
		tree: tree.map(({ id, tag, title, parentId, position, status }) => ({
			id,
			tag,
			title,
			parentId,
			position,
			status
		}))
	};
};
