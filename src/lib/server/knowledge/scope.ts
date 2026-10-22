import { and, eq, exists, isNotNull, isNull, sql, type SQL } from 'drizzle-orm';
import { can } from '../access/permissions';
import type { SessionUser } from '../auth/guards';
import { getDb } from '../db';
import { knowledgeSpaces, pages } from './schema';

/**
 * Which spaces and pages a viewer may read, as SQL. A leaf module, like
 * `projects/scope.ts`: every read in the domain starts from these, including the
 * ones in sibling files, and a predicate living in the barrel would turn that
 * into an import cycle.
 *
 * **The audience is the single question every read asks** (ADR 0031, ADR 0028):
 * `knowledge.manage` (technician, admin) reads both audiences and drafts;
 * everybody else reads `portal` spaces and their published pages. The condition
 * is part of the query, never a filter after loading, so a record the viewer
 * cannot read is simply absent.
 *
 * `null` means the viewer holds no `knowledge.view`. Callers turn that into a
 * thrown error (`requireSpaceScope`): an empty list is indistinguishable from a
 * correctly-scoped empty one, and would hide a route that forgot its guard.
 */

/** Staff read both audiences and see drafts; everyone else is the portal. */
export function readsAsStaff(viewer: SessionUser): boolean {
	return can(viewer, 'knowledge.manage');
}

/**
 * The audience half of the space scope, on its own: used by the catalogue
 * listing, which adds "archived too" on top of it.
 */
export function audienceScope(viewer: SessionUser): SQL {
	return and(
		eq(knowledgeSpaces.organisationId, viewer.organisationId),
		readsAsStaff(viewer) ? undefined : eq(knowledgeSpaces.audience, 'portal')
	) as SQL;
}

/** Organisation, not archived, and `portal` unless the viewer is staff. */
export function readableSpaces(viewer: SessionUser): SQL | null {
	if (!can(viewer, 'knowledge.view')) return null;
	return and(audienceScope(viewer), isNull(knowledgeSpaces.archivedAt)) as SQL;
}

/**
 * The page's space is readable **and** the page is not archived **and**, for a
 * non-staff viewer, it is published. Staff see drafts; archived pages are the
 * staff's "show archived" reads (`includeArchived`, ignored for everyone else).
 */
export function readablePages(
	viewer: SessionUser,
	options: { includeArchived?: boolean } = {}
): SQL {
	const spaces = requireSpaceScope(viewer);
	// "Show archived" is a staff-only read: for anybody else the flag is ignored.
	const withArchived = options.includeArchived === true && readsAsStaff(viewer);
	return and(
		eq(pages.organisationId, viewer.organisationId),
		withArchived ? undefined : isNull(pages.archivedAt),
		readsAsStaff(viewer) ? undefined : isNotNull(pages.publishedAt),
		exists(
			getDb()
				.select({ one: sql`1` })
				.from(knowledgeSpaces)
				.where(and(eq(knowledgeSpaces.id, pages.spaceId), spaces))
		)
	) as SQL;
}

export function requireSpaceScope(viewer: SessionUser): SQL {
	const scope = readableSpaces(viewer);
	if (scope) return scope;

	// An invariant violation, not a business failure: a route that reaches a
	// listing without `requirePermission` is a bug, and must not look like an
	// empty knowledge base.
	throw new Error(
		`The ${viewer.role} role holds no knowledge.view permission; the route should have called requirePermission first.`
	);
}

/**
 * Every write on the catalogue of spaces requires `knowledge.spaces.manage`. The
 * route gates the screen (ADR 0007) and this is the backstop, so a function
 * called from the wrong place fails loudly instead of writing.
 */
export function requireSpacesManage(actor: SessionUser): void {
	if (!can(actor, 'knowledge.spaces.manage')) {
		throw new Error(
			`The ${actor.role} role cannot manage knowledge spaces; the route should have called requirePermission first.`
		);
	}
}

/**
 * Every write on pages requires `knowledge.manage` (technician, admin). Like
 * `requireSpacesManage`, a backstop to the route's gate that throws.
 */
export function requirePagesManage(actor: SessionUser): void {
	if (!can(actor, 'knowledge.manage')) {
		throw new Error(
			`The ${actor.role} role cannot manage knowledge pages; the route should have called requirePermission first.`
		);
	}
}
