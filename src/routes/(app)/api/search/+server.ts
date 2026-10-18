import { json } from '@sveltejs/kit';
import { requireUser } from '#lib/server/auth/guards.js';
import { search } from '#lib/server/search/index.js';
import type { RequestHandler } from './$types';

/**
 * The transport for the in-app `GlobalSearch` (#12): it asks, `search()` answers.
 * Not the public API, which is #35. Everything that matters — the permission
 * scope, the grouping, the limits, the totals — happens inside `search()`, in the
 * query; this handler only identifies the viewer and passes the term through.
 */
export const GET: RequestHandler = async ({ locals, url }) => {
	const user = requireUser(locals.user);
	return json(await search(user, url.searchParams.get('q') ?? ''));
};
