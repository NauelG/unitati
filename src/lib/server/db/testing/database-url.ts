/**
 * The guard that makes a test harness that empties every table safe to run.
 *
 * Vite's `loadEnv` lets a `DATABASE_URL` exported in the shell override the one
 * in `.env.test`, so the harness cannot assume the file it ships is the file it
 * gets. A developer with the development connection string in their shell would
 * otherwise watch the harness empty their own database. Refusing every database
 * whose name does not end in `_test` turns that into an error message.
 */

const TEST_SUFFIX = '_test';

/** The maintenance database every PostgreSQL server has, used to create the others. */
const MAINTENANCE_DATABASE = 'postgres';

function parse(url: string): URL {
	try {
		return new URL(url);
	} catch {
		throw new Error(`DATABASE_URL is not a URL: ${JSON.stringify(url)}`);
	}
}

/** The database a connection string points at, or `''` when it names none. */
export function databaseName(url: string): string {
	return decodeURIComponent(parse(url).pathname.replace(/^\//, ''));
}

/**
 * Returns the URL unchanged when it points at a test database, and throws
 * otherwise. Call this before anything destructive.
 */
export function assertTestDatabase(url: string): string {
	if (!url) {
		throw new Error(
			'DATABASE_URL is not set. The database tests read it from .env.test; ' +
				'a value exported in your shell overrides that file.'
		);
	}

	const name = databaseName(url);
	if (!name.endsWith(TEST_SUFFIX)) {
		throw new Error(
			`Refusing to run the database tests against "${name}": they empty every ` +
				`table, so the database name must end in "${TEST_SUFFIX}". Unset DATABASE_URL ` +
				'in your shell to fall back to .env.test.'
		);
	}

	return url;
}

/**
 * The same connection, pointed at the maintenance database, so the harness can
 * create the test database before connecting to it.
 */
export function maintenanceDatabaseUrl(url: string): string {
	const parsed = parse(url);
	parsed.pathname = `/${MAINTENANCE_DATABASE}`;
	return parsed.toString();
}
