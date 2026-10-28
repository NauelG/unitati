import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { BETTER_AUTH_URL } from '$app/env/private';
import { oidcProviderKey } from '../../oidc';
import { listActivity } from '../activity';
import { createOrganisation, createPerson, createViewer } from '../assets/testing/fixtures';
import { getDb } from '../db';
import { people, personIdentities, provisioningWarnings } from '../directory/schema';
import { getAuth } from '.';
import { unlinkIdentity } from './access';
import { authenticationSettings } from './authentication-settings-schema';
import { authAccounts, sessions, users } from './schema';
import { updateAuthenticationSettings } from './settings';
import { startSsoSignIn } from './sso-login';
import {
	MOCK_IDP_ISSUER,
	startMockIdp,
	type IdTokenClaims,
	type MockIdp
} from './testing/mock-idp';

const PROVIDER = oidcProviderKey(MOCK_IDP_ISSUER);

let idp: MockIdp;
beforeAll(async () => {
	idp = await startMockIdp();
});
afterAll(async () => {
	await idp.close();
});

interface Landing {
	location: string;
	cookie: string;
}

/**
 * The whole OIDC round trip without a browser: Unitati starts the flow, the mock
 * provider answers the token request with `claims`, and the callback is called
 * with the state it handed out.
 */
async function signInThroughIdp(claims: IdTokenClaims, redirectTo: string | null = null) {
	const { url, headers } = await startSsoSignIn(new Headers(), redirectTo);
	const state = new URL(url).searchParams.get('state');
	const cookie = headers
		.getSetCookie()
		.map((raw) => raw.split(';')[0])
		.join('; ');

	idp.issue(claims);
	const response = await getAuth().handler(
		new Request(`${BETTER_AUTH_URL}/api/auth/sso/callback/oidc?code=mock-code&state=${state}`, {
			headers: { cookie }
		})
	);
	const location = response.headers.get('location') ?? '';
	const session = response.headers
		.getSetCookie()
		.map((raw) => raw.split(';')[0])
		.join('; ');
	return { status: response.status, location, cookie: session } satisfies Landing & {
		status: number;
	};
}

const claimsFor = (overrides: Partial<IdTokenClaims> = {}): IdTokenClaims => ({
	sub: 'sub-ada',
	email: 'ada.lovelace@acme.test',
	email_verified: true,
	name: 'Ada Lovelace',
	...overrides
});

const errorOf = (location: string) => new URL(location, BETTER_AUTH_URL).searchParams.get('error');

async function identitiesOf(personId: string) {
	return getDb().select().from(personIdentities).where(eq(personIdentities.personId, personId));
}

describe('signing in through the identity provider', () => {
	it('links an existing active person by verified email, creating their user as an employee', async () => {
		const organisation = await createOrganisation();
		const person = await createPerson(organisation.id, 'Ada Lovelace');

		const landing = await signInThroughIdp(claimsFor());

		expect(errorOf(landing.location)).toBeNull();
		const [linked] = await identitiesOf(person.id);
		expect(linked).toMatchObject({ provider: PROVIDER, externalId: 'sub-ada' });
		const [row] = await getDb().select().from(people).where(eq(people.id, person.id));
		const [user] = await getDb().select().from(users).where(eq(users.id, row.userId!));
		expect(user.role).toBe('employee');

		const activity = await listActivity({
			organisationId: organisation.id,
			target: { personId: person.id }
		});
		expect(activity.map((entry) => entry.verb)).toContain('person.identity.linked');

		const [session] = await getDb().select().from(sessions).where(eq(sessions.userId, user.id));
		expect(session.authMethod).toBe('sso');
	});

	it('finds the person by sub the second time, even after their email changed at the provider', async () => {
		const organisation = await createOrganisation();
		const person = await createPerson(organisation.id, 'Ada Lovelace');
		await signInThroughIdp(claimsFor());

		const landing = await signInThroughIdp(
			claimsFor({ email: 'ada.byron@acme.test', name: 'Ada Byron' })
		);

		expect(errorOf(landing.location)).toBeNull();
		const [row] = await getDb().select().from(people).where(eq(people.id, person.id));
		expect(row).toMatchObject({ email: 'ada.byron@acme.test', fullName: 'Ada Byron' });
		const [user] = await getDb().select().from(users).where(eq(users.id, row.userId!));
		expect(user.email).toBe('ada.byron@acme.test');
		expect(await identitiesOf(person.id)).toHaveLength(1);
	});

	it('refuses an unverified email without linking or creating anyone', async () => {
		const organisation = await createOrganisation();
		const person = await createPerson(organisation.id, 'Ada Lovelace');
		await getDb()
			.insert(authenticationSettings)
			.values({ organisationId: organisation.id, jitProvisioning: true });

		const landing = await signInThroughIdp(claimsFor({ email_verified: false }));

		expect(errorOf(landing.location)).toBe('email_not_verified');
		expect(await identitiesOf(person.id)).toHaveLength(0);
		expect(await getDb().select().from(users)).toHaveLength(0);
		expect(await getDb().select().from(people)).toHaveLength(1);
	});

	it('refuses an inactive person', async () => {
		const organisation = await createOrganisation();
		const person = await createPerson(organisation.id, 'Ada Lovelace');
		await getDb().update(people).set({ active: false }).where(eq(people.id, person.id));

		const landing = await signInThroughIdp(claimsFor());

		expect(errorOf(landing.location)).toBe('person_inactive');
		expect(await identitiesOf(person.id)).toHaveLength(0);
	});

	it('refuses an unknown person with JIT off and creates them with JIT on', async () => {
		const organisation = await createOrganisation();

		const refused = await signInThroughIdp(claimsFor());
		expect(errorOf(refused.location)).toBe('no_person');
		expect(await getDb().select().from(people)).toHaveLength(0);

		await getDb()
			.insert(authenticationSettings)
			.values({ organisationId: organisation.id, jitProvisioning: true });
		const created = await signInThroughIdp(claimsFor());

		expect(errorOf(created.location)).toBeNull();
		const [person] = await getDb().select().from(people);
		expect(person).toMatchObject({ fullName: 'Ada Lovelace', email: 'ada.lovelace@acme.test' });
		const activity = await listActivity({
			organisationId: organisation.id,
			target: { personId: person.id }
		});
		expect(activity.find((entry) => entry.verb === 'person.created')?.payload).toMatchObject({
			via: 'sso'
		});
		const [user] = await getDb().select().from(users);
		expect(user.role).toBe('employee');
	});

	it('refuses a new identity whose email another person holds, leaving one open warning', async () => {
		const organisation = await createOrganisation();
		const holder = await createPerson(organisation.id, 'Ada Lovelace');
		await signInThroughIdp(claimsFor({ sub: 'sub-first' }));

		const first = await signInThroughIdp(claimsFor({ sub: 'sub-second' }));
		const again = await signInThroughIdp(claimsFor({ sub: 'sub-second' }));

		expect(errorOf(first.location)).toBe('email_taken');
		expect(errorOf(again.location)).toBe('email_taken');
		const warnings = await getDb().select().from(provisioningWarnings);
		expect(warnings).toHaveLength(1);
		expect(warnings[0]).toMatchObject({
			kind: 'email_taken',
			externalId: 'sub-second',
			dismissedAt: null,
			detail: { email: 'ada.lovelace@acme.test', personId: holder.id }
		});
	});

	it('carries a deep link through the round trip and ignores an off-origin one', async () => {
		const organisation = await createOrganisation();
		await createPerson(organisation.id, 'Ada Lovelace');

		const deep = await signInThroughIdp(claimsFor(), '/tickets?status=open');
		expect(deep.location).toBe('/tickets?status=open');

		await getDb().delete(sessions);
		const offOrigin = await signInThroughIdp(claimsFor(), 'https://evil.example/steal');
		expect(offOrigin.location).toBe('/');
	});
});

describe("the plugin's management API", () => {
	it('is closed: the provider comes from the environment and nowhere else', async () => {
		const response = await getAuth().handler(
			new Request(`${BETTER_AUTH_URL}/api/auth/sso/register`, {
				method: 'POST',
				headers: { 'content-type': 'application/json', origin: BETTER_AUTH_URL },
				body: '{}'
			})
		);

		expect(response.status).toBe(404);
	});
});

describe('SSO sessions', () => {
	it('lasts twelve hours and is never extended by a refresh', async () => {
		const organisation = await createOrganisation();
		await createPerson(organisation.id, 'Ada Lovelace');

		const landing = await signInThroughIdp(claimsFor());
		const [session] = await getDb().select().from(sessions);
		const lifetime = session.expiresAt.getTime() - session.createdAt.getTime();
		expect(Math.abs(lifetime - 12 * 3600 * 1000)).toBeLessThan(5_000);

		// Reading the session is what makes Better Auth consider a refresh.
		await getAuth().api.getSession({ headers: new Headers({ cookie: landing.cookie }) });
		const [after] = await getDb().select().from(sessions);
		expect(after.expiresAt.getTime()).toBe(session.expiresAt.getTime());
	});
});

describe('unlinking', () => {
	it('removes the identity, ends SSO sessions, and records the unlink', async () => {
		const organisation = await createOrganisation();
		const admin = await createViewer(organisation.id, 'admin', 'Grace Hopper');
		const person = await createPerson(organisation.id, 'Ada Lovelace');
		await signInThroughIdp(claimsFor());

		const outcome = await unlinkIdentity(admin, person.id);

		expect(outcome.ok).toBe(true);
		expect(await identitiesOf(person.id)).toHaveLength(0);
		const [row] = await getDb().select().from(people).where(eq(people.id, person.id));
		expect(
			await getDb().select().from(sessions).where(eq(sessions.userId, row.userId!))
		).toHaveLength(0);
		expect(
			await getDb()
				.select()
				.from(authAccounts)
				.where(and(eq(authAccounts.userId, row.userId!), eq(authAccounts.providerId, 'oidc')))
		).toHaveLength(0);
		const activity = await listActivity({
			organisationId: organisation.id,
			target: { personId: person.id }
		});
		expect(activity.map((entry) => entry.verb)).toContain('person.identity.unlinked');
	});

	it('is for admins only', async () => {
		const organisation = await createOrganisation();
		const technician = await createViewer(organisation.id, 'technician', 'Grace Hopper');
		const person = await createPerson(organisation.id, 'Ada Lovelace');
		await signInThroughIdp(claimsFor());

		const outcome = await unlinkIdentity(technician, person.id);

		expect(outcome.ok).toBe(false);
		expect(await identitiesOf(person.id)).toHaveLength(1);
	});
});

describe('SSO required', () => {
	async function passwordUser(organisationId: string, role: 'admin' | 'employee', name: string) {
		const viewer = await createViewer(organisationId, role, name);
		const ctx = await getAuth().$context;
		await getDb()
			.insert(authAccounts)
			.values({
				id: crypto.randomUUID(),
				userId: viewer.id,
				accountId: viewer.id,
				providerId: 'credential',
				password: await ctx.password.hash('correct horse battery')
			});
		return viewer;
	}
	const signIn = (email: string) =>
		getAuth().api.signInEmail({ body: { email, password: 'correct horse battery' } });

	it('revokes non-admin password sessions, keeps their hashes and refuses them afterwards', async () => {
		const organisation = await createOrganisation();
		const admin = await passwordUser(organisation.id, 'admin', 'Grace Hopper');
		const employee = await passwordUser(organisation.id, 'employee', 'Ada Lovelace');
		await signIn(admin.email);
		await signIn(employee.email);

		const saved = await updateAuthenticationSettings(admin, {
			buttonLabel: null,
			jitProvisioning: false,
			ssoRequired: true,
			autoRedirect: false
		});
		expect(saved.ok).toBe(true);

		const remaining = await getDb().select().from(sessions);
		expect(remaining.map((session) => session.userId)).toEqual([admin.id]);
		const hashes = await getDb()
			.select()
			.from(authAccounts)
			.where(eq(authAccounts.userId, employee.id));
		expect(hashes[0].password).toBeTruthy();

		await expect(signIn(employee.email)).rejects.toThrow();
		await expect(signIn(admin.email)).resolves.toBeTruthy();

		await updateAuthenticationSettings(admin, {
			buttonLabel: null,
			jitProvisioning: false,
			ssoRequired: false,
			autoRedirect: false
		});
		await expect(signIn(employee.email)).resolves.toBeTruthy();
	});

	it('cannot hold auto-redirect without SSO required, in the database or through the form', async () => {
		const organisation = await createOrganisation();
		const admin = await createViewer(organisation.id, 'admin');

		await expect(
			getDb()
				.insert(authenticationSettings)
				.values({ organisationId: organisation.id, ssoRequired: false, autoRedirect: true })
		).rejects.toThrow();

		await updateAuthenticationSettings(admin, {
			buttonLabel: null,
			jitProvisioning: false,
			ssoRequired: false,
			autoRedirect: true
		});
		const [row] = await getDb().select().from(authenticationSettings);
		expect(row.autoRedirect).toBe(false);
	});
});
