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

/** What the database stores of a handover's outcome (ADR 0035, decision 3). */
export type StoredHandoverStatus = 'pending' | 'accepted' | 'rejected' | 'waived';

/** What a reader sees: `expired` is never stored, it is a pending handover past its date. */
export const HANDOVER_STATES = ['pending', 'expired', 'accepted', 'rejected', 'waived'] as const;
export type HandoverState = (typeof HANDOVER_STATES)[number];

/** What the list shows before anyone filters: the handovers that still need someone. */
export const DEFAULT_HANDOVER_STATES: readonly HandoverState[] = ['pending', 'rejected', 'expired'];

/**
 * The one place a handover's state is derived (ADR 0035, decision 3): there is
 * no scheduler, so nothing ever writes `expired`. Every list, panel and signing
 * route asks here, never a component.
 */
export function deriveHandoverState(
	handover: { status: StoredHandoverStatus; expiresAt: Date | null },
	now: Date
): HandoverState {
	if (
		handover.status === 'pending' &&
		handover.expiresAt !== null &&
		handover.expiresAt.getTime() <= now.getTime()
	) {
		return 'expired';
	}
	return handover.status;
}

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
