import { and, or, sql } from 'drizzle-orm';
import { TICKET_READ_PERMISSIONS } from '#lib/domain/access.js';
import { can } from '../access/permissions';
import type { SessionUser } from '../auth/guards';
import { getDb } from '../db';
import {
	isCode,
	matches,
	rankOf,
	type SearchHitKind,
	type SearchTerm
} from '../shared/search-hits';
import { requireTicketScope } from './scope';
import { tickets } from './schema';

/**
 * The tickets' half of global search (#12). Matches the subject only: a matching
 * comment surfaces its ticket through the viewer's ordinary reads, not as a group
 * of its own, so one ticket never appears four times because four comments matched.
 *
 * The scope is the same one every list starts from. A requester's own tickets are
 * all an employee can find, and the exact code of somebody else's matches nothing.
 */
export function ticketHits(viewer: SessionUser, term: SearchTerm) {
	if (!TICKET_READ_PERMISSIONS.some((permission) => can(viewer, permission))) return null;

	const exact = isCode(tickets.ticketTag, term);

	return getDb()
		.select({
			kind: sql<SearchHitKind>`'ticket'`.as('kind'),
			id: sql<string>`${tickets.id}`.as('id'),
			code: sql<string | null>`${tickets.ticketTag}`.as('code'),
			title: sql<string>`${tickets.subject}`.as('title'),
			subtitle: sql<string | null>`null::text`.as('subtitle'),
			rank: rankOf(tickets.search, 'spanish', term, exact).as('rank'),
			exact: sql<boolean>`${exact}`.as('exact')
		})
		.from(tickets)
		.where(and(requireTicketScope(viewer), or(matches(tickets.search, 'spanish', term), exact)));
}
