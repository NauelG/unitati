import { and, eq, inArray } from 'drizzle-orm';
import type { TicketStatus } from '#lib/domain/status.js';
import { can } from '../access/permissions';
import type { SessionUser } from '../auth/guards';
import { getDb } from '../db';
import { tickets } from './schema';
import { requireTicketScope } from './scope';

export interface TicketRow {
	id: string;
	ticketTag: string;
	subject: string;
	status: TicketStatus;
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
			status: tickets.status
		})
		.from(tickets)
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
