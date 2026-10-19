import { getTableName, is } from 'drizzle-orm';
import { PgTable } from 'drizzle-orm/pg-core';
import * as schema from '../schema';

/**
 * Every table the application owns, read off the Drizzle schema.
 *
 * Derived rather than hand-kept on purpose: a list in a file is a list that
 * goes stale, and a table missing from it leaks rows into the next test — the
 * one failure mode a test harness must not have. Adding a table to a domain's
 * `schema.ts` is enough; nothing here changes.
 *
 * Drizzle's own `__drizzle_migrations` is absent because it is not in the
 * schema, which is exactly right: emptying it would re-run every migration.
 */
export function managedTableNames(): string[] {
	const names: string[] = [];

	// Widened to `unknown` so `is` narrows cleanly: the schema barrel also exports
	// enums and relations, and a predicate cannot narrow that union to PgTable.
	for (const value of Object.values<unknown>(schema)) {
		if (is(value, PgTable)) names.push(getTableName(value));
	}

	return names.sort();
}

/**
 * The SQL that empties every managed table, run before every database test
 * (ADR 0032). `DELETE`, not `TRUNCATE`: on tables holding a handful of rows,
 * `TRUNCATE` costs ~80 ms because it swaps the files of every table and index,
 * while `DELETE` costs ~3 ms. Across 750+ tests that was half the suite.
 *
 * `session_replication_role = replica` switches off the foreign-key triggers for
 * this one transaction, so the order of the deletes does not matter and no
 * `ON DELETE` action fires; every table ends empty, so nothing is left dangling.
 * It needs a superuser, which the compose and CI databases are.
 *
 * Nothing is lost against `TRUNCATE ... RESTART IDENTITY`: no sequence belongs
 * to a column (the tag sequences are standalone, which `RESTART IDENTITY` never
 * touched), and `tables.db.spec.ts` fails the day one does.
 *
 * One string, so the whole cleanup is a single round trip. It must run inside a
 * transaction: `set local` outside one is a no-op with a warning.
 */
export function emptyAllTablesStatement(): string {
	const names = managedTableNames();

	// Nothing to empty is a broken schema import, not a clean database.
	if (names.length === 0) {
		throw new Error('The Drizzle schema declares no tables, so there is nothing to empty.');
	}

	return [
		'set local session_replication_role = replica',
		...names.map((name) => `delete from "${name}"`)
	].join(';\n');
}
