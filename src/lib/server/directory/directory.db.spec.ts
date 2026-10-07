import { describe, expect, it } from 'vitest';
import { getDb } from '../db';
import { listPeople } from '.';
import { departments, organisations, people } from './schema';

/**
 * The worked example for the database harness, and the first test in the repo
 * that proves a tenancy claim instead of asserting it: `listPeople` scopes to
 * one organisation (ADR 0004). Pure logic cannot show that — only rows can.
 */

async function createOrganisation(name: string, slug: string) {
	const [organisation] = await getDb().insert(organisations).values({ name, slug }).returning();

	return organisation;
}

describe('listPeople', () => {
	it('returns only the requested organisation’s people', async () => {
		const acme = await createOrganisation('Acme', 'acme');
		const globex = await createOrganisation('Globex', 'globex');

		await getDb()
			.insert(people)
			.values([
				{ organisationId: acme.id, fullName: 'Ada Lovelace', email: 'ada@acme.test' },
				{ organisationId: acme.id, fullName: 'Alan Turing', email: 'alan@acme.test' },
				{ organisationId: globex.id, fullName: 'Grace Hopper', email: 'grace@globex.test' }
			]);

		const found = await listPeople(acme.id);

		expect(found.map((person) => person.email)).toEqual(['ada@acme.test', 'alan@acme.test']);
	});

	it('orders by full name and resolves the department', async () => {
		const acme = await createOrganisation('Acme', 'acme');
		const [support] = await getDb()
			.insert(departments)
			.values({ organisationId: acme.id, name: 'Support' })
			.returning();

		await getDb()
			.insert(people)
			.values([
				{ organisationId: acme.id, fullName: 'Zoe Vane', email: 'zoe@acme.test' },
				{
					organisationId: acme.id,
					fullName: 'Ada Lovelace',
					email: 'ada@acme.test',
					departmentId: support.id
				}
			]);

		const found = await listPeople(acme.id);

		expect(found).toEqual([
			expect.objectContaining({ fullName: 'Ada Lovelace', departmentName: 'Support' }),
			expect.objectContaining({ fullName: 'Zoe Vane', departmentName: null })
		]);
	});

	it('returns nothing for an organisation with no people', async () => {
		const empty = await createOrganisation('Empty', 'empty');

		await expect(listPeople(empty.id)).resolves.toEqual([]);
	});
});

/**
 * Both tests insert the same globally unique `organisations.slug` and the same
 * person. Without truncation between them the second would fail on the unique
 * constraint, whichever order they run in — which is the point: this is the
 * harness testing itself, not the directory.
 */
describe('isolation between tests', () => {
	const insertAcmeWithOnePerson = async () => {
		const acme = await createOrganisation('Acme', 'acme');
		await getDb()
			.insert(people)
			.values({ organisationId: acme.id, fullName: 'Ada Lovelace', email: 'ada@acme.test' });

		return listPeople(acme.id);
	};

	it('lets one test insert the unique slug', async () => {
		await expect(insertAcmeWithOnePerson()).resolves.toHaveLength(1);
	});

	it('lets another test insert it again', async () => {
		await expect(insertAcmeWithOnePerson()).resolves.toHaveLength(1);
	});
});
