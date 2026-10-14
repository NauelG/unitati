import { z } from 'zod';
import { PRIORITIES, TICKET_STATUSES } from '#lib/domain/status.js';
import { getTicketByTag, listTickets, type TicketView } from '../../service-desk';
import { defineEndpoint, notFound } from '../registry';

/**
 * A ticket on the wire. The UUID is left out on purpose (ADR 0010): a ticket is
 * addressed by its tag. People and queues have no code, so they keep their ids.
 * The output schema is the allow-list, because Zod drops what it does not name.
 */
const person = z.object({ id: z.string(), name: z.string() });

export const ticketSchema = z.object({
	tag: z.string(),
	subject: z.string(),
	status: z.enum(TICKET_STATUSES),
	priority: z.enum(PRIORITIES),
	channel: z.enum(['portal', 'agent']),
	queue: person,
	requester: person,
	assignee: person.nullable(),
	createdAt: z.iso.datetime(),
	updatedAt: z.iso.datetime()
});

function toWire(ticket: TicketView): z.input<typeof ticketSchema> {
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

const VIEW = ['tickets.view', 'tickets.view.own'] as const;

export const listTicketsEndpoint = defineEndpoint({
	id: 'tickets.list',
	method: 'GET',
	path: '/tickets',
	summary: 'List the tickets the key can see, newest first.',
	permissions: VIEW,
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
		meta: z.object({
			page: z.number(),
			perPage: z.number(),
			total: z.number(),
			pageCount: z.number()
		})
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
	permissions: VIEW,
	input: z.object({ tag: z.string().min(1) }),
	output: z.object({ data: ticketSchema }),
	handler: async ({ principal, input }) => {
		const outcome = await getTicketByTag(principal, input.tag);
		if (!outcome.ok) throw notFound('Ticket not found.');
		return { data: toWire(outcome.value) };
	}
});
