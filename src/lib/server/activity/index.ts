/**
 * The activity module's entry point (ADR 0002): callers import from here, never
 * from a file inside.
 *
 * No table and no async functions yet — those arrive with the first domain that
 * writes activity (#7, slice 2). What exists is the contract: the vocabulary and
 * the payload shapes, which had to be settled before anything could write one.
 */

export { ACTIVITY_VERBS, ACTIVITY_TARGETS } from './verbs';
export type { ActivityVerb, ActivityTarget, ActivityTargetColumn } from './verbs';

export { PAYLOAD_SCHEMAS, parsePayload } from './payload';
export type { ActivityEntry, PayloadFor } from './payload';
