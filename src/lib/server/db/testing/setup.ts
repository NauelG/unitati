import { sql } from 'drizzle-orm';
import { beforeEach } from 'vitest';
import { DATABASE_URL } from '$app/env/private';
import { getDb } from '..';
import { assertTestDatabase } from './database-url';
import { truncateAllTablesStatement } from './tables';

/**
 * Empties the database before every test in every `*.db.spec.ts` file, so a
 * spec starts from nothing it did not insert itself.
 *
 * Truncation, not a rolled-back transaction: rollback is faster and it never
 * commits, so it exercises neither deferred constraints nor the `CHECK` that
 * ADR 0009 puts at the centre of the activity table. A harness that hides the
 * behaviour these tests exist to prove is a harness that lies.
 *
 * `beforeEach` rather than `afterEach` so a run that crashed halfway, or a
 * database left dirty by hand, cannot colour the next one.
 */

// Before the first truncation, not after it: the guard is only useful early.
assertTestDatabase(DATABASE_URL);

const statement = truncateAllTablesStatement();

beforeEach(async () => {
	await getDb().execute(sql.raw(statement));
});
