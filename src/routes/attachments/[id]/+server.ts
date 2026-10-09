import { error } from '@sveltejs/kit';
import { z } from 'zod';
import { requireAnyPermission } from '#lib/server/auth/guards.js';
import { TICKET_READ_PERMISSIONS } from '#lib/domain/access.js';
import { getAttachment } from '#lib/server/service-desk/index.js';
import type { RequestHandler } from './$types';

/**
 * Serves one attachment to somebody who may read the comment it hangs off.
 * Shared by the staff screens and the portal, because the answer is the same:
 * the domain resolves the id through the viewer's ticket scope, so another
 * organisation's id, or an employee asking for an internal note's file, is a
 * 404 that confirms nothing.
 */
export const GET: RequestHandler = async ({ locals, params }) => {
	const user = requireAnyPermission(locals.user, TICKET_READ_PERMISSIONS);

	if (!z.uuid().safeParse(params.id).success) error(404, 'Not found');
	const outcome = await getAttachment(user, params.id);
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
