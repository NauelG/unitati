import { and, eq } from 'drizzle-orm';
import type { Transaction } from '../db';
import { getDb } from '../db';
import { users } from '../auth/schema';
import { people } from './schema';

/**
 * What the `auth` domain needs from the directory to grant, change and revoke
 * access (#230, ADR 0002): it never touches `people` itself, it asks here.
 *
 * Every function takes the caller's transaction so the credential and the
 * directory record change together or not at all.
 */

export interface PersonForAccess {
	id: string;
	fullName: string;
	email: string;
	active: boolean;
	/** The credential that signs in as this person, if any. */
	userId: string | null;
}

export async function findPersonForAccess(
	tx: Transaction,
	organisationId: string,
	personId: string
): Promise<PersonForAccess | null> {
	const [row] = await tx
		.select({
			id: people.id,
			fullName: people.fullName,
			email: people.email,
			active: people.active,
			userId: people.userId
		})
		.from(people)
		.where(and(eq(people.id, personId), eq(people.organisationId, organisationId)))
		.limit(1);
	return row ?? null;
}

export async function linkPersonToUser(
	tx: Transaction,
	personId: string,
	userId: string
): Promise<void> {
	await tx.update(people).set({ userId, updatedAt: new Date() }).where(eq(people.id, personId));
}

/**
 * Changes the address on the directory record. A duplicate in the organisation
 * surfaces as the database's unique violation, for the caller to translate.
 */
export async function setPersonEmail(
	tx: Transaction,
	personId: string,
	email: string
): Promise<void> {
	await tx.update(people).set({ email, updatedAt: new Date() }).where(eq(people.id, personId));
}

/**
 * Admins who can still sign in: the credential is an admin and its person is
 * active in this organisation. Locks the rows, so two concurrent demotions
 * cannot both see "someone else is still an admin".
 */
export async function countActiveAdmins(tx: Transaction, organisationId: string): Promise<number> {
	const rows = await tx
		.select({ id: users.id })
		.from(users)
		.innerJoin(people, eq(people.userId, users.id))
		.where(
			and(
				eq(users.role, 'admin'),
				eq(people.active, true),
				eq(people.organisationId, organisationId)
			)
		)
		.for('update', { of: users });
	return rows.length;
}

/** The credential behind a person, whatever their state. Null when none. */
export async function userIdOfPerson(
	organisationId: string,
	personId: string
): Promise<string | null> {
	const person = await getDb().transaction((tx) =>
		findPersonForAccess(tx, organisationId, personId)
	);
	return person?.userId ?? null;
}

/** True when this credential belongs to an active person (or to no person at all yet). */
export async function isUserActive(userId: string): Promise<boolean> {
	const [row] = await getDb()
		.select({ active: people.active })
		.from(people)
		.where(eq(people.userId, userId))
		.limit(1);
	return row?.active ?? true;
}
