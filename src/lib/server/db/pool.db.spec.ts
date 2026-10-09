import { sql } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { closeDb, getDb } from '.';

/**
 * The half of `closeDb` that only rows can show: that the pool is really gone.
 *
 * The assertion is made against the client itself rather than by counting
 * backends in `pg_stat_activity`. Postgres does not always reap a backend the
 * instant its client disconnects, so a count would need polling and a deadline,
 * and a test that sometimes needs a second attempt teaches nobody anything.
 * Querying an ended client rejects immediately, with a code.
 */
describe('closeDb', () => {
	it('ends the pool it opened, and lets the next caller open a fresh one', async () => {
		// The harness truncates through `getDb()` before every test, so a pool
		// already exists; this takes the same handle it would have taken.
		const client = getDb().$client;
		await expect(client`select 1`).resolves.toBeDefined();

		await expect(closeDb()).resolves.toBe(true);

		await expect(client`select 1`).rejects.toMatchObject({ code: 'CONNECTION_ENDED' });
	});

	it('is a no-op the second time, rather than a double close', async () => {
		getDb();

		await expect(closeDb()).resolves.toBe(true);
		await expect(closeDb()).resolves.toBe(false);
	});

	it('leaves getDb able to serve again', async () => {
		await closeDb();

		await expect(getDb().execute(sql`select 1`)).resolves.toBeDefined();
	});
});
