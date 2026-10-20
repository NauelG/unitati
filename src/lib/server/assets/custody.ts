import { eq } from 'drizzle-orm';
import { actorColumns, recordActivity } from '../activity';
import type { SessionUser } from '../auth/guards';
import type { Transaction } from '../db';
import { assets } from './schema';

/**
 * The write half of handing an asset over, shared by `assignCustody` (the
 * low-level recorder) and `deliver` (the operation a technician performs). The
 * caller has already proved the asset is free and the person is real.
 *
 * The person's name is snapshotted beside their id (ADR 0009).
 */
export async function recordCustodyAssigned(
	tx: Transaction,
	actor: SessionUser,
	assetId: string,
	person: { id: string; fullName: string }
): Promise<void> {
	await tx
		.update(assets)
		.set({ custodianPersonId: person.id, updatedAt: new Date() })
		.where(eq(assets.id, assetId));

	await recordActivity(tx, {
		organisationId: actor.organisationId,
		...actorColumns(actor),
		target: { assetId },
		verb: 'custody.assigned',
		payload: { toPersonId: person.id, toPersonName: person.fullName }
	});
}
