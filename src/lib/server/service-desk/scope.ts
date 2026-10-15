import { and, eq, sql, type SQL } from 'drizzle-orm';
import { can } from '../access/permissions';
import type { SessionUser } from '../auth/guards';
import { tickets } from './schema';

/**
 * The tickets a viewer may see at all, as SQL; `null` when they hold no
 * ticket-read permission whatsoever, which callers turn into a thrown error
 * rather than an empty page (an empty list is indistinguishable from a
 * correctly-scoped empty queue, and would hide a route that forgot its guard).
 */
function visibleTickets(viewer: SessionUser): SQL | null {
	const organisation = eq(tickets.organisationId, viewer.organisationId);

	if (can(viewer, 'tickets.view')) return organisation;

	/**
	 * The null check is the point, not a formality: an employee whose credential
	 * has no directory record has `personId === null`, and "the tickets I opened"
	 * written against it would become `requester_person_id is null`. The clause
	 * has to be dropped, not parameterised with null.
	 */
	if (can(viewer, 'tickets.view.own')) {
		// A principal with no person (a service account) holds the permission but
		// has no tickets of its own: nothing, rather than an error.
		return viewer.personId !== null
			? (and(organisation, eq(tickets.requesterPersonId, viewer.personId)) as SQL)
			: (and(organisation, sql`false`) as SQL);
	}

	return null;
}

export function requireTicketScope(viewer: SessionUser): SQL {
	const scope = visibleTickets(viewer);
	if (scope) return scope;

	throw new Error(
		`The ${viewer.role} role holds no ticket-read permission; the route should have called requirePermission first.`
	);
}

/** Staff see internal notes; everybody else never receives one (ADR 0007). */
export function seesInternal(viewer: SessionUser): boolean {
	return can(viewer, 'tickets.comment.internal');
}
