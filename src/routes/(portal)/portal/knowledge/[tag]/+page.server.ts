import { error } from '@sveltejs/kit';
import { getPageByTag, listPageAttachments, listSpaceTree } from '#lib/server/knowledge/index.js';
import { renderMarkdown } from '#lib/server/shared/markdown.js';
import { requirePortalReader } from '../reader';
import type { PageServerLoad } from './$types';

/**
 * What an employee reads of a page: title, body, where it sits, its files. The
 * payload is built field by field — no revision, author, status or comments —
 * so nothing staff-only can ride along when `PageView` grows.
 */
export const load: PageServerLoad = async ({ locals, params, url }) => {
	const user = requirePortalReader(locals.user, url);

	const found = await getPageByTag(user, params.tag);
	if (!found.ok) error(404, 'Not found');
	const page = found.value;

	const [tree, attachments] = await Promise.all([
		listSpaceTree(user, page.space.id),
		listPageAttachments(user, page.id)
	]);
	if (!attachments.ok) error(404, 'Not found');

	return {
		page: { id: page.id, tag: page.tag, title: page.title },
		space: { id: page.space.id, name: page.space.name },
		path: page.path,
		bodyHtml: renderMarkdown(page.body, 'document'),
		hasBody: page.body.trim() !== '',
		attachments: attachments.value.map(({ id, filename, contentType, byteSize }) => ({
			id,
			filename,
			contentType,
			byteSize
		})),
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
