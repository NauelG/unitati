import { error, json } from '@sveltejs/kit';
import { getPageByTag, listPageAttachments } from '#lib/server/knowledge/index.js';
import { renderMarkdown } from '#lib/server/shared/markdown.js';
import { requirePortalReader } from '../../reader';
import type { RequestHandler } from './$types';

/**
 * A page rendered for the dialog that opens over the ticket form (#329): the
 * reader's own fields, without the tree. Same scope as the page itself, so a
 * draft or a `staff` page answers 404.
 */
export const GET: RequestHandler = async ({ locals, params, url }) => {
	const user = requirePortalReader(locals.user, url);

	const found = await getPageByTag(user, params.tag);
	if (!found.ok) error(404, 'Not found');
	const attachments = await listPageAttachments(user, found.value.id);
	if (!attachments.ok) error(404, 'Not found');

	return json({
		tag: found.value.tag,
		title: found.value.title,
		bodyHtml: renderMarkdown(found.value.body, 'document'),
		hasBody: found.value.body.trim() !== '',
		attachments: attachments.value.map(({ id, filename, contentType, byteSize }) => ({
			id,
			filename,
			contentType,
			byteSize
		}))
	});
};
