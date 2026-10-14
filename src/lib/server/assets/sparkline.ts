import { and, gte, sql } from 'drizzle-orm';
import type { SessionUser } from '../auth/guards';
import { getDb } from '../db';
import {
	densifyDailyCounts,
	sparklineSince,
	sparklineWindow,
	type SparklinePoint
} from '../shared/sparkline';
import { assets } from './schema';
import { requireAssetScope } from './scope';

/**
 * Asset registrations per day (#90): the 30-day shape under the assets KPI.
 *
 * Read-only, and no schema change behind it — `created_at` is already on every
 * table through `shared/columns.ts`, and "registered" is exactly the row coming
 * into existence. Nothing new is recorded to make this chart possible.
 *
 * **Scoped to the viewer, not just the organisation.** It reads
 * `requireAssetScope`, the same predicate `listAssets` and `assetSummary` use,
 * so an employee restricted to their own and shared rows sees a line that adds
 * up to the number printed above it. An org-wide count under a viewer-scoped
 * total would be two different inventories in one card.
 */
export async function assetRegistrationsSparkline(
	viewer: SessionUser,
	days: number,
	/** Injected by the specs so a dated fixture is not a race against midnight. */
	now: Date = new Date()
): Promise<SparklinePoint[]> {
	const span = sparklineWindow(days);
	const since = sparklineSince(now, span);

	/**
	 * Bucketed in UTC, explicitly.
	 *
	 * `created_at` is `timestamptz`, so a bare `date_trunc('day', …)` would
	 * bucket by whatever `TimeZone` the connection happens to carry — the same
	 * query answering differently on two hosts, which is exactly the kind of
	 * bug that only shows up in production. Naming the zone makes the answer a
	 * property of the data instead of the server.
	 *
	 * The cost is real and worth stating: for a Madrid organisation a laptop
	 * registered at 00:30 local counts to the previous day. Fixing that needs a
	 * per-organisation time zone, which does not exist in the data model yet and
	 * is out of scope here (no schema change). When it lands, this is the line
	 * that takes it, and `shared/sparkline.ts`'s `utcDayKey` is its pair.
	 */
	const rows = await getDb()
		.select({
			day: sql<string>`to_char(${assets.createdAt} at time zone 'UTC', 'YYYY-MM-DD')`.as('day'),
			count: sql<number>`count(*)::int`
		})
		.from(assets)
		.where(and(requireAssetScope(viewer), gte(assets.createdAt, since)))
		.groupBy(sql`1`);

	return densifyDailyCounts(rows, now, span);
}
