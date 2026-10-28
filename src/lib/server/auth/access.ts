import { and, eq } from 'drizzle-orm';
import { OIDC_PROVIDER_ID } from '../../oidc';
import { getDb } from '../db';
import { uniqueConstraintName } from '../db/errors';
import {
	countActiveAdmins,
	deactivatePerson,
	findPersonForAccess,
	linkPersonToUser,
	setPersonEmail,
	unlinkPersonIdentity,
	userIdOfPerson,
	type PersonDeactivateFailure
} from '../directory';
import { can } from '../access/permissions';
import { failure, success, type Outcome } from '../shared/outcome';
import type { SessionUser } from './guards';
import { getAuth } from '.';
import { authAccounts, sessions, users, type UserRole } from './schema';
import { getAuthenticationSettings } from './settings';
import { generateTemporaryPassword } from './temporary-password';

/**
 * Staff-managed credentials (#230, ADR 0033): an admin gives a person access
 * with a system-generated temporary password, and later changes the role,
 * resets the password or takes the access away.
 *
 * Whoever calls these has already been allowed to (`people.manage`); scoping to
 * the actor's organisation is this module's job. Better Auth is used for what
 * it owns, the password hasher, and nothing else: its sign-up endpoint would
 * leave a session behind and its admin plugin would add a second source of
 * truth for roles.
 */

export { generateTemporaryPassword } from './temporary-password';

export type GrantAccessFailure =
	'not_found' | 'already_has_access' | 'inactive' | 'email_taken' | 'sso_required';
export type ResetPasswordFailure = 'not_found' | 'no_access' | 'sso_required';
export type ChangeRoleFailure = 'not_found' | 'no_access' | 'last_admin' | 'self';
export type RevokeAccessFailure = ChangeRoleFailure;
export type ChangeAccessEmailFailure =
	'not_found' | 'no_access' | 'email_taken' | 'identity_managed';
export type UnlinkIdentityFailure = 'not_found' | 'not_linked';

async function hashPassword(password: string): Promise<string> {
	return (await getAuth().$context).password.hash(password);
}

export async function grantAccess(
	actor: SessionUser,
	personId: string,
	role: UserRole
): Promise<Outcome<{ temporaryPassword: string }, GrantAccessFailure>> {
	// While SSO is required a new person gets in through the identity provider; a
	// password is only ever handed out to an admin (ADR 0056).
	if (role !== 'admin' && (await getAuthenticationSettings(actor.organisationId)).ssoRequired) {
		return failure('sso_required');
	}
	const temporaryPassword = generateTemporaryPassword();
	const passwordHash = await hashPassword(temporaryPassword);

	try {
		return await getDb().transaction(async (tx) => {
			const person = await findPersonForAccess(tx, actor.organisationId, personId);
			if (!person) return failure('not_found');
			if (person.userId !== null) return failure('already_has_access');
			if (!person.active) return failure('inactive');

			const userId = crypto.randomUUID();
			await tx.insert(users).values({
				id: userId,
				name: person.fullName,
				// Better Auth compares sign-in emails lowercased.
				email: person.email.toLowerCase(),
				role,
				mustChangePassword: true
			});
			await tx.insert(authAccounts).values({
				id: crypto.randomUUID(),
				userId,
				accountId: userId,
				providerId: 'credential',
				password: passwordHash
			});
			await linkPersonToUser(tx, personId, userId);

			return success({ temporaryPassword });
		});
	} catch (error) {
		if (uniqueConstraintName(error) !== null) return failure('email_taken');
		throw error;
	}
}

export async function resetPassword(
	actor: SessionUser,
	personId: string
): Promise<Outcome<{ temporaryPassword: string }, ResetPasswordFailure>> {
	const temporaryPassword = generateTemporaryPassword();
	const passwordHash = await hashPassword(temporaryPassword);
	const { ssoRequired } = await getAuthenticationSettings(actor.organisationId);

	return getDb().transaction(async (tx) => {
		const person = await findPersonForAccess(tx, actor.organisationId, personId);
		if (!person) return failure('not_found');
		if (person.userId === null) return failure('no_access');

		const [user] = await tx.select().from(users).where(eq(users.id, person.userId)).limit(1);
		if (user.role !== 'admin' && ssoRequired) return failure('sso_required');

		await tx
			.update(authAccounts)
			.set({ password: passwordHash, updatedAt: new Date() })
			.where(
				and(eq(authAccounts.userId, person.userId), eq(authAccounts.providerId, 'credential'))
			);
		await tx
			.update(users)
			.set({ mustChangePassword: true, updatedAt: new Date() })
			.where(eq(users.id, person.userId));
		await tx.delete(sessions).where(eq(sessions.userId, person.userId));

		return success({ temporaryPassword });
	});
}

export async function changeRole(
	actor: SessionUser,
	personId: string,
	role: UserRole
): Promise<Outcome<void, ChangeRoleFailure>> {
	return getDb().transaction(async (tx) => {
		const person = await findPersonForAccess(tx, actor.organisationId, personId);
		if (!person) return failure('not_found');
		if (person.userId === null) return failure('no_access');

		const [user] = await tx.select().from(users).where(eq(users.id, person.userId)).limit(1);
		if (user.role === role) return success(undefined);

		if (actor.personId === personId) return failure('self');
		if (user.role === 'admin' && (await countActiveAdmins(tx, actor.organisationId)) <= 1) {
			return failure('last_admin');
		}

		await tx.update(users).set({ role, updatedAt: new Date() }).where(eq(users.id, user.id));
		return success(undefined);
	});
}

/** Deleting the user cascades to its sessions and credential; the person stays, with no access. */
export async function revokeAccess(
	actor: SessionUser,
	personId: string
): Promise<Outcome<void, RevokeAccessFailure>> {
	return getDb().transaction(async (tx) => {
		const person = await findPersonForAccess(tx, actor.organisationId, personId);
		if (!person) return failure('not_found');
		if (person.userId === null) return failure('no_access');
		if (actor.personId === personId) return failure('self');

		const [user] = await tx.select().from(users).where(eq(users.id, person.userId)).limit(1);
		if (user.role === 'admin' && (await countActiveAdmins(tx, actor.organisationId)) <= 1) {
			return failure('last_admin');
		}

		await tx.delete(users).where(eq(users.id, person.userId));
		return success(undefined);
	});
}

/**
 * The address is both the person's contact and their sign-in, so it changes in
 * both places or in neither (lifts #229's `email_locked`).
 */
export async function changeAccessEmail(
	actor: SessionUser,
	personId: string,
	email: string
): Promise<Outcome<void, ChangeAccessEmailFailure>> {
	try {
		return await getDb().transaction(async (tx) => {
			const person = await findPersonForAccess(tx, actor.organisationId, personId);
			if (!person) return failure('not_found');
			if (person.userId === null) return failure('no_access');
			// The identity provider owns the address of a linked person, until they are
			// inactive: then an admin may free it (ADR 0056).
			if (person.hasIdentity && person.active) return failure('identity_managed');

			await tx
				.update(users)
				.set({ email: email.toLowerCase(), updatedAt: new Date() })
				.where(eq(users.id, person.userId));
			await setPersonEmail(tx, personId, email);
			return success(undefined);
		});
	} catch (error) {
		if (uniqueConstraintName(error) !== null) return failure('email_taken');
		throw error;
	}
}

/** Deactivation blocks sign-in: the person is deactivated and their sessions end with it. */
export async function deactivatePersonAndEndSessions(
	actor: SessionUser,
	personId: string
): Promise<Outcome<void, PersonDeactivateFailure>> {
	const userId = await userIdOfPerson(actor.organisationId, personId);
	const outcome = await deactivatePerson(actor, personId);
	if (outcome.ok && userId !== null) await endSessions(userId);
	return outcome;
}

/**
 * Unlinks a person from the identity provider (ADR 0056): the link goes, their
 * SSO sessions end, and name and email are theirs to edit again. Their local
 * credential, if they have one, is untouched.
 */
export async function unlinkIdentity(
	actor: SessionUser,
	personId: string
): Promise<Outcome<void, UnlinkIdentityFailure>> {
	if (!can(actor, 'organisation.manage')) return failure('not_found');

	return getDb().transaction(async (tx) => {
		const unlinked = await unlinkPersonIdentity(tx, actor, personId);
		if (!unlinked.ok) return failure(unlinked.error);

		const { userId } = unlinked.value;
		if (userId !== null) {
			await tx
				.delete(sessions)
				.where(and(eq(sessions.userId, userId), eq(sessions.authMethod, 'sso')));
			// Better Auth's own record of the same account would let the old `sub` back in.
			await tx
				.delete(authAccounts)
				.where(and(eq(authAccounts.userId, userId), eq(authAccounts.providerId, OIDC_PROVIDER_ID)));
		}
		return success(undefined);
	});
}

export async function endSessions(userId: string): Promise<void> {
	await getDb().delete(sessions).where(eq(sessions.userId, userId));
}

/**
 * Whether the user's own password change is allowed through: Better Auth does
 * the verification and the hashing, this only lifts the flag afterwards.
 */
export async function clearMustChangePassword(userId: string): Promise<void> {
	await getDb()
		.update(users)
		.set({ mustChangePassword: false, updatedAt: new Date() })
		.where(eq(users.id, userId));
}
