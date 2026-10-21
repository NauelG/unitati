/**
 * Limits of a handover decision (#275). Shared by the server, which enforces
 * them, and the signing page, which checks them before the post.
 */

/** A rejection reason is 1 to this many characters, after trimming. */
export const MAX_DECISION_REASON = 1000;

/**
 * The condition a technician records for each asset they take back (#278). It
 * is a statement about the return, never a lifecycle state: a `damaged` laptop
 * does not go `in_repair` by itself.
 */
export const HANDOVER_CONDITIONS = ['good', 'damaged', 'incomplete'] as const;
export type HandoverCondition = (typeof HANDOVER_CONDITIONS)[number];

/** Condition notes are optional for `good`, required otherwise, and this long at most. */
export const MAX_CONDITION_NOTES = 500;

/**
 * The notes to store for one asset's condition, or `null` when they break the
 * rule. Shared by the take-back dialog and the domain, so the button and the
 * refusal agree. Blank notes on a `good` asset are no notes.
 */
export function conditionNotes(
	condition: HandoverCondition,
	raw: string | null | undefined
): { ok: true; notes: string | null } | { ok: false } {
	const notes = raw?.trim() ?? '';
	if ([...notes].length > MAX_CONDITION_NOTES) return { ok: false };
	if (notes === '') return condition === 'good' ? { ok: true, notes: null } : { ok: false };
	return { ok: true, notes };
}
