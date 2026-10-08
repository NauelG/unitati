import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres, { type Sql } from 'postgres';
import { loadEnv } from 'vite';
import { assertTestDatabase, databaseName, maintenanceDatabaseUrl } from './database-url';

/**
 * Runs once, in Vitest's own process, before any `*.db.spec.ts` file: creates
 * the test database if it is missing and brings it up to the latest migration.
 *
 * The URL is resolved with the same `loadEnv` call SvelteKit's plugin makes, so
 * this process and the test workers — which read `$app/env/private` — cannot
 * disagree about which database is under test. Were they to disagree, the specs
 * would fail on missing tables rather than pass against the wrong rows.
 */
export default async function setup(): Promise<void> {
	const env = loadEnv('test', process.cwd(), '');
	const url = assertTestDatabase(env.DATABASE_URL ?? '');

	await createDatabaseIfMissing(url);
	await applyMigrations(url);
}

/**
 * One connection, closed however the callback ends. Vitest hangs on an open
 * handle, so the `finally` is the whole point of the wrapper.
 */
async function withClient<T>(url: string, use: (client: Sql) => Promise<T>): Promise<T> {
	const client = postgres(url, { max: 1 });

	try {
		return await use(client);
	} finally {
		await client.end();
	}
}

function createDatabaseIfMissing(url: string): Promise<void> {
	const name = databaseName(url);

	// `CREATE DATABASE` cannot run from inside the database it creates, nor in a
	// transaction, so it goes through the maintenance database.
	return withClient(maintenanceDatabaseUrl(url), async (client) => {
		const existing = await client`select 1 from pg_database where datname = ${name}`;
		// Identifiers cannot be bound as parameters. The name came through
		// assertTestDatabase, which is what makes interpolating it here safe.
		if (existing.length === 0) await client.unsafe(`create database "${name}"`);
	});
}

function applyMigrations(url: string): Promise<void> {
	return withClient(url, (client) => migrate(drizzle(client), { migrationsFolder: 'drizzle' }));
}
