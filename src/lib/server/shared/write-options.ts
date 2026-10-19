import type { Executor } from '../db';

/**
 * The optional trailing parameter of a write that a bulk entry (an import) can
 * drive from outside (ADR 0034).
 *
 * `executor` is the caller's transaction. A function that opens
 * `executor.transaction(...)` inside one gets a savepoint, so a unique violation
 * it catches rolls back only itself and the caller's transaction stays usable.
 * `via` is ignored by writes whose activity has no `via`.
 */
export type WriteOptions = { executor?: Executor; via?: 'import' };
