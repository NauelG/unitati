/**
 * The activity module's entry point (ADR 0002): callers import from here, never
 * from a file inside.
 *
 * PR 1 of #7 settled the contract — the vocabulary and the payload shapes —
 * because it had to exist before anything could write a row. This slice adds
 * what writes them: the table, its `CHECK` that exactly one target column is
 * set, and `recordActivity`.
 */

export { ACTIVITY_VERBS, ACTIVITY_TARGETS } from './verbs';
export type { ActivityVerb, ActivityTarget, ActivityTargetColumn } from './verbs';

export { PAYLOAD_SCHEMAS, parsePayload } from './payload';
export type { ActivityEntry, PayloadFor } from './payload';

export { activity, activityVerb } from './schema';
export type { ActivityRow } from './schema';

export { recordActivity } from './writer';
export type { ActivityWrite } from './writer';

export { listActivity, listRecentActivity } from './reader';
export type { ActivityQuery, TimelineEntry, OrgActivityEntry } from './reader';
