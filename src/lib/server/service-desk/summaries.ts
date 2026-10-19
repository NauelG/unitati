import { and, eq, inArray, notInArray, sql } from 'drizzle-orm';
import type { Priority, TicketStatus } from '#lib/domain/status.js';
import { can } from '../access/permissions';
import type { SessionUser } from '../auth/guards';
import { getDb } from '../db';
import { people } from '../directory/schema';
import { tickets } from './schema';
import { requireTicketScope } from './scope';

export interface TicketRow {
	id: string;
	ticketTag: string;
	subject: string;
	status: TicketStatus;
	priority: Priority;
	/** Who it is assigned to today, or `null` while nobody has taken it. */
	assigneeName: string | null;
}

/**
 * The tickets among `ids` the viewer may see, for `links` to draw on the other
 * side of a relation without joining this domain's table (ADR 0002). Anybody
 * who reads no ticket at all gets none, rather than the throw `requireTicketScope`
 * reserves for a route that forgot its guard.
 */
export async function ticketSummaries(viewer: SessionUser, ids: string[]): Promise<TicketRow[]> {
	if (ids.length === 0) return [];
	if (!can(viewer, 'tickets.view') && !can(viewer, 'tickets.view.own')) return [];

	return getDb()
		.select({
			id: tickets.id,
			ticketTag: tickets.ticketTag,
			subject: tickets.subject,
			status: tickets.status,
			priority: tickets.priority,
			assigneeName: people.fullName
		})
		.from(tickets)
		.leftJoin(people, eq(tickets.assigneePersonId, people.id))
		.where(and(requireTicketScope(viewer), inArray(tickets.id, ids)));
}

/** Whether the viewer is the requester of this ticket of their organisation. */
export async function isRequester(viewer: SessionUser, ticketId: string): Promise<boolean> {
	if (viewer.personId === null) return false;

	const [own] = await getDb()
		.select({ id: tickets.id })
		.from(tickets)
		.where(
			and(
				eq(tickets.id, ticketId),
				eq(tickets.organisationId, viewer.organisationId),
				eq(tickets.requesterPersonId, viewer.personId)
			)
		)
		.limit(1);

	return own !== undefined;
}

/** An unresolved ticket and who it is assigned to, for a notification about it. */
export interface AssignedOpenTicket extends Omit<TicketRow, 'assigneeName' | 'priority'> {
	assigneePersonId: string;
}

/**
 * The tickets among `ids` of an organisation that still need someone — neither
 * `resolved` nor `closed` — and have an assignee. Not scoped to a viewer: this
 * serves a notification the system sends, not a screen somebody reads, so the
 * caller is trusted to pass ids it found through a relation.
 */
export async function assignedOpenTickets(
	organisationId: string,
	ids: string[]
): Promise<AssignedOpenTicket[]> {
	if (ids.length === 0) return [];

	const rows = await getDb()
		.select({
			id: tickets.id,
			ticketTag: tickets.ticketTag,
			subject: tickets.subject,
			status: tickets.status,
			assigneePersonId: tickets.assigneePersonId
		})
		.from(tickets)
		.where(
			and(
				eq(tickets.organisationId, organisationId),
				inArray(tickets.id, ids),
				notInArray(tickets.status, ['resolved', 'closed'])
			)
		);

	return rows.flatMap(({ assigneePersonId, ...row }) =>
		assigneePersonId === null ? [] : [{ ...row, assigneePersonId }]
	);
}

/** How many unresolved tickets are assigned to the person: what deactivating them leaves behind. */
export async function countOpenTicketsAssignedTo(
	organisationId: string,
	personId: string
): Promise<number> {
	const [row] = await getDb()
		.select({ count: sql<number>`count(*)::int` })
		.from(tickets)
		.where(
			and(
				eq(tickets.organisationId, organisationId),
				eq(tickets.assigneePersonId, personId),
				notInArray(tickets.status, ['resolved', 'closed'])
			)
		);
	return row?.count ?? 0;
}
