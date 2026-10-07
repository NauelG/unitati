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
 * schema, which is exactly right: truncating it would re-run every migration.
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
 * One statement for every table: `TRUNCATE` takes a list, and a single call is
 * both faster and order-independent, so foreign keys never dictate a sequence.
 * `CASCADE` covers tables that reference one another; `RESTART IDENTITY` resets
 * sequences so generated ids do not drift between tests.
 */
export function truncateAllTablesStatement(): string {
	const names = managedTableNames();

	// An empty schema would build `truncate table  restart identity cascade` and
	// fail as a syntax error, which says nothing about the cause.
	if (names.length === 0) {
		throw new Error('The Drizzle schema declares no tables, so there is nothing to truncate.');
	}

	const tables = names.map((name) => `"${name}"`).join(', ');

	return `truncate table ${tables} restart identity cascade`;
}
