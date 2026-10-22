import { eq } from 'drizzle-orm';
import { can } from '../access/permissions';
import type { SessionUser } from '../auth/guards';
import { getDb } from '../db';
import { failure, success, type Outcome } from '../shared/outcome';
import { organisations } from './schema';

/**
 * Organisation-level switches that change what a fixed role may do (ADR 0044).
 * Roles stay product constants (ADR 0007); a switch only lends a role one named
 * permission, and `resolveSessionUser` reads it on every request.
 */

export async function getTechniciansEditDirectory(organisationId: string): Promise<boolean> {
	const [row] = await getDb()
		.select({ enabled: organisations.techniciansEditDirectory })
		.from(organisations)
		.where(eq(organisations.id, organisationId))
		.limit(1);
	return row?.enabled ?? false;
}

/** Admin only: whoever can switch it is whoever can already hold `people.manage`. */
export async function setTechniciansEditDirectory(
	user: SessionUser,
	enabled: boolean
): Promise<Outcome<boolean, 'forbidden'>> {
	if (!can(user, 'organisation.manage')) return failure('forbidden');

	await getDb()
		.update(organisations)
		.set({ techniciansEditDirectory: enabled, updatedAt: new Date() })
		.where(eq(organisations.id, user.organisationId));
	return success(enabled);
}
