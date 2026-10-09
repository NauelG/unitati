import { z } from 'zod';
import { TICKET_STATUSES } from '#lib/domain/status.js';
import { can } from '#lib/server/access/permissions.js';
import { requirePermission } from '#lib/server/auth/guards.js';
import { pageWindowFrom } from '#lib/server/shared/pagination.js';
import { listQueues, listTickets } from '#lib/server/service-desk/index.js';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, url }) => {
	// The staff list. An employee reaches their own tickets through the portal.
	const user = requirePermission(locals.user, 'tickets.view');

	const window = pageWindowFrom(url.searchParams);
	const search = url.searchParams.get('q')?.trim() ?? '';
	const queueId = z.uuid().safeParse(url.searchParams.get('queue')).data;
	const status = z.enum(TICKET_STATUSES).safeParse(url.searchParams.get('status')).data;

	const [result, queues] = await Promise.all([
		listTickets(user, { page: window.page, perPage: window.perPage, search, queueId, status }),
		listQueues(user)
	]);

	return {
		result,
		search,
		queueId: queueId ?? '',
		status: status ?? '',
		queues: queues.map(({ id, name }) => ({ id, name })),
		canCreate: can(user, 'tickets.create'),
		canManage: can(user, 'tickets.manage')
	};
};
