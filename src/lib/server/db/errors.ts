/**
 * Reading a constraint violation back out of a failed query.
 *
 * Needed because the error a caller catches is **not** the driver's. Drizzle
 * wraps it in a `DrizzleQueryError` carrying the SQL and the parameters, and
 * hangs the `PostgresError` — the only object that knows the SQLSTATE and the
 * constraint name — off `cause`. Reading `error.code` straight gets `undefined`
 * and silently turns "that serial is taken" into a 500.
 *
 * The chain is walked rather than unwrapped once, so a future Drizzle release
 * that adds or removes a layer does not break this.
 */

export interface ConstraintViolation {
	/** SQLSTATE. `23505` unique, `23502` not-null, `23503` foreign key, `23514` check. */
	code: string;
	/** The constraint Postgres names. Empty only if the server did not report one. */
	constraint: string;
}

/** SQLSTATE class 23 is "integrity constraint violation". */
const INTEGRITY_VIOLATION = /^23/;

export function constraintViolation(error: unknown): ConstraintViolation | null {
	let current: unknown = error;

	// Bounded, because `cause` can in principle be cyclic and a hang here would
	// surface as a test timeout with no explanation.
	for (let depth = 0; current !== null && current !== undefined && depth < 8; depth += 1) {
		const candidate = current as { code?: unknown; constraint_name?: unknown; cause?: unknown };

		if (typeof candidate.code === 'string' && INTEGRITY_VIOLATION.test(candidate.code)) {
			return {
				code: candidate.code,
				constraint: typeof candidate.constraint_name === 'string' ? candidate.constraint_name : ''
			};
		}

		current = candidate.cause;
	}

	return null;
}

/** True when the failure was a unique index or unique constraint refusing a row. */
export function isUniqueViolation(error: unknown): boolean {
	return constraintViolation(error)?.code === '23505';
}
