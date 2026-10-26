import { json } from '@sveltejs/kit';
import { requireUser } from '#lib/server/auth/guards.js';
import { visibleRunningTimer } from '#lib/server/links/index.js';
import { timerPayload } from '#lib/server/time/index.js';
import type { RequestHandler } from './$types';

/**
 * The transport for the app shell's `RunningTimer` refresh (ADR 0052): the
 * viewer's running timer and nothing else, so the minute poll does not re-run
 * the layout load (counts, navigation, organisation).
 */
export const GET: RequestHandler = async ({ locals }) => {
	const user = requireUser(locals.user);
	return json({ timer: timerPayload(await visibleRunningTimer(user)) });
};
