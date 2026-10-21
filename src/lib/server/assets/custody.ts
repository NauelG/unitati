import { eq } from 'drizzle-orm';
import type { HandoverCondition } from '#lib/domain/handover.js';
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

/**
 * The write half of taking an asset back, shared by `returnCustody` and
 * `takeBack`. The caller has already proved `person` holds it. A take-back
 * records the condition beside the person (#278); the low-level recorder has none.
 */
export async function recordCustodyReturned(
	tx: Transaction,
	actor: SessionUser,
	assetId: string,
	person: { id: string; fullName: string },
	condition?: { condition: HandoverCondition; notes: string | null }
): Promise<void> {
	await tx
		.update(assets)
		.set({ custodianPersonId: null, updatedAt: new Date() })
		.where(eq(assets.id, assetId));

	await recordActivity(tx, {
		organisationId: actor.organisationId,
		...actorColumns(actor),
		target: { assetId },
		verb: 'custody.returned',
		payload: {
			fromPersonId: person.id,
			fromPersonName: person.fullName,
			...(condition ? { condition: condition.condition, conditionNotes: condition.notes } : {})
		}
	});
}
