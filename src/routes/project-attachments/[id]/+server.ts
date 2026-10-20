import { error } from '@sveltejs/kit';
import { z } from 'zod';
import { PROJECT_READ_PERMISSIONS } from '#lib/domain/access.js';
import { requireAnyPermission } from '#lib/server/auth/guards.js';
import { getProjectAttachment } from '#lib/server/projects/index.js';
import type { RequestHandler } from './$types';

/**
 * Serves one project attachment to somebody who may read the project it hangs off. The
 * domain resolves the id through the viewer's project scope, so another
 * organisation's id, or an employee asking for a project that is not theirs, is a 404
 * that confirms nothing.
 */
export const GET: RequestHandler = async ({ locals, params }) => {
	const user = requireAnyPermission(locals.user, PROJECT_READ_PERMISSIONS);

	if (!z.uuid().safeParse(params.id).success) error(404, 'Not found');
	const outcome = await getProjectAttachment(user, params.id);
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
