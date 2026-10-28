import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { createOrganisation, createPerson, createViewer } from '../assets/testing/fixtures';
import { getDb } from '../db';
import { users } from '../auth/schema';
import {
	dismissProvisioningWarning,
	listOpenProvisioningWarnings,
	resolveSsoIdentity,
	updatePerson,
	type SsoClaims
} from '.';
import { people, personIdentities } from './schema';

const claims = (overrides: Partial<SsoClaims> = {}): SsoClaims => ({
	provider: 'oidc:https://idp.test/',
	externalId: 'sub-1',
	email: 'ada.lovelace@acme.test',
	emailVerified: true,
	fullName: 'Ada Lovelace',
	...overrides
});

const resolve = (organisationId: string, value: SsoClaims, jit = false) =>
	getDb().transaction((tx) =>
		resolveSsoIdentity(tx, organisationId, value, { jitProvisioning: jit })
	);

describe('the name and email of a person an identity provider manages', () => {
	async function linkedPerson(active = true) {
		const organisation = await createOrganisation();
		const actor = await createViewer(organisation.id, 'admin', 'Grace Hopper');
		const person = await createPerson(organisation.id, 'Ada Lovelace');
		await resolve(organisation.id, claims());
		const userId = crypto.randomUUID();
		await getDb()
			.insert(users)
			.values({ id: userId, name: 'Ada Lovelace', email: person.email, role: 'employee' });
		await getDb().update(people).set({ userId, active }).where(eq(people.id, person.id));
		return { organisation, actor, person, userId };
	}

	it('refuses a name change while the identity is linked', async () => {
		const { actor, person } = await linkedPerson();

		const outcome = await updatePerson(actor, person.id, { fullName: 'Ada King' });

		expect(outcome).toEqual({ ok: false, error: 'identity_managed' });
	});

	it('still refuses the email of an active person with a user', async () => {
		const { actor, person } = await linkedPerson();

		const outcome = await updatePerson(actor, person.id, { email: 'new@acme.test' });

		expect(outcome).toEqual({ ok: false, error: 'email_locked' });
	});

	it('lets an admin change the email of an inactive person with a user, on both records', async () => {
		const { actor, person, userId } = await linkedPerson(false);

		const outcome = await updatePerson(actor, person.id, { email: 'freed@acme.test' });

		expect(outcome.ok).toBe(true);
		const [row] = await getDb().select().from(people).where(eq(people.id, person.id));
		const [user] = await getDb().select().from(users).where(eq(users.id, userId));
		expect(row.email).toBe('freed@acme.test');
		expect(user.email).toBe('freed@acme.test');
	});

	it('is editable again once unlinked', async () => {
		const { actor, person } = await linkedPerson();
		await getDb().delete(personIdentities).where(eq(personIdentities.personId, person.id));

		const outcome = await updatePerson(actor, person.id, { fullName: 'Ada King' });

		expect(outcome.ok).toBe(true);
	});
});

describe('provisioning warnings', () => {
	it('opens one per identity, and a dismissed one lets a repeat open a new one', async () => {
		const organisation = await createOrganisation();
		const holder = await createPerson(organisation.id, 'Ada Lovelace');
		await resolve(organisation.id, claims({ externalId: 'first' }));

		await resolve(organisation.id, claims({ externalId: 'second' }));
		await resolve(organisation.id, claims({ externalId: 'second' }));
		const open = await listOpenProvisioningWarnings(organisation.id);
		expect(open).toHaveLength(1);
		expect(open[0]).toMatchObject({
			kind: 'email_taken',
			email: 'ada.lovelace@acme.test',
			holder: { id: holder.id, fullName: 'Ada Lovelace' }
		});

		expect((await dismissProvisioningWarning(organisation.id, open[0].id)).ok).toBe(true);
		expect(await listOpenProvisioningWarnings(organisation.id)).toHaveLength(0);

		await resolve(organisation.id, claims({ externalId: 'second' }));
		expect(await listOpenProvisioningWarnings(organisation.id)).toHaveLength(1);
	});

	it("does not dismiss another organisation's warning", async () => {
		const mine = await createOrganisation('Mine', 'mine');
		const theirs = await createOrganisation('Theirs', 'theirs');
		await createPerson(theirs.id, 'Ada Lovelace');
		await resolve(theirs.id, claims({ externalId: 'a' }));
		await resolve(theirs.id, claims({ externalId: 'b' }));
		const [warning] = await listOpenProvisioningWarnings(theirs.id);

		const outcome = await dismissProvisioningWarning(mine.id, warning.id);

		expect(outcome).toEqual({ ok: false, error: 'not_found' });
	});
});
