import { json } from '@sveltejs/kit';
import { requirePermission } from '#lib/server/auth/guards.js';
import { projectOptions } from '../options';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals, params, url }) => {
	const user = requirePermission(locals.user, 'tickets.manage');
	return json(await projectOptions(user, params.tag, url.searchParams.get('q') ?? '', false));
};
