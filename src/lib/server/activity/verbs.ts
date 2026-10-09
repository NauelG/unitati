/**
 * The verb vocabulary of the activity log (ADR 0009), as plain TypeScript.
 *
 * Declared here and not as a `pgEnum` so there is one source of truth: the
 * Postgres enum is built from this list, not the other way round. It also lets
 * the payload contract below exist before the table does.
 *
 * A verb is the canonical key of what happened — never a rendered sentence.
 * Same principle as `StatusBadge`: the row stores the key, the renderer
 * produces the words through paraglide, so a history written today can be read
 * in English once #36 lands.
 */

/** Slices 2 to 4's verbs. #10, #11 and #12 append their own. */
export const ACTIVITY_VERBS = [
	'asset.created',
	'custody.assigned',
	'custody.returned',
	'state.changed',
	'location.changed',
	'note.added',
	'ticket.created',
	'ticket.status.changed',
	'ticket.assigned',
	'ticket.unassigned',
	'ticket.priority.changed',
	'ticket.queue.changed',
	'link.asset.added',
	'link.asset.removed'
] as const;

export type ActivityVerb = (typeof ACTIVITY_VERBS)[number];

/**
 * The entities that can carry history. Each becomes a nullable column on
 * `activity` with a `CHECK` that exactly one is set, so the integrity is the
 * database's and not a convention.
 */
export const ACTIVITY_TARGETS = ['assetId', 'ticketId', 'taskId', 'projectId', 'personId'] as const;

export type ActivityTargetColumn = (typeof ACTIVITY_TARGETS)[number];

/**
 * A reference to the one record an entry is about: a union of single-key
 * objects, so `{ assetId, ticketId }` is rejected by the compiler rather than
 * only by the `CHECK` — the constraint is the backstop, not the first defence.
 *
 * Derived from the list above rather than restating it, so the five names are
 * spelled once.
 */
export type ActivityTarget = {
	[Column in ActivityTargetColumn]: Record<Column, string>;
}[ActivityTargetColumn];
