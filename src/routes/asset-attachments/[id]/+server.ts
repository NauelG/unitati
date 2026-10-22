import { error } from '@sveltejs/kit';
import { z } from 'zod';
import { requirePermission } from '#lib/server/auth/guards.js';
import { getAssetAttachment } from '#lib/server/assets/index.js';
import type { RequestHandler } from './$types';

/**
 * Serves one asset attachment to somebody who sees whole asset rows. The domain
 * resolves the id through the viewer's asset scope, so another organisation's id,
 * or a viewer restricted to shared or own assets, gets a 404 that confirms nothing.
 */
export const GET: RequestHandler = async ({ locals, params }) => {
	const user = requirePermission(locals.user, 'assets.view');

	if (!z.uuid().safeParse(params.id).success) error(404, 'Not found');
	const outcome = await getAssetAttachment(user, params.id);
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
