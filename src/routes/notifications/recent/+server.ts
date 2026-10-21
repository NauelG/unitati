import { json } from '@sveltejs/kit';
import { INBOX_PAGE_SIZE, listInbox } from '#lib/server/notifications/index.js';
import { requireSession } from '../viewer';
import type { RequestHandler } from './$types';

/**
 * A page of the viewer's inbox as JSON, for the bell's panel (the 20 most recent)
 * and for "Cargar más" on the inbox pages (`cursor`, `unread=1`).
 */
export const GET: RequestHandler = async ({ locals, url }) => {
	const user = requireSession(locals.user);
	const page = await listInbox(user, {
		limit: INBOX_PAGE_SIZE,
		unreadOnly: url.searchParams.get('unread') === '1',
		cursor: url.searchParams.get('cursor') ?? undefined
	});
	return json(page, { headers: { 'cache-control': 'no-store' } });
};
