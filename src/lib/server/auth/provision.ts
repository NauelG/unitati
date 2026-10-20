import { eq } from 'drizzle-orm';
import { ensureDefaultHandoverTemplates } from '../assets';
import { getDb } from '../db';
import { organisations, people } from '../directory/schema';
import { ensureDefaultStates } from '../projects';
import { failure, success, type Outcome } from '../shared/outcome';
import { users } from './schema';

export type SetupFailure = 'already-set-up' | 'account-not-created';

/**
 * Turns the very first credential into the installation's owner: it creates the
 * organisation, promotes the user to admin and gives them a directory record.
 *
 * Better Auth has already created the `users` row by the time this runs — it
 * owns password hashing — so this only adds what the product needs around it.
 * The whole thing is one transaction: a half-provisioned installation would
 * leave a user who can sign in and belongs to nothing.
 */
export async function provisionFirstAdmin(
	userId: string,
	organisationName: string
): Promise<Outcome<{ organisationId: string; personId: string }, SetupFailure>> {
	return getDb().transaction(async (tx) => {
		// Re-checked inside the transaction: the landing check in `load` is a
		// courtesy, this is the one that counts when two people submit at once.
		const existing = await tx.select({ id: organisations.id }).from(organisations).limit(1);
		if (existing.length > 0) return failure('already-set-up' as const);

		const [user] = await tx.select().from(users).where(eq(users.id, userId)).limit(1);
		if (!user) return failure('account-not-created' as const);

		const [organisation] = await tx
			.insert(organisations)
			.values({ name: organisationName, slug: slugify(organisationName) })
			.returning({ id: organisations.id });

		// An organisation is born with a board to put tasks on (#121).
		await ensureDefaultStates(tx, organisation.id);
		// ...and with an agreement text for each direction of handover (#273).
		await ensureDefaultHandoverTemplates(tx, organisation.id);

		await tx
			.update(users)
			.set({ role: 'admin', updatedAt: new Date() })
			.where(eq(users.id, userId));

		const [person] = await tx
			.insert(people)
			.values({
				organisationId: organisation.id,
				userId: user.id,
				fullName: user.name,
				email: user.email
			})
			.returning({ id: people.id });

		return success({ organisationId: organisation.id, personId: person.id });
	});
}

function slugify(value: string): string {
	return (
		value
			.normalize('NFD')
			.replace(/[\u0300-\u036f]/g, '')
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, '-')
			.replace(/^-|-$/g, '')
			.slice(0, 48) || 'unitati'
	);
}
