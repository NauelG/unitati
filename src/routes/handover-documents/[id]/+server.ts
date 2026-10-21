import { error } from '@sveltejs/kit';
import { z } from 'zod';
import { requireAnyPermission } from '#lib/server/auth/guards.js';
import { getHandoverDocument } from '#lib/server/assets/index.js';
import type { RequestHandler } from './$types';

/** The document is the stored evidence, never a fresh rendering. */
export const GET: RequestHandler = async ({ locals, params }) => {
	const viewer = requireAnyPermission(locals.user, ['assets.view', 'assets.view.own']);
	if (!z.uuid().safeParse(params.id).success) error(404, 'Not found');
	const outcome = await getHandoverDocument(viewer, params.id);
	if (!outcome.ok) error(404, 'Not found');

	return new Response(Buffer.from(outcome.value.data), {
		headers: {
			'content-type': 'application/pdf',
			'content-disposition': `attachment; filename*=UTF-8''${encodeURIComponent(outcome.value.code + '.pdf')}`,
			'x-content-type-options': 'nosniff',
			'cache-control': 'private, no-store'
		}
	});
};
