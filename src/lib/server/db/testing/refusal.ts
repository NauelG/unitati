/**
 * What the database said when it refused a write, for specs that assert a
 * constraint rather than merely an error.
 *
 * `await expect(...).rejects.toThrow()` is satisfied by a typo in the test;
 * `{ code: '23505', constraint: 'assets_org_serial' }` is satisfied only by the
 * partial unique index the acceptance criterion is about. Naming the constraint
 * is what makes the assertion mean the thing it claims.
 *
 * **Deliberately not built on `db/errors.ts`.** The production unwrapper is
 * itself under test here: a spec that used it to check it would agree with
 * itself whatever either of them did, and the bug it exists to prevent — the
 * `PostgresError` hiding under Drizzle's `cause`, so `error.code` reads
 * `undefined` — is exactly the bug that shared helper would have hidden. This
 * walks the chain independently, so these assertions pin the shape the driver
 * really produces.
 */

export interface DatabaseRefusal {
	/** SQLSTATE: `23505` unique, `23502` not-null, `23503` foreign key, `23514` check. */
	code: string | undefined;
	constraint: string | undefined;
}

/**
 * Runs the query and reports how it was refused, or `null` if it succeeded.
 * `null` rather than a throw, so a spec asserting that something is *allowed*
 * reads the same way as one asserting it is refused.
 */
export async function refusalFrom(action: Promise<unknown>): Promise<DatabaseRefusal | null> {
	try {
		await action;
		return null;
	} catch (error) {
		let current: unknown = error;

		while (current) {
			const reported = current as { code?: string; constraint_name?: string; cause?: unknown };
			if (typeof reported.code === 'string') {
				return { code: reported.code, constraint: reported.constraint_name };
			}
			current = reported.cause;
		}

		return { code: undefined, constraint: undefined };
	}
}
