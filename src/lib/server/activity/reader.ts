import { and, desc, eq, sql } from 'drizzle-orm';
import { getDb } from '../db';
import { assets } from '../assets/schema';
import { tickets } from '../service-desk/schema';
import { organisations, people } from '../directory/schema';
import { serviceAccounts } from '../api/schema';
import { activity } from './schema';
import type { ActivityEntry } from './payload';
import type { ActivityTarget, ActivityTargetColumn } from './verbs';

/**
 * Reading the log back. Newest first, which is the only order a timeline is
 * ever asked for, and the order `activity_<target>_occurred` was built to serve.
 *
 * ADR 0009 is explicit that a record's full timeline is *a merge at read time*:
 * past events from here, live relations from `links`. This function returns the
 * events half; `links.mergeAssetTimeline` merges the other half in, which is why
 * it does not pretend to be the whole timeline.
 */

/**
 * One entry, with its payload narrowed by its verb — the discriminated union
 * from `payload.ts`, so a consumer that switches on `verb` gets the right
 * payload type in each branch instead of `unknown`.
 */
export type TimelineEntry = ActivityEntry & {
	id: string;
	occurredAt: Date;
	actorPersonId: string | null;
	/** Set when an integration acted: `actorName` is then the service account's name, and the UI tags it. */
	actorServiceAccountId: string | null;
	/**
	 * Resolved live from `people`, and deliberately so: the actor is a link to
	 * somebody who still exists, and a renamed colleague should read by their
	 * current name. The *fact* of the entry is never resolved this way — it is
	 * snapshotted into the payload on write, which is what keeps the history
	 * from rewriting itself (ADR 0009). Null when the system acted, or when the
	 * actor has since been deleted. A service account is never deleted, only
	 * disabled, so its name always resolves.
	 */
	actorName: string | null;
};

/**
 * Time entries are omitted while the organisation has tracking off (ADR 0052):
 * the rows stay, and reappear when it is switched back on.
 */
const TIME_VISIBLE = sql`(${activity.verb}::text not like 'time.%' or exists (select 1 from ${organisations} where ${organisations.id} = ${activity.organisationId} and ${organisations.timeTrackingEnabled}))`;

/** The person's current name, or the service account's: at most one of the two is joined. */
const ACTOR_NAME = sql<string | null>`coalesce(${people.fullName}, ${serviceAccounts.name})`;

export interface ActivityQuery {
	organisationId: string;
	target: ActivityTarget;
	limit?: number;
}

/**
 * The target arrives as a single-key object, so the column to filter on is its
 * one key. Reading it back out rather than taking a column name keeps the
 * compile-time "exactly one" guarantee at the call site.
 */
function targetColumn(target: ActivityTarget): ActivityTargetColumn {
	return Object.keys(target)[0] as ActivityTargetColumn;
}

export async function listActivity(query: ActivityQuery): Promise<TimelineEntry[]> {
	const column = targetColumn(query.target);
	const id = query.target[column as keyof ActivityTarget] as string;

	const rows = await getDb()
		.select({
			id: activity.id,
			verb: activity.verb,
			payload: activity.payload,
			occurredAt: activity.occurredAt,
			actorPersonId: activity.actorPersonId,
			actorServiceAccountId: activity.actorServiceAccountId,
			actorName: ACTOR_NAME
		})
		.from(activity)
		.leftJoin(people, eq(activity.actorPersonId, people.id))
		.leftJoin(serviceAccounts, eq(activity.actorServiceAccountId, serviceAccounts.id))
		// Scoped by organisation as well as by target (ADR 0004): the target id is
		// a uuid and effectively unguessable, but "effectively" is not a boundary.
		.where(
			and(eq(activity.organisationId, query.organisationId), eq(activity[column], id), TIME_VISIBLE)
		)
		// `occurred_at` alone is not a total order: two entries written in the same
		// transaction share it to the microsecond, and a timeline that reorders
		// between two reads of the same rows looks broken. `id` breaks the tie.
		.orderBy(desc(activity.occurredAt), desc(activity.id))
		.limit(query.limit ?? 100);

	// The row's `verb` and `payload` came out of the same column pair, so they
	// belong to the same arm of the union; the select cannot express that.
	return rows as TimelineEntry[];
}

/** What a feed item links to, in `RecordRef`'s own shape. Absent for the handful of verbs with no asset or ticket to point at. */
export type OrgActivityEntry = TimelineEntry & {
	record: { kind: 'asset' | 'ticket'; tag: string; title: string; href: string } | null;
	/**
	 * The task or project the entry is about, when it is about one: what a caller
	 * needs to drop entries of work the viewer cannot see (ADR 0042). The feed
	 * itself is not scoped by role, and these let its caller do it.
	 */
	taskId: string | null;
	projectId: string | null;
};

/**
 * The Overview's "recent activity" (#84): the organisation's whole feed,
 * newest first, not one record's timeline. `listActivity` above answers "what
 * happened to this asset/ticket/person"; this answers "what happened here" —
 * a different query, not a parameter this one was missing.
 *
 * Joins straight into `assets` and `tickets` for the `RecordRef` each entry
 * links to. That is not a domain reaching into another domain's table: ADR
 * 0002's rule binds the domains, and `activity` is cross-cutting, exactly as
 * `schema.ts` already is by carrying both tables' foreign keys.
 *
 * Unfiltered by role on purpose, for now: every caller today is staff who
 * already holds `assets.view` and `tickets.view` in full (ADR 0007's table has
 * no narrower role reaching the Overview), so there is nothing left to redact.
 * An employee-facing feed would need a real per-row visibility rule, not this
 * function with a flag bolted on.
 */
export async function listRecentActivity(
	organisationId: string,
	limit = 8
): Promise<OrgActivityEntry[]> {
	const rows = await getDb()
		.select({
			id: activity.id,
			verb: activity.verb,
			payload: activity.payload,
			occurredAt: activity.occurredAt,
			actorPersonId: activity.actorPersonId,
			actorServiceAccountId: activity.actorServiceAccountId,
			actorName: ACTOR_NAME,
			assetTag: assets.assetTag,
			assetName: assets.name,
			ticketTag: tickets.ticketTag,
			ticketSubject: tickets.subject,
			taskId: activity.taskId,
			projectId: activity.projectId
		})
		.from(activity)
		.leftJoin(people, eq(activity.actorPersonId, people.id))
		.leftJoin(serviceAccounts, eq(activity.actorServiceAccountId, serviceAccounts.id))
		.leftJoin(assets, eq(activity.assetId, assets.id))
		.leftJoin(tickets, eq(activity.ticketId, tickets.id))
		.where(and(eq(activity.organisationId, organisationId), TIME_VISIBLE))
		.orderBy(desc(activity.occurredAt), desc(activity.id))
		.limit(limit);

	return rows.map(({ assetTag, assetName, ticketTag, ticketSubject, ...entry }) => ({
		...entry,
		record: assetTag
			? {
					kind: 'asset' as const,
					tag: assetTag,
					title: assetName ?? assetTag,
					href: `/assets/${assetTag}`
				}
			: ticketTag
				? {
						kind: 'ticket' as const,
						tag: ticketTag,
						title: ticketSubject ?? ticketTag,
						href: `/service-desk/${ticketTag}`
					}
				: null
	})) as OrgActivityEntry[];
}
