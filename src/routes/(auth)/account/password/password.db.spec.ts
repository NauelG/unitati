import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { grantAccess } from '#lib/server/auth/access.js';
import { getAuth } from '#lib/server/auth/index.js';
import { sessions, users } from '#lib/server/auth/schema.js';
import {
	createOrganisation,
	createPerson,
	createViewer
} from '#lib/server/assets/testing/fixtures.js';
import { getDb } from '#lib/server/db/index.js';
import { deactivatePerson, resolveSessionUser } from '#lib/server/directory/index.js';
import { outcomeOf } from '#lib/server/projects/testing/action-event.js';
import { actions as loginActions } from '../../login/+page.server';
import { actions } from './+page.server';

const EMAIL = 'grace.hopper@acme.test';

async function grantedUser() {
	const organisation = await createOrganisation();
	const admin = await createViewer(organisation.id, 'admin');
	const person = await createPerson(organisation.id, 'Grace Hopper');
	const outcome = await grantAccess(admin, person.id, 'technician');
	if (!outcome.ok) throw new Error('fixture failed');
	return { admin, person, password: outcome.value.temporaryPassword };
}

function formEvent(fields: Record<string, string>, headers: Headers = new Headers(), user = null) {
	const data = new FormData();
	for (const [key, value] of Object.entries(fields)) data.append(key, value);
	const cookies = { set: () => undefined, get: () => undefined };
	return {
		request: new Request('http://localhost/action', { method: 'POST', body: data, headers }),
		locals: { user },
		cookies
	} as never;
}

async function signIn(password: string) {
	const { headers } = await getAuth().api.signInEmail({
		body: { email: EMAIL, password },
		returnHeaders: true
	});
	const cookie = headers
		.getSetCookie()
		.map((raw) => raw.split(';')[0])
		.join('; ');
	const [row] = await getDb().select().from(users).where(eq(users.email, EMAIL));
	return { cookie, user: (await resolveSessionUser(row.id))! };
}

describe('changing the temporary password', () => {
	it('refuses a wrong current password and keeps the flag', async () => {
		const { password } = await grantedUser();
		const { cookie, user } = await signIn(password);

		const { returned } = await outcomeOf(() =>
			actions.default(
				formEvent(
					{
						currentPassword: 'not-the-password',
						newPassword: 'a-brand-new-password',
						confirmPassword: 'a-brand-new-password'
					},
					new Headers({ cookie }),
					user as never
				)
			)
		);

		expect(returned?.status).toBe(400);
		expect(JSON.stringify(returned?.data)).toContain('La contraseña actual no es correcta.');
		expect((await resolveSessionUser(user.id))?.mustChangePassword).toBe(true);
	});

	it('refuses a confirmation that does not match', async () => {
		const { password } = await grantedUser();
		const { cookie, user } = await signIn(password);

		const { returned } = await outcomeOf(() =>
			actions.default(
				formEvent(
					{
						currentPassword: password,
						newPassword: 'a-brand-new-password',
						confirmPassword: 'something-else-entirely'
					},
					new Headers({ cookie }),
					user as never
				)
			)
		);

		expect(returned?.status).toBe(400);
		expect(JSON.stringify(returned?.data)).toContain('Las contraseñas no coinciden.');
	});

	it('changes it, lifts the flag and lands on the root', async () => {
		const { password } = await grantedUser();
		const { cookie, user } = await signIn(password);

		const { thrown } = await outcomeOf(() =>
			actions.default(
				formEvent(
					{
						currentPassword: password,
						newPassword: 'a-brand-new-password',
						confirmPassword: 'a-brand-new-password'
					},
					new Headers({ cookie }),
					user as never
				)
			)
		);

		expect(thrown).toMatchObject({ status: 303, location: '/' });
		expect((await resolveSessionUser(user.id))?.mustChangePassword).toBe(false);
		await expect(
			getAuth().api.signInEmail({ body: { email: EMAIL, password: 'a-brand-new-password' } })
		).resolves.toBeTruthy();
	});
});

describe('signing in as a deactivated person', () => {
	it('is refused with the deactivated message and leaves no session', async () => {
		const { admin, person, password } = await grantedUser();
		await deactivatePerson(admin, person.id);

		const { returned } = await outcomeOf(() =>
			loginActions.default(formEvent({ email: EMAIL, password }))
		);

		expect(returned?.status).toBe(400);
		expect(returned?.data).toMatchObject({ message: 'Tu cuenta está desactivada.' });
		expect(await getDb().select().from(sessions)).toHaveLength(0);
	});
});
