import { sql } from 'drizzle-orm';
import { beforeEach } from 'vitest';
import { DATABASE_URL } from '$app/env/private';
import { resetBrandCache } from '../../directory';
import { resetSubscriptions, setDispatchMode } from '../../shared/events';
import { resetRuntime } from '../../shared/runtime';
import { registerPorts } from '../../ports';
import { getDb } from '..';
import { assertTestDatabase } from './database-url';
import { emptyAllTablesStatement } from './tables';

/**
 * Before every test in every `*.db.spec.ts` file, puts the database and the
 * process back where a fresh server would find them, so a spec starts from
 * nothing it did not create itself (ADR 0032).
 *
 * Committed deletes, not a rolled-back transaction: rollback is faster and it
 * never commits, so it exercises neither deferred constraints nor the `CHECK`
 * that ADR 0009 puts at the centre of the activity table. A harness that hides
 * the behaviour these tests exist to prove is a harness that lies.
 *
 * `beforeEach` rather than `afterEach` so a run that crashed halfway, or a
 * database left dirty by hand, cannot colour the next one.
 */

// Before the first delete, not after it: the guard is only useful early.
assertTestDatabase(DATABASE_URL);

const statement = emptyAllTablesStatement();

// Once per process and deliberately not reset below: the ports are wiring, not
// state a test builds, and a spec that needs them absent clears them itself.
registerPorts();

beforeEach(async () => {
	await getDb().transaction(async (tx) => {
		await tx.execute(sql.raw(statement));
	});

	// The db project shares one module graph across files (`isolate: false`), so
	// state a module keeps for the life of the process outlives the file that
	// set it. Every such piece of state is reset here; a new one belongs here too.
	resetBrandCache();
	resetSubscriptions();
	setDispatchMode('async');
	resetRuntime();
});
