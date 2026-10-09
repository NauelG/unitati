import { and, desc, eq } from 'drizzle-orm';
import { getDb } from '../db';
import { people } from '../directory/schema';
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
	/**
	 * Resolved live from `people`, and deliberately so: the actor is a link to
	 * somebody who still exists, and a renamed colleague should read by their
	 * current name. The *fact* of the entry is never resolved this way — it is
	 * snapshotted into the payload on write, which is what keeps the history
	 * from rewriting itself (ADR 0009). Null when the system acted, or when the
	 * actor has since been deleted.
	 */
	actorName: string | null;
};

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
			actorName: people.fullName
		})
		.from(activity)
		.leftJoin(people, eq(activity.actorPersonId, people.id))
		// Scoped by organisation as well as by target (ADR 0004): the target id is
		// a uuid and effectively unguessable, but "effectively" is not a boundary.
		.where(and(eq(activity.organisationId, query.organisationId), eq(activity[column], id)))
		// `occurred_at` alone is not a total order: two entries written in the same
		// transaction share it to the microsecond, and a timeline that reorders
		// between two reads of the same rows looks broken. `id` breaks the tie.
		.orderBy(desc(activity.occurredAt), desc(activity.id))
		.limit(query.limit ?? 100);

	// The row's `verb` and `payload` came out of the same column pair, so they
	// belong to the same arm of the union; the select cannot express that.
	return rows as TimelineEntry[];
}
