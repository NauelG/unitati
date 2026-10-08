import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { DATABASE_URL } from '$app/env/private';
import * as schema from './schema';

export { schema };

export type Database = ReturnType<typeof create>;

/**
 * The handle a `db.transaction(...)` callback receives, named so a function can
 * demand one. Activity rows must be written inside the transaction of the action
 * that caused them (ADR 0009), and a parameter typed `Transaction` rather than
 * `Database` is how that is enforced at compile time instead of in a comment.
 */
export type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];

function create() {
	if (!DATABASE_URL) throw new Error('DATABASE_URL is not set');
	return drizzle(postgres(DATABASE_URL), { schema });
}

let instance: Database | undefined;

/**
 * Resolved on first use rather than at import time, so that importing a module
 * that happens to touch the database — during a build, a unit test or
 * prerendering — does not open a connection nobody asked for.
 */
export function getDb(): Database {
	return (instance ??= create());
}
