import { error } from '@sveltejs/kit';
import { z } from 'zod';
import {
	getPageAttachment,
	getPageByTag,
	listPageAttachments
} from '#lib/server/knowledge/index.js';
import { requireKnowledgeStaff } from '../../../actions';
import type { RequestHandler } from './$types';

/**
 * Serves one attachment of the page in the URL. The domain resolves the id
 * through the page's own scope, so another organisation's id, or a page the
 * viewer may not read, is a 404 that confirms nothing. An id that belongs to a
 * different page than the one in the URL is a 404 too.
 */
export const GET: RequestHandler = async ({ locals, params, url }) => {
	const user = requireKnowledgeStaff(locals.user, url);

	if (!z.uuid().safeParse(params.id).success) error(404, 'Not found');
	const page = await getPageByTag(user, params.tag);
	if (!page.ok) error(404, 'Not found');
	const listed = await listPageAttachments(user, page.value.id);
	if (!listed.ok || !listed.value.some((attachment) => attachment.id === params.id)) {
		error(404, 'Not found');
	}

	const outcome = await getPageAttachment(user, params.id);
	if (!outcome.ok) error(404, 'Not found');

	const { filename, contentType, data } = outcome.value;
	return new Response(Buffer.from(data), {
		headers: {
			'content-type': contentType,
			// `attachment`, never inline: a user-uploaded HTML or SVG must not run in our origin.
			'content-disposition': `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
			'x-content-type-options': 'nosniff'
		}
	});
};
