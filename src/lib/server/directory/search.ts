import { and, eq, sql } from 'drizzle-orm';
import { can } from '../access/permissions';
import type { SessionUser } from '../auth/guards';
import { getDb } from '../db';
import { matches, rankOf, type SearchHitKind, type SearchTerm } from '../shared/search-hits';
import { people } from './schema';

/**
 * The directory's half of global search (#12): people, for whoever holds
 * `people.view`. Everybody else gets no group at all. People have no code, so a
 * person is never an exact-code hit.
 */
export function personHits(viewer: SessionUser, term: SearchTerm) {
	if (!can(viewer, 'people.view')) return null;

	return getDb()
		.select({
			kind: sql<SearchHitKind>`'person'`.as('kind'),
			id: sql<string>`${people.id}`.as('id'),
			code: sql<string | null>`null::text`.as('code'),
			title: sql<string>`${people.fullName}`.as('title'),
			subtitle: sql<string | null>`${people.email}`.as('subtitle'),
			rank: rankOf(people.search, 'simple', term, sql`false`).as('rank'),
			exact: sql<boolean>`false`.as('exact')
		})
		.from(people)
		.where(
			and(eq(people.organisationId, viewer.organisationId), matches(people.search, 'simple', term))
		);
}
