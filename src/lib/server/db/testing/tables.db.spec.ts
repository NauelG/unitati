import { sql } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { getDb } from '..';
import { managedTableNames } from './tables';

/**
 * The harness testing its own coverage. `managedTableNames` reads the Drizzle
 * schema; this asserts that reading it yields exactly the tables the migrations
 * created. Add a table to any domain and the next migration makes it appear on
 * both sides at once, so the test keeps passing without anyone editing a list —
 * and a hand-kept list would fail here the moment it fell behind.
 */
describe('managedTableNames', () => {
	it('covers every table the migrations create', async () => {
		const rows = await getDb().execute<{ table_name: string }>(sql`
			select table_name
			from information_schema.tables
			where table_schema = 'public' and table_type = 'BASE TABLE'
			order by table_name
		`);

		const inDatabase = rows.map((row) => row.table_name);

		expect(managedTableNames()).toEqual(inDatabase);
	});
});
