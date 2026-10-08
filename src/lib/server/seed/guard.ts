/**
 * The seed creates accounts with a password printed in its own output. That is
 * a fine thing to do on a laptop and a security hole anywhere else, so it
 * refuses to run against a database it cannot tell is local — the same posture
 * as the test harness's `_test` suffix, for the same reason: a guard that
 * depends on remembering to be careful is not one.
 *
 * Hostnames, not database names: staging is `unitati_staging` on a real host,
 * and the check that matters is "is this machine mine", not "is it called dev".
 */
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

export class RefusedSeedError extends Error {}

export function assertLocalDatabase(databaseUrl: string): void {
	let host: string;
	try {
		host = new URL(databaseUrl).hostname;
	} catch {
		throw new RefusedSeedError(
			'DATABASE_URL is not a URL, so the seed cannot tell where it points.'
		);
	}

	if (!LOCAL_HOSTS.has(host)) {
		throw new RefusedSeedError(
			`Refusing to seed ${host}: the seed creates accounts with a published password, ` +
				`so it only runs against localhost.`
		);
	}
}
