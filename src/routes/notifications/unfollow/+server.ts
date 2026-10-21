import { error, json } from '@sveltejs/kit';
import { z } from 'zod';
import { unfollowFromNotification } from '#lib/server/notifications/index.js';
import { requireSession } from '../viewer';
import type { RequestHandler } from './$types';

/** Stops following the record a notification was about, from the bell panel. */
export const POST: RequestHandler = async ({ locals, request }) => {
	const user = requireSession(locals.user);

	const parsed = z.object({ id: z.uuid() }).safeParse(await request.json().catch(() => null));
	if (!parsed.success) error(400, 'Bad request');

	const outcome = await unfollowFromNotification(user, parsed.data.id);
	if (!outcome.ok) error(outcome.error === 'not_found' ? 404 : 409, outcome.error);
	return json({ ok: true });
};
