import { pageWindowFrom } from '#lib/server/shared/pagination.js';
import { requirePermission } from '#lib/server/auth/guards.js';
import { listTickets } from '#lib/server/service-desk/index.js';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, url }) => {
	const user = requirePermission(locals.user, 'tickets.view.own');
	const window = pageWindowFrom(url.searchParams);

	return { result: await listTickets(user, { page: window.page, perPage: window.perPage }) };
};
