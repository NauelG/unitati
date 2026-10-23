import { error } from '@sveltejs/kit';
import { renderMarkdown } from '#lib/server/shared/markdown.js';
import { getPageByTag, listSpaces, listSpaceTree } from '#lib/server/knowledge/index.js';
import {
	archive,
	create,
	move,
	preview,
	publish,
	reorder,
	requireKnowledgeStaff,
	unarchive
} from '../actions';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, params, url }) => {
	const user = requireKnowledgeStaff(locals.user, url);

	const found = await getPageByTag(user, params.tag);
	if (!found.ok) error(404, 'Not found');
	const page = found.value;

	// Staff read archived pages, so the tree also shows them, or the page being
	// read would be missing from its own tree.
	const showArchived = url.searchParams.get('archived') === '1' || page.status === 'archived';
	const spaces = await listSpaces(user);
	const targets = spaces.filter((space) => space.archivedAt === null);

	const [tree, targetTrees] = await Promise.all([
		listSpaceTree(user, page.space.id, { includeArchived: showArchived }),
		// The "Mover…" dialog picks a parent from the target space's tree. One read per
		// space, archived pages left out: nothing can be moved under one.
		Promise.all(
			targets.map(async (space) => [space.id, await listSpaceTree(user, space.id)] as const)
		)
	]);

	return {
		page: {
			id: page.id,
			tag: page.tag,
			title: page.title,
			status: page.status,
			parentId: page.parentId,
			updatedAt: page.updatedAt,
			revision: page.revision,
			revisionAuthorName: page.revisionAuthorName,
			revisedAt: page.revisedAt
		},
		space: page.space,
		path: page.path,
		bodyHtml: renderMarkdown(page.body, 'document'),
		hasBody: page.body.trim() !== '',
		showArchived,
		tree,
		spaces: targets.map(({ id, name, audience }) => ({ id, name, audience })),
		targetTrees: Object.fromEntries(targetTrees)
	};
};

export const actions = { archive, create, move, preview, publish, reorder, unarchive };
