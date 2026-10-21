import { json } from '@sveltejs/kit';
import { requirePermission } from '#lib/server/auth/guards.js';
import { searchStaffMentionables } from '#lib/server/service-desk/index.js';
import type { RequestHandler } from './$types';

/** The picker of the staff form that opens a ticket (#303): staff only, there is no ticket yet. */
export const GET: RequestHandler = async ({ locals, url }) => {
	const user = requirePermission(locals.user, 'tickets.manage');
	return json(await searchStaffMentionables(user, url.searchParams.get('q') ?? ''));
};
