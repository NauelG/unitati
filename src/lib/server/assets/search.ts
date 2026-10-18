import { and, eq, ne, or, sql } from 'drizzle-orm';
import { ASSET_READ_PERMISSIONS } from '#lib/domain/access.js';
import { can } from '../access/permissions';
import type { SessionUser } from '../auth/guards';
import { getDb } from '../db';
import { locations } from '../directory/schema';
import {
	isCode,
	matches,
	rankOf,
	type SearchHitKind,
	type SearchTerm
} from '../shared/search-hits';
import { requireAssetScope } from './scope';
import { assetModels, assets } from './schema';

/**
 * The assets' half of global search (#12): a scoped sub-query in the shape
 * `search/` composes. `null` when the viewer holds no asset-read permission at
 * all, which leaves the group out rather than showing an empty one.
 *
 * Two rules live here because the schema and the scope live here:
 *
 * - **You may search exactly what you may see.** A row the viewer sees whole is
 *   matched against `search` (name, tag, serial) and its model; a row they see
 *   only as shared is matched against `searchShared` (name and tag). Matching a
 *   shared printer's serial would be an oracle behind the redaction.
 * - **Retired assets are left out.** They exist so history survives, not to pad
 *   results.
 */
export function assetHits(viewer: SessionUser, term: SearchTerm) {
	if (!ASSET_READ_PERMISSIONS.some((permission) => can(viewer, permission))) return null;

	const seesWhole = can(viewer, 'assets.view')
		? sql`true`
		: can(viewer, 'assets.view.own') && viewer.personId !== null
			? sql`${assets.custodianPersonId} = ${viewer.personId}`
			: sql`false`;

	const exact = isCode(assets.assetTag, term);
	const textMatch = sql`case when ${seesWhole}
		then (${matches(assets.search, 'simple', term)} or ${matches(assetModels.search, 'simple', term)})
		else ${matches(assets.searchShared, 'simple', term)} end`;

	return getDb()
		.select({
			kind: sql<SearchHitKind>`'asset'`.as('kind'),
			id: sql<string>`${assets.id}`.as('id'),
			code: sql<string | null>`${assets.assetTag}`.as('code'),
			title: sql<string>`${assets.name}`.as('title'),
			subtitle: sql<string | null>`${locations.name}`.as('subtitle'),
			rank: rankOf(
				sql`case when ${seesWhole} then ${assets.search} else ${assets.searchShared} end`,
				'simple',
				term,
				exact
			).as('rank'),
			exact: sql<boolean>`${exact}`.as('exact')
		})
		.from(assets)
		.innerJoin(assetModels, eq(assets.assetModelId, assetModels.id))
		.leftJoin(locations, eq(assets.locationId, locations.id))
		.where(and(requireAssetScope(viewer), ne(assets.state, 'retired'), or(textMatch, exact)));
}
