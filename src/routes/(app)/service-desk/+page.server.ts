import { z } from 'zod';
import { TICKET_STATUSES } from '#lib/domain/status.js';
import { can } from '#lib/server/access/permissions.js';
import { requirePermission } from '#lib/server/auth/guards.js';
import { listPeople } from '#lib/server/directory/index.js';
import { pageWindowFrom } from '#lib/server/shared/pagination.js';
import {
	listQueues,
	listRequestForms,
	listTickets,
	parseTicketOrder,
	ticketSummary
} from '#lib/server/service-desk/index.js';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, url }) => {
	// The staff list. An employee reaches their own tickets through the portal.
	const user = requirePermission(locals.user, 'tickets.view');

	const window = pageWindowFrom(url.searchParams);
	const search = url.searchParams.get('q')?.trim() ?? '';
	const queueId = z.uuid().safeParse(url.searchParams.get('queue')).data;
	const requestFormId = z.uuid().safeParse(url.searchParams.get('form')).data;
	const status = z.enum(TICKET_STATUSES).safeParse(url.searchParams.get('status')).data;
	// The person page's "Ver todos" (#298). An id from another organisation matches nothing.
	const requesterId = z.uuid().safeParse(url.searchParams.get('requester')).data;

	const order = parseTicketOrder(url.searchParams);

	const [result, queues, requestForms, summary] = await Promise.all([
		listTickets(user, {
			page: window.page,
			perPage: window.perPage,
			search,
			queueId,
			requestFormId,
			status,
			requesterPersonId: requesterId,
			order
		}),
		listQueues(user),
		listRequestForms(user),
		// The same scope as the list (#84): a filter narrows `result`, not this.
		ticketSummary(user)
	]);

	const requesterName = requesterId
		? ((await listPeople(user.organisationId, { includeInactive: true })).find(
				(person) => person.id === requesterId
			)?.fullName ?? null)
		: null;

	return {
		result,
		requester: requesterId ? { id: requesterId, name: requesterName } : null,
		search,
		order,
		summary,
		queueId: queueId ?? '',
		requestFormId: requestFormId ?? '',
		status: status ?? '',
		queues: queues.map(({ id, name }) => ({ id, name })),
		requestForms: requestForms.map(({ id, name }) => ({ id, name })),
		canCreate: can(user, 'tickets.create'),
		canManage: can(user, 'tickets.manage')
	};
};
