import { error, json } from '@sveltejs/kit';
import { z } from 'zod';
import { markAllRead, markRead } from '#lib/server/notifications/index.js';
import { requireSession } from '../viewer';
import type { RequestHandler } from './$types';

const body = z.union([z.object({ id: z.uuid() }), z.object({ all: z.literal(true) })]);

/** Marks one notification, or all of them, read. Another person's id is a 404. */
export const POST: RequestHandler = async ({ locals, request }) => {
	const user = requireSession(locals.user);

	const parsed = body.safeParse(await request.json().catch(() => null));
	if (!parsed.success) error(400, 'Bad request');

	if ('all' in parsed.data) {
		await markAllRead(user);
		return json({ ok: true });
	}

	const outcome = await markRead(user, parsed.data.id);
	if (!outcome.ok) error(404, 'Not found');
	return json({ ok: true });
};
