// Applies the Drizzle migrations in ./drizzle to DATABASE_URL.
//
// The container image ships production dependencies only, so `drizzle-kit`
// (a devDependency) is not there. The runtime migrator in drizzle-orm applies
// the same SQL files and the same journal, which is all `drizzle-kit migrate`
// does too.
//
// The image runs it before the server on every start (see the Dockerfile CMD);
// it can also be run alone: docker run --rm --env-file unitati.env IMAGE node scripts/migrate.mjs
//
// Migrations are forward-only: see the note in scripts/staging-deploy.sh.
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';

const url = process.env.DATABASE_URL;
if (!url) {
	console.error('DATABASE_URL is not set');
	process.exit(1);
}

// One connection: migrations run sequentially and must not interleave.
const client = postgres(url, { max: 1 });
let exitCode = 0;

try {
	await migrate(drizzle(client), { migrationsFolder: 'drizzle' });
	console.log('Migrations applied.');
} catch (error) {
	console.error(error instanceof Error ? error.message : error);
	exitCode = 1;
} finally {
	await client.end();
}

process.exit(exitCode);
