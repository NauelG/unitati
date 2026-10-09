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

/**
 * How long `closeDb` lets in-flight queries finish before the sockets are
 * destroyed. By the time anything calls it the HTTP server has already stopped
 * accepting and drained, so there should be nothing in flight; the window
 * exists so that one stuck query cannot reinstate the hang this function was
 * written to remove.
 */
const CLOSE_TIMEOUT_SECONDS = 5;

/**
 * Closes the pool if one was ever opened, and reports whether it did.
 *
 * Nothing used to close it, and that was enough to make the server ignore
 * `SIGTERM` completely. `adapter-node` stops accepting, drains, and emits
 * `sveltekit:shutdown` — but Node exits only once no handles remain, and the
 * pool's sockets are handles. systemd killed the process after its 90s stop
 * timeout; `docker stop` allows ten, which is a quarter of what the process
 * needed to notice the signal at all.
 *
 * It must not call `getDb()`. That getter is deliberately lazy, and opening a
 * connection in order to close it is precisely the connection nobody asked for
 * that the laziness exists to avoid.
 *
 * The binding is cleared before the await, so a second call is a no-op rather
 * than a double close. A `getDb()` after this point would therefore open a
 * fresh pool — acceptable, because the only caller runs after the server has
 * stopped accepting, so nothing is left to ask.
 */
export async function closeDb(): Promise<boolean> {
	if (!instance) return false;

	const client = instance.$client;
	instance = undefined;
	await client.end({ timeout: CLOSE_TIMEOUT_SECONDS });

	return true;
}
