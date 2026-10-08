import type { Transaction } from '../db';
import { activity } from './schema';
import { parsePayload } from './payload';
import type { ActivityEntry } from './payload';
import type { ActivityTarget } from './verbs';

/**
 * The one way an activity row is written (ADR 0009).
 *
 * **It takes a `Transaction`, not a `Database`.** An action and its history
 * commit together or not at all: custody assigned without its entry is worse
 * than neither, because it is a history that cannot be trusted, and a history
 * that cannot be trusted is not read. Typing the parameter is what enforces
 * that — a caller who has not opened a transaction cannot call this function.
 *
 * Not a Drizzle hook, either: a hook knows that a row changed, not what it
 * meant, and can only ever produce "field X: a → b" — the useless log ADR 0009
 * exists to avoid.
 */
export type ActivityWrite = ActivityEntry & {
	organisationId: string;
	/** Null for the system: a scheduled rule acts without a person. */
	actorPersonId?: string | null;
	/** Exactly one record, as a single-key object the compiler can check. */
	target: ActivityTarget;
	/**
	 * When it happened. Defaults to the database's `now()`, which is right for
	 * anything happening as it is recorded; a backfill or an import passes the
	 * real time instead.
	 */
	occurredAt?: Date;
};

export async function recordActivity(tx: Transaction, entry: ActivityWrite): Promise<void> {
	// Validated here rather than trusted from the caller: the column is `jsonb`
	// and will accept any shape, so the union only binds data that came through
	// this gate. The parse throws, because a malformed payload is a programming
	// error and not an expected business failure.
	const payload = parsePayload(entry.verb, entry.payload);

	await tx.insert(activity).values({
		...entry.target,
		organisationId: entry.organisationId,
		actorPersonId: entry.actorPersonId ?? null,
		verb: entry.verb,
		payload,
		occurredAt: entry.occurredAt
	});
}
