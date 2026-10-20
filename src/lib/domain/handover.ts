/**
 * Limits of a handover decision (#275). Shared by the server, which enforces
 * them, and the signing page, which checks them before the post.
 */

/** A rejection reason is 1 to this many characters, after trimming. */
export const MAX_DECISION_REASON = 1000;
