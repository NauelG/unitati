import { getDb } from '../../db';
import { queues, ticketComments, tickets } from '../schema';

/**
 * Row builders for the service-desk specs. They insert straight into the
 * tables, bypassing the domain functions on purpose: a schema test should not
 * depend on the domain layer agreeing with it. Organisations, people and
 * viewers come from `assets/testing/fixtures.ts`, as they do for `activity`.
 */

export async function createQueue(organisationId: string, name = 'General') {
	const [queue] = await getDb().insert(queues).values({ organisationId, name }).returning();
	return queue;
}

type TicketOverrides = Partial<typeof tickets.$inferInsert>;

export async function createTicket(
	organisationId: string,
	queueId: string,
	requesterPersonId: string,
	overrides: TicketOverrides = {}
) {
	const [ticket] = await getDb()
		.insert(tickets)
		.values({
			organisationId,
			queueId,
			requesterPersonId,
			subject: 'The printer is jammed',
			channel: 'portal',
			...overrides
		})
		.returning();
	return ticket;
}

export async function createComment(
	organisationId: string,
	ticketId: string,
	authorPersonId: string | null,
	body: string,
	visibility: 'public' | 'internal' = 'public'
) {
	const [comment] = await getDb()
		.insert(ticketComments)
		.values({ organisationId, ticketId, authorPersonId, body, visibility })
		.returning();
	return comment;
}
