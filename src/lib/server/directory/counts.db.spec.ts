import { getDb } from '../db';
import { describe, expect, it } from 'vitest';
import { organisations, people, teams } from './schema';
import { countPeople, countTeams } from '.';

async function createOrganisation(name: string, slug: string) {
	const [organisation] = await getDb().insert(organisations).values({ name, slug }).returning();
	return organisation;
}

describe('countPeople', () => {
	it('counts only the requested organisation’s people', async () => {
		const acme = await createOrganisation('Acme', 'acme-people-counts');
		const globex = await createOrganisation('Globex', 'globex-people-counts');
		await getDb()
			.insert(people)
			.values([
				{ organisationId: acme.id, fullName: 'Ada Lovelace', email: 'ada@acme.test' },
				{ organisationId: acme.id, fullName: 'Alan Turing', email: 'alan@acme.test' },
				{ organisationId: globex.id, fullName: 'Grace Hopper', email: 'grace@globex.test' }
			]);

		expect(await countPeople(acme.id)).toBe(2);
		expect(await countPeople(globex.id)).toBe(1);
	});

	it('returns zero for an organisation with no people', async () => {
		const acme = await createOrganisation('Acme', 'acme-people-counts-empty');
		expect(await countPeople(acme.id)).toBe(0);
	});
});

describe('countTeams', () => {
	it('counts only the requested organisation’s teams', async () => {
		const acme = await createOrganisation('Acme', 'acme-teams-counts');
		const globex = await createOrganisation('Globex', 'globex-teams-counts');
		await getDb()
			.insert(teams)
			.values([
				{ organisationId: acme.id, name: 'Soporte' },
				{ organisationId: acme.id, name: 'Infraestructura' },
				{ organisationId: globex.id, name: 'Soporte' }
			]);

		expect(await countTeams(acme.id)).toBe(2);
		expect(await countTeams(globex.id)).toBe(1);
	});

	it('returns zero for an organisation with no teams', async () => {
		const acme = await createOrganisation('Acme', 'acme-teams-counts-empty');
		expect(await countTeams(acme.id)).toBe(0);
	});
});
