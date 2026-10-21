import { eq } from 'drizzle-orm';
import { getDb } from '../db';
import type { DomainEvents } from '../shared/events';
import { addSystemNote, handoverDecidedNote } from '../service-desk';
import { ticketHandover } from './schema';

/**
 * The listener of `handover.accepted` and `handover.rejected` (#279, ADR 0024,
 * ADR 0035): an internal note on every ticket the handover fulfils.
 *
 * `assets` emits the fact without knowing tickets exist; this domain holds the
 * relation, so the reaction lives here. The note is all it does: the ticket's
 * status, assignee and queue are never touched, and a handover no ticket asked
 * for finds no link and does nothing.
 */
export async function notifyHandoverDecided(
	event: DomainEvents['handover.accepted'] | DomainEvents['handover.rejected'],
	outcome: { accepted: true } | { accepted: false; reason: string } = 'reason' in event
		? { accepted: false, reason: event.reason }
		: { accepted: true }
): Promise<void> {
	const links = await getDb()
		.select({ ticketId: ticketHandover.ticketId })
		.from(ticketHandover)
		.where(eq(ticketHandover.handoverId, event.handoverId));

	const body = handoverDecidedNote(event, outcome);

	// All the tickets or none, so a retry never doubles a note on the first one.
	await getDb().transaction(async (tx) => {
		for (const { ticketId } of links) {
			await addSystemNote(event.organisationId, ticketId, body, tx);
		}
	});
}
