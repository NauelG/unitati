import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { DATABASE_URL } from '$app/env/private';
import * as schema from './schema';

export { schema };

export type Database = ReturnType<typeof create>;

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
