import { and, eq, or, type SQL } from 'drizzle-orm';
import { can } from '../access/permissions';
import type { SessionUser } from '../auth/guards';
import { assets } from './schema';

/**
 * Which asset rows a viewer may see, as SQL.
 *
 * Extracted from `index.ts` (#90) into its own module, mirroring
 * `service-desk/scope.ts`, which has always been shaped this way. The reason is
 * the one that forced it there too: the scope is what *every* read in the
 * domain starts from, including the ones that live in sibling files
 * (`sparkline.ts`, `state-distribution.ts`). With the predicate in the barrel,
 * each of those would have to import from `./index` while `./index` re-exports
 * them — an import cycle that happens to work only because the call is made at
 * runtime rather than at module scope. A leaf module no one imports back is not
 * a cycle at all.
 *
 * `index.ts` still re-exports `requireAssetScope`, so `links` and anything else
 * outside the domain keeps importing it from `'../assets'` unchanged.
 */

/**
 * The rows a viewer may see at all, as SQL. Returns `null` when the viewer
 * holds no asset-read permission whatsoever, which the callers turn into a
 * thrown error rather than an empty page: an empty list is indistinguishable
 * from a correctly-scoped empty inventory, and silently returning one would
 * hide a route that forgot its `requirePermission`.
 */
function visibleAssets(viewer: SessionUser): SQL | null {
	const organisation = eq(assets.organisationId, viewer.organisationId);

	if (can(viewer, 'assets.view')) return organisation;

	const clauses: SQL[] = [];

	/**
	 * The null check is the point, not a formality. An employee whose credential
	 * has no directory record has `personId === null`, and "the assets in my
	 * custody" written against it becomes `custodian_person_id is null` — which
	 * matches every asset nobody holds, i.e. most of the inventory. The clause
	 * has to be dropped, not parameterised with null.
	 */
	if (can(viewer, 'assets.view.own') && viewer.personId !== null) {
		clauses.push(eq(assets.custodianPersonId, viewer.personId));
	}

	if (can(viewer, 'assets.view.shared')) clauses.push(eq(assets.shared, true));

	if (clauses.length === 0) return null;

	return and(organisation, or(...clauses)) as SQL;
}

/**
 * Exported for `links`, which has to ask "may this person see this asset?" when
 * somebody attaches one to a ticket. The rule stays here, in one place: `links`
 * composes it into its own query instead of restating who holds what (ADR 0002).
 */
export function requireAssetScope(viewer: SessionUser): SQL {
	const scope = visibleAssets(viewer);
	if (scope) return scope;

	// An invariant violation, not a business failure: every role in ADR 0007
	// holds at least one asset-read permission, so arriving here means a route
	// called a listing without gating it first.
	throw new Error(
		`The ${viewer.role} role holds no asset-read permission; the route should have called requirePermission first.`
	);
}
