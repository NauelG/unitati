import { error } from '@sveltejs/kit';
import { z } from 'zod';
import {
	getPageAttachment,
	getPageByTag,
	listPageAttachments
} from '#lib/server/knowledge/index.js';
import { requirePortalReader } from '../../../reader';
import type { RequestHandler } from './$types';

/**
 * The portal's twin of the app's attachment download: same scope, so a page the
 * employee cannot read (draft, `staff` space) answers 404, and an id of another
 * page does too.
 */
export const GET: RequestHandler = async ({ locals, params, url }) => {
	const user = requirePortalReader(locals.user, url);

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
