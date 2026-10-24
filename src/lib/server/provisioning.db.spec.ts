import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { createOrganisation } from './assets/testing/fixtures';
import { handoverTemplates } from './assets/schema';
import { users } from './auth/schema';
import { getDb } from './db';
import { organisations, people } from './directory/schema';
import { states } from './projects/schema';
import { provisionFirstAdmin } from './provisioning';

async function createAccount() {
	const id = crypto.randomUUID();
	await getDb().insert(users).values({ id, name: 'Ada Lovelace', email: 'ada@acme.test' });
	return id;
}

describe('provisionFirstAdmin', () => {
	it('creates the organisation, promotes the user and seeds the defaults', async () => {
		const userId = await createAccount();

		const outcome = await provisionFirstAdmin(userId, 'Acme Corp');
		if (!outcome.ok) throw new Error(`unexpected refusal: ${outcome.error}`);
		const { organisationId, personId } = outcome.value;

		const [organisation] = await getDb().select().from(organisations);
		expect(organisation).toMatchObject({
			id: organisationId,
			name: 'Acme Corp',
			slug: 'acme-corp'
		});

		const [user] = await getDb().select().from(users).where(eq(users.id, userId));
		expect(user.role).toBe('admin');

		const [person] = await getDb().select().from(people);
		expect(person).toMatchObject({
			id: personId,
			organisationId,
			userId,
			fullName: 'Ada Lovelace',
			email: 'ada@acme.test'
		});

		const seededStates = await getDb()
			.select()
			.from(states)
			.where(eq(states.organisationId, organisationId));
		expect(seededStates.length).toBeGreaterThan(0);

		const seededTemplates = await getDb()
			.select()
			.from(handoverTemplates)
			.where(eq(handoverTemplates.organisationId, organisationId));
		expect(seededTemplates.length).toBeGreaterThan(0);
	});

	it('refuses with already-set-up when an organisation exists, and writes nothing', async () => {
		await createOrganisation();
		const userId = await createAccount();

		const outcome = await provisionFirstAdmin(userId, 'Second');

		expect(outcome).toEqual({ ok: false, error: 'already-set-up' });
		expect(await getDb().select().from(organisations)).toHaveLength(1);
		expect(await getDb().select().from(people)).toHaveLength(0);
		const [user] = await getDb().select().from(users).where(eq(users.id, userId));
		expect(user.role).not.toBe('admin');
	});

	it('refuses with account-not-created for an unknown user id, and creates no organisation', async () => {
		const outcome = await provisionFirstAdmin(crypto.randomUUID(), 'Acme');

		expect(outcome).toEqual({ ok: false, error: 'account-not-created' });
		expect(await getDb().select().from(organisations)).toHaveLength(0);
	});
});
