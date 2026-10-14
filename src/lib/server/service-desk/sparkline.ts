import { and, gte, sql } from 'drizzle-orm';
import type { SessionUser } from '../auth/guards';
import { getDb } from '../db';
import {
	densifyDailyCounts,
	sparklineSince,
	sparklineWindow,
	type SparklinePoint
} from '../shared/sparkline';
import { tickets } from './schema';
import { requireTicketScope } from './scope';

/**
 * Tickets opened per day (#90): the 7-day shape under the service-desk KPI.
 *
 * "Opened" is the row being created, so `created_at` answers it exactly and no
 * schema change is needed. Note what this deliberately is *not*: it is not
 * "open tickets per day", which would be a running balance and needs the
 * close events to compute. A sparkline under "Solicitudes abiertas" shows the
 * inflow that produced that number, not the number's own history — the latter
 * would require snapshotting a daily total nothing records yet.
 *
 * Scoped with `requireTicketScope`, like every other read in the domain, so an
 * employee who only sees their own tickets gets the shape of their own inflow.
 *
 * See `assets/sparkline.ts` for why the day bucket names UTC explicitly; the
 * same reasoning and the same caveat apply here.
 */
export async function ticketOpeningsSparkline(
	viewer: SessionUser,
	days: number,
	/** Injected by the specs so a dated fixture is not a race against midnight. */
	now: Date = new Date()
): Promise<SparklinePoint[]> {
	const span = sparklineWindow(days);
	const since = sparklineSince(now, span);

	const rows = await getDb()
		.select({
			day: sql<string>`to_char(${tickets.createdAt} at time zone 'UTC', 'YYYY-MM-DD')`.as('day'),
			count: sql<number>`count(*)::int`
		})
		.from(tickets)
		.where(and(requireTicketScope(viewer), gte(tickets.createdAt, since)))
		.groupBy(sql`1`);

	return densifyDailyCounts(rows, now, span);
}
