import { and, eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { getDb } from '../db';
import { createOrganisation, createPerson, createViewer } from '../assets/testing/fixtures';
import { deactivatePerson, reactivatePerson, resolveSessionUser } from '../directory';
import { people } from '../directory/schema';
import { getAuth } from '.';
import {
	changeAccessEmail,
	changeRole,
	deactivatePersonAndEndSessions,
	grantAccess,
	resetPassword,
	revokeAccess
} from './access';
import { authAccounts, sessions, users } from './schema';

async function setup() {
	const organisation = await createOrganisation();
	const admin = await createViewer(organisation.id, 'admin');
	return { organisation, admin };
}

async function grant(
	admin: Parameters<typeof grantAccess>[0],
	personId: string,
	role: 'technician' | 'employee' | 'admin' = 'technician'
) {
	const outcome = await grantAccess(admin, personId, role);
	if (!outcome.ok) throw new Error(`fixture failed: ${outcome.error}`);
	return outcome.value.temporaryPassword;
}

const userOf = async (personId: string) => {
	const [row] = await getDb()
		.select({ user: users })
		.from(people)
		.innerJoin(users, eq(users.id, people.userId))
		.where(eq(people.id, personId));
	return row?.user;
};

const sessionCount = async (userId: string) =>
	(await getDb().select().from(sessions).where(eq(sessions.userId, userId))).length;

async function signedIn(userId: string) {
	await getDb()
		.insert(sessions)
		.values({
			id: crypto.randomUUID(),
			userId,
			token: crypto.randomUUID(),
			expiresAt: new Date(Date.now() + 60_000)
		});
}

describe('grantAccess', () => {
	it('creates the user, credential, role, flag and link, and leaves no session', async () => {
		const { organisation, admin } = await setup();
		const person = await createPerson(organisation.id, 'Grace Hopper');
		await signedIn(admin.id);

		const password = await grant(admin, person.id);

		expect(password).toHaveLength(16);
		const user = await userOf(person.id);
		expect(user).toMatchObject({
			email: 'grace.hopper@acme.test',
			name: 'Grace Hopper',
			role: 'technician',
			mustChangePassword: true
		});
		expect(await sessionCount(user!.id)).toBe(0);
		expect(await sessionCount(admin.id)).toBe(1);

		const [account] = await getDb()
			.select()
			.from(authAccounts)
			.where(and(eq(authAccounts.userId, user!.id), eq(authAccounts.providerId, 'credential')));
		expect(account.password).toBeTruthy();
		expect(account.password).not.toContain(password);
	});

	it('produces a credential Better Auth accepts', async () => {
		const { organisation, admin } = await setup();
		const person = await createPerson(organisation.id, 'Grace Hopper');
		const password = await grant(admin, person.id);

		const response = await getAuth().api.signInEmail({
			body: { email: 'grace.hopper@acme.test', password }
		});
		expect(response.user.email).toBe('grace.hopper@acme.test');
	});

	it('refuses an inactive person', async () => {
		const { organisation, admin } = await setup();
		const person = await createPerson(organisation.id, 'Grace Hopper');
		await deactivatePerson(admin, person.id);

		expect(await grantAccess(admin, person.id, 'employee')).toEqual({
			ok: false,
			error: 'inactive'
		});
	});

	it('refuses a person who already has access', async () => {
		const { organisation, admin } = await setup();
		const person = await createPerson(organisation.id, 'Grace Hopper');
		await grant(admin, person.id);

		expect(await grantAccess(admin, person.id, 'employee')).toEqual({
			ok: false,
			error: 'already_has_access'
		});
	});

	it('refuses an email that already signs in, and links nothing', async () => {
		const { admin } = await setup();
		// The same address in another organisation: `people` allows it, `users` does not.
		const other = await createOrganisation('Other', 'other');
		const person = await createPerson(other.id, 'Ada Lovelace', admin.email);
		const outsider = { ...admin, organisationId: other.id };

		expect(await grantAccess(outsider, person.id, 'employee')).toEqual({
			ok: false,
			error: 'email_taken'
		});
		const [row] = await getDb().select().from(people).where(eq(people.id, person.id));
		expect(row.userId).toBeNull();
	});

	it('does not find a person of another organisation', async () => {
		const { admin } = await setup();
		const other = await createOrganisation('Other', 'other');
		const person = await createPerson(other.id, 'Grace Hopper');

		expect(await grantAccess(admin, person.id, 'employee')).toEqual({
			ok: false,
			error: 'not_found'
		});
	});
});

describe('resetPassword', () => {
	it('changes the hash, sets the flag and clears sessions', async () => {
		const { organisation, admin } = await setup();
		const person = await createPerson(organisation.id, 'Grace Hopper');
		const first = await grant(admin, person.id);
		const user = (await userOf(person.id))!;
		await getDb().update(users).set({ mustChangePassword: false }).where(eq(users.id, user.id));
		await signedIn(user.id);
		const hashOf = async () =>
			(await getDb().select().from(authAccounts).where(eq(authAccounts.userId, user.id)))[0]
				.password;
		const before = await hashOf();

		const outcome = await resetPassword(admin, person.id);

		expect(outcome.ok && outcome.value.temporaryPassword).toHaveLength(16);
		expect(await hashOf()).not.toBe(before);
		expect((await userOf(person.id))!.mustChangePassword).toBe(true);
		expect(await sessionCount(user.id)).toBe(0);

		const password = outcome.ok ? outcome.value.temporaryPassword : '';
		await expect(
			getAuth().api.signInEmail({ body: { email: user.email, password: first } })
		).rejects.toThrow();
		await expect(
			getAuth().api.signInEmail({ body: { email: user.email, password } })
		).resolves.toBeTruthy();
	});

	it('refuses a person without access', async () => {
		const { organisation, admin } = await setup();
		const person = await createPerson(organisation.id, 'Grace Hopper');

		expect(await resetPassword(admin, person.id)).toEqual({ ok: false, error: 'no_access' });
	});
});

describe('changeRole', () => {
	it('changes the role', async () => {
		const { organisation, admin } = await setup();
		const person = await createPerson(organisation.id, 'Grace Hopper');
		await grant(admin, person.id, 'employee');

		expect(await changeRole(admin, person.id, 'technician')).toEqual({
			ok: true,
			value: undefined
		});
		expect((await userOf(person.id))!.role).toBe('technician');
	});

	it('refuses an admin demoting themselves', async () => {
		const { organisation, admin } = await setup();
		const person = await createPerson(organisation.id, 'Grace Hopper');
		await grant(admin, person.id, 'admin');

		expect(await changeRole(admin, admin.personId!, 'employee')).toEqual({
			ok: false,
			error: 'self'
		});
	});

	it('refuses to demote the last active admin', async () => {
		const { organisation, admin } = await setup();
		const second = await createPerson(organisation.id, 'Grace Hopper');
		await grant(admin, second.id, 'admin');
		const secondUser = (await userOf(second.id))!;
		// The first admin is deactivated, so Grace is the last one who can sign in.
		await deactivatePerson({ ...admin, personId: second.id }, admin.personId!);

		const actor = { ...admin, id: secondUser.id, personId: 'someone-else' };
		expect(await changeRole(actor, second.id, 'employee')).toEqual({
			ok: false,
			error: 'last_admin'
		});
	});

	it('refuses a person without access', async () => {
		const { organisation, admin } = await setup();
		const person = await createPerson(organisation.id, 'Grace Hopper');

		expect(await changeRole(admin, person.id, 'employee')).toEqual({
			ok: false,
			error: 'no_access'
		});
	});
});

describe('revokeAccess', () => {
	it('deletes the credential and keeps the person', async () => {
		const { organisation, admin } = await setup();
		const person = await createPerson(organisation.id, 'Grace Hopper');
		await grant(admin, person.id);
		const user = (await userOf(person.id))!;
		await signedIn(user.id);

		expect(await revokeAccess(admin, person.id)).toEqual({ ok: true, value: undefined });

		expect(await getDb().select().from(users).where(eq(users.id, user.id))).toHaveLength(0);
		expect(await getDb().select().from(sessions).where(eq(sessions.userId, user.id))).toHaveLength(
			0
		);
		expect(
			await getDb().select().from(authAccounts).where(eq(authAccounts.userId, user.id))
		).toHaveLength(0);
		const [row] = await getDb().select().from(people).where(eq(people.id, person.id));
		expect(row.userId).toBeNull();
	});

	it('refuses an admin revoking themselves', async () => {
		const { admin } = await setup();

		expect(await revokeAccess(admin, admin.personId!)).toEqual({ ok: false, error: 'self' });
	});

	it('refuses to revoke the last active admin', async () => {
		const { organisation, admin } = await setup();
		const second = await createPerson(organisation.id, 'Grace Hopper');
		await grant(admin, second.id, 'admin');
		const secondUser = (await userOf(second.id))!;
		await deactivatePerson({ ...admin, personId: second.id }, admin.personId!);

		const actor = { ...admin, id: secondUser.id, personId: 'someone-else' };
		expect(await revokeAccess(actor, second.id)).toEqual({ ok: false, error: 'last_admin' });
	});
});

describe('changeAccessEmail', () => {
	it('updates the sign-in and the directory record together', async () => {
		const { organisation, admin } = await setup();
		const person = await createPerson(organisation.id, 'Grace Hopper');
		const password = await grant(admin, person.id);

		expect(await changeAccessEmail(admin, person.id, 'grace@new.test')).toEqual({
			ok: true,
			value: undefined
		});

		expect((await userOf(person.id))!.email).toBe('grace@new.test');
		const [row] = await getDb().select().from(people).where(eq(people.id, person.id));
		expect(row.email).toBe('grace@new.test');
		await expect(
			getAuth().api.signInEmail({ body: { email: 'grace@new.test', password } })
		).resolves.toBeTruthy();
	});

	it('refuses an address taken by another person and changes neither row', async () => {
		const { organisation, admin } = await setup();
		const person = await createPerson(organisation.id, 'Grace Hopper');
		await grant(admin, person.id);
		await createPerson(organisation.id, 'Alan Turing', 'alan@acme.test');

		expect(await changeAccessEmail(admin, person.id, 'alan@acme.test')).toEqual({
			ok: false,
			error: 'email_taken'
		});
		expect((await userOf(person.id))!.email).toBe('grace.hopper@acme.test');
	});

	it('refuses an address that already signs in', async () => {
		const { organisation, admin } = await setup();
		const person = await createPerson(organisation.id, 'Grace Hopper');
		await grant(admin, person.id);

		expect(await changeAccessEmail(admin, person.id, admin.email)).toEqual({
			ok: false,
			error: 'email_taken'
		});
	});
});

describe('deactivating a person with access', () => {
	it('ends their sessions, and the session no longer resolves until reactivated', async () => {
		const { organisation, admin } = await setup();
		const person = await createPerson(organisation.id, 'Grace Hopper');
		await grant(admin, person.id);
		const user = (await userOf(person.id))!;
		await signedIn(user.id);

		expect(await deactivatePersonAndEndSessions(admin, person.id)).toEqual({
			ok: true,
			value: undefined
		});
		expect(await sessionCount(user.id)).toBe(0);
		expect(await resolveSessionUser(user.id)).toBeNull();

		await reactivatePerson(admin, person.id);
		expect(await resolveSessionUser(user.id)).toMatchObject({
			id: user.id,
			mustChangePassword: true
		});
	});
});
