import { and, eq } from 'drizzle-orm';
import { getAuth } from '../auth';
import type { SessionUser } from '../auth/guards';
import { provisionFirstAdmin } from '../provisioning';
import { users, type UserRole } from '../auth/schema';
import { getDb } from '../db';
import { resolveSessionUser } from '../directory';
import { organisations, people } from '../directory/schema';
import { emailFor, DEMO_ACCOUNTS } from './plan';

/**
 * A published password, on purpose. This is a development fixture, and
 * `assertLocalDatabase` is what keeps it off any machine that is not yours.
 * Ten characters because that is the floor the product sets (`MIN_PASSWORD_LENGTH`).
 */
export const DEMO_PASSWORD = 'unitati-demo-1';

const ADMIN = { name: 'Ada Admin', email: 'admin@acme.test' };

export interface Workspace {
	organisationId: string;
	actor: SessionUser;
	/** True when the seed made the organisation, so nobody ran `/setup`. */
	createdOrganisation: boolean;
}

async function signUp(name: string, email: string): Promise<string> {
	const { response } = await getAuth().api.signUpEmail({
		body: { name, email, password: DEMO_PASSWORD },
		headers: new Headers(),
		returnHeaders: true
	});
	return response.user.id;
}

/**
 * The organisation the seed writes into, and an administrator to act as.
 *
 * Whatever `/setup` already made is used as it is: seeding must not create a
 * second organisation next to a real one. Only on an empty database does the
 * seed do `/setup`'s job itself — otherwise `npm run db:seed && npm run dev`
 * would leave an installation nobody can sign in to, with `/setup` already
 * locked behind the organisation the seed made.
 */
export async function ensureWorkspace(): Promise<Workspace> {
	const [existing] = await getDb().select({ id: organisations.id }).from(organisations).limit(1);

	if (!existing) {
		const userId = await signUp(ADMIN.name, ADMIN.email);
		const provisioned = await provisionFirstAdmin(userId, 'Acme');
		if (!provisioned.ok)
			throw new Error(`Could not provision the organisation: ${provisioned.error}`);

		const actor = await resolveSessionUser(userId);
		if (!actor) throw new Error('The administrator the seed just made has no directory record.');
		return { organisationId: provisioned.value.organisationId, actor, createdOrganisation: true };
	}

	const [admin] = await getDb()
		.select({ userId: users.id })
		.from(users)
		.innerJoin(people, eq(people.userId, users.id))
		.where(and(eq(people.organisationId, existing.id), eq(users.role, 'admin')))
		.limit(1);

	if (!admin) throw new Error('The organisation has no administrator to act as.');

	const actor = await resolveSessionUser(admin.userId);
	if (!actor) throw new Error('The administrator has no directory record.');
	return { organisationId: existing.id, actor, createdOrganisation: false };
}

export interface DemoLogin {
	role: UserRole;
	email: string;
	created: boolean;
}

/**
 * Gives the seeded technician and employee a credential, by attaching it to the
 * person the plan already made — so the employee signs in as somebody who holds
 * equipment, which is the only way to see the redaction work.
 */
export async function ensureDemoLogins(organisationId: string): Promise<DemoLogin[]> {
	const logins: DemoLogin[] = [];

	for (const account of DEMO_ACCOUNTS) {
		const email = emailFor(account.fullName);

		const [existing] = await getDb()
			.select({ id: users.id })
			.from(users)
			.where(eq(users.email, email))
			.limit(1);

		if (existing) {
			logins.push({ role: account.role, email, created: false });
			continue;
		}

		const userId = await signUp(account.fullName, email);
		await getDb().update(users).set({ role: account.role }).where(eq(users.id, userId));
		await getDb()
			.update(people)
			.set({ userId })
			.where(and(eq(people.organisationId, organisationId), eq(people.email, email)));

		logins.push({ role: account.role, email, created: true });
	}

	return logins;
}
