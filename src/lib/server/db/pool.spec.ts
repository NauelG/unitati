import { describe, expect, it } from 'vitest';
import { closeDb } from '.';

/**
 * This file holds exactly one test on purpose. `closeDb` must not open a
 * connection in order to close one, and the only way to observe that is from a
 * module whose pool was never created — so nothing else here may call `getDb`.
 * `sequence.shuffle` would otherwise decide whether this assertion means
 * anything, and a test whose truth depends on its running order is not a test.
 *
 * The companion assertion, that an open pool is actually closed, needs a
 * database and lives in `pool.db.spec.ts`.
 */
describe('closeDb', () => {
	it('reports nothing to close when no pool was ever opened', async () => {
		await expect(closeDb()).resolves.toBe(false);
	});
});
