import { z } from 'zod';
import { PRIORITIES, TICKET_STATUSES } from '#lib/domain/status.js';
import { getTicketByTag, listTickets, type TicketView } from '../../service-desk';
import { defineEndpoint, notFound } from '../registry';
import { named, paginationMetaSchema } from '../shared-schemas';

/**
 * A ticket on the wire. The UUID is left out on purpose (ADR 0010): a ticket is
 * addressed by its tag. People and queues have no code, so they keep their ids.
 * The output schema is the allow-list, because Zod drops what it does not name.
 */
const personRef = z.object({ id: z.string(), name: z.string() });

export const ticketSchema = named(
	'Ticket',
	z.object({
		tag: z.string(),
		subject: z.string(),
		status: z.enum(TICKET_STATUSES),
		priority: z.enum(PRIORITIES),
		channel: z.enum(['portal', 'agent']),
		queue: personRef,
		requester: personRef,
		assignee: personRef.nullable(),
		createdAt: z.iso.datetime(),
		updatedAt: z.iso.datetime()
	})
);

export function toWire(ticket: TicketView): z.input<typeof ticketSchema> {
	return {
		tag: ticket.ticketTag,
		subject: ticket.subject,
		status: ticket.status,
		priority: ticket.priority,
		channel: ticket.channel,
		queue: { id: ticket.queueId, name: ticket.queueName },
		requester: { id: ticket.requesterPersonId, name: ticket.requesterName },
		assignee:
			ticket.assigneePersonId === null
				? null
				: { id: ticket.assigneePersonId, name: ticket.assigneeName ?? '' },
		createdAt: ticket.createdAt.toISOString(),
		updatedAt: ticket.updatedAt.toISOString()
	};
}

const VIEW_PERMISSIONS = ['tickets.view', 'tickets.view.own'] as const;

export const listTicketsEndpoint = defineEndpoint({
	id: 'tickets.list',
	method: 'GET',
	path: '/tickets',
	summary: 'List the tickets the key can see, newest first.',
	description:
		'Returns one page of the tickets the key can see, newest first. A key holding `tickets.view.own` sees only the tickets it requested. Filter with `search`, `queueId` and `status`; page with `page` and `perPage` (out-of-range values are clamped). The response carries `meta` with the totals.',
	permissions: VIEW_PERMISSIONS,
	// Out-of-range paging is clamped by the domain; only nonsense is refused.
	input: z.object({
		search: z.string().optional(),
		queueId: z.uuid().optional(),
		status: z.enum(TICKET_STATUSES).optional(),
		page: z.coerce.number().optional(),
		perPage: z.coerce.number().optional()
	}),
	output: z.object({
		data: z.array(ticketSchema),
		meta: paginationMetaSchema
	}),
	handler: async ({ principal, input }) => {
		const result = await listTickets(principal, input);
		return {
			data: result.rows.map(toWire),
			meta: {
				page: result.page,
				perPage: result.perPage,
				total: result.total,
				pageCount: result.pageCount
			}
		};
	}
});

export const getTicketEndpoint = defineEndpoint({
	id: 'tickets.get',
	method: 'GET',
	path: '/tickets/{tag}',
	summary: 'Get one ticket by its tag.',
	description:
		'Returns one ticket, addressed by its tag (for example `TCK-0042`). A ticket the key cannot see is answered with `404`, the same as one that does not exist.',
	permissions: VIEW_PERMISSIONS,
	input: z.object({ tag: z.string().min(1) }),
	output: z.object({ data: ticketSchema }),
	handler: async ({ principal, input }) => {
		const outcome = await getTicketByTag(principal, input.tag);
		if (!outcome.ok) throw notFound('Ticket not found.');
		return { data: toWire(outcome.value) };
	}
});
