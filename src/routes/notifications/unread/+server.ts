import { json } from '@sveltejs/kit';
import { unreadCount } from '#lib/server/notifications/index.js';
import { requireSession } from '../viewer';
import type { RequestHandler } from './$types';

/** The bell's poll (ADR 0040): one integer, never cached. */
export const GET: RequestHandler = async ({ locals }) => {
	const user = requireSession(locals.user);
	return json({ count: await unreadCount(user) }, { headers: { 'cache-control': 'no-store' } });
};
