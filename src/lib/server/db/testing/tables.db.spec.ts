import { sql } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { createOrganisation, createPerson } from '../../assets/testing/fixtures';
import { createQueue, createTicket } from '../../service-desk/testing/fixtures';
import { getDb } from '..';
import { emptyAllTablesStatement, managedTableNames } from './tables';

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

/**
 * The harness empties tables with `DELETE`, which, unlike `TRUNCATE ... RESTART
 * IDENTITY`, leaves a column's own sequence where it was (ADR 0032). That is
 * only harmless while no column owns one: the tag sequences are standalone and
 * no `TRUNCATE` ever reset them. A `serial` or identity column would make ids
 * drift between tests, so it has to fail here first, where the cause is named.
 */
describe('emptyAllTablesStatement', () => {
	it('loses nothing against truncation: no sequence belongs to a column', async () => {
		const rows = await getDb().execute<{ sequence: string }>(sql`
			select s.relname as sequence
			from pg_class s
			join pg_namespace n on n.oid = s.relnamespace
			join pg_depend d on d.objid = s.oid and d.deptype in ('a', 'i')
			where s.relkind = 'S' and n.nspname = 'public'
		`);

		expect(rows.map((row) => row.sequence)).toEqual([]);
	});

	it('leaves every managed table empty, whatever references whatever', async () => {
		// Rows across domains that reference one another, some through
		// `ON DELETE RESTRICT` keys (a ticket to its queue and its requester).
		const organisation = await createOrganisation();
		const requester = await createPerson(organisation.id, 'Eve Employee');
		const queue = await createQueue(organisation.id);
		await createTicket(organisation.id, queue.id, requester.id);
		expect(await nonEmptyTables()).toEqual(
			expect.arrayContaining(['organisations', 'people', 'queues', 'tickets'])
		);

		await getDb().transaction(async (tx) => {
			await tx.execute(sql.raw(emptyAllTablesStatement()));
		});

		expect(await nonEmptyTables()).toEqual([]);
	});
});

async function nonEmptyTables(): Promise<string[]> {
	const found: string[] = [];

	for (const name of managedTableNames()) {
		const rows = await getDb().execute(sql`select 1 from ${sql.identifier(name)} limit 1`);
		if (rows.length > 0) found.push(name);
	}

	return found;
}
