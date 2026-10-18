import { and, eq, isNull, or, sql, type SQL, type SQLWrapper } from 'drizzle-orm';
import { PROJECT_READ_PERMISSIONS } from '#lib/domain/access.js';
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
import { projects, tasks } from './schema';
import { requireProjectScope, requireTaskScope } from './scope';

/**
 * The `q` filter for the domain: Spanish stemming, so "mudanzas" finds
 * "Mudanza", and unaccented on both sides, so "migracion" finds "Migración".
 * The vectors it matches against are the generated `search` columns on
 * `projects` and `tasks`.
 */
export function matchesQuery(vector: SQLWrapper, term: string): SQL {
	return sql`${vector} @@ plainto_tsquery('spanish', immutable_unaccent(${term}))`;
}

/* -------------------------------------------------------------------------- */
/* Global search (#12)                                                        */
/* -------------------------------------------------------------------------- */

/**
 * Projects and tasks as hits, each through its own scope. `null` when the viewer
 * holds no project-read permission. Archived projects, and the tasks inside them,
 * are left out: they exist so history survives, not to pad results.
 */
export function projectHits(viewer: SessionUser, term: SearchTerm) {
	if (!PROJECT_READ_PERMISSIONS.some((permission) => can(viewer, permission))) return null;

	const exact = isCode(projects.projectTag, term);

	return getDb()
		.select({
			kind: sql<SearchHitKind>`'project'`.as('kind'),
			id: sql<string>`${projects.id}`.as('id'),
			code: sql<string | null>`${projects.projectTag}`.as('code'),
			title: sql<string>`${projects.name}`.as('title'),
			subtitle: sql<string | null>`null::text`.as('subtitle'),
			rank: rankOf(projects.search, 'spanish', term, exact).as('rank'),
			exact: sql<boolean>`${exact}`.as('exact')
		})
		.from(projects)
		.where(
			and(
				requireProjectScope(viewer),
				isNull(projects.archivedAt),
				or(matchSpanish(projects.search, term), exact)
			)
		);
}

export function taskHits(viewer: SessionUser, term: SearchTerm) {
	if (!PROJECT_READ_PERMISSIONS.some((permission) => can(viewer, permission))) return null;

	const exact = isCode(tasks.taskTag, term);

	return getDb()
		.select({
			kind: sql<SearchHitKind>`'task'`.as('kind'),
			id: sql<string>`${tasks.id}`.as('id'),
			code: sql<string | null>`${tasks.taskTag}`.as('code'),
			title: sql<string>`${tasks.title}`.as('title'),
			subtitle: sql<string | null>`${projects.projectTag}`.as('subtitle'),
			rank: rankOf(tasks.search, 'spanish', term, exact).as('rank'),
			exact: sql<boolean>`${exact}`.as('exact')
		})
		.from(tasks)
		.innerJoin(projects, eq(tasks.projectId, projects.id))
		.where(
			and(
				requireTaskScope(viewer),
				isNull(projects.archivedAt),
				or(matchSpanish(tasks.search, term), exact)
			)
		);
}

const matchSpanish = (vector: SQLWrapper, term: SearchTerm) => matches(vector, 'spanish', term);
