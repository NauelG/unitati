import { json } from '@sveltejs/kit';
import { requirePermission } from '#lib/server/auth/guards.js';
import { taskOptions } from '../options';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals, params, url }) => {
	const user = requirePermission(locals.user, 'tickets.manage');
	return json(await taskOptions(user, params.tag, url.searchParams.get('q') ?? ''));
};
