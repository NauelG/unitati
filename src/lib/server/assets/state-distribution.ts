import { sql } from 'drizzle-orm';
import { ASSET_STATES, type AssetState } from '#lib/domain/status.js';
import type { SessionUser } from '../auth/guards';
import { getDb } from '../db';
import { assets } from './schema';
import { requireAssetScope } from './scope';

/** One slice of the donut: a lifecycle state and how many assets sit in it. */
export interface AssetStateSlice {
	state: AssetState;
	count: number;
}

/**
 * How the viewer's inventory is spread across the four lifecycle states (#90),
 * for the donut in the assets index header.
 *
 * **Every state is always present, zeros included, in `ASSET_STATES` order.**
 * Two reasons, and neither is cosmetic. A `group by` returns no row for a state
 * nothing is in, so a legend built from the result would appear and disappear
 * as rows move between states — the chart's own key changing shape under the
 * reader. And the order has to be the vocabulary's, not the database's: without
 * an `order by` Postgres is free to return groups in any order, which would
 * reshuffle the slices (and so the colours) between two loads of the same page.
 *
 * Reading the order from `#lib/domain/status.js` rather than listing it here is
 * the ADR 0011 rule: one vocabulary, and `StatusBadge` reads the same list, so
 * a slice and the badge for the same state cannot disagree about either its
 * existence or its name.
 *
 * Scoped by `requireAssetScope`, like every other read in this domain, so the
 * donut describes the same inventory as the table under it.
 */
export async function assetStateDistribution(viewer: SessionUser): Promise<AssetStateSlice[]> {
	const rows = await getDb()
		.select({ state: assets.state, count: sql<number>`count(*)::int` })
		.from(assets)
		.where(requireAssetScope(viewer))
		.groupBy(assets.state);

	const counts = new Map(rows.map((row) => [row.state, row.count]));

	return ASSET_STATES.map((state) => ({ state, count: counts.get(state) ?? 0 }));
}
