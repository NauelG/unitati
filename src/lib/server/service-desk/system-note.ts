import { eq } from 'drizzle-orm';
import { getDb, type Executor } from '../db';
import { ticketComments, tickets } from './schema';

/**
 * An internal note written by the product, not by a person (#279): the ticket's
 * thread says what happened elsewhere, for staff only.
 *
 * It has no author and is always `internal`, so a requester never sees it. It
 * touches `updated_at` like any comment, and nothing else of the ticket: status,
 * assignee and queue are the technician's to change (ADR 0035). Callers are
 * event handlers that have already decided which tickets this concerns, so
 * there is no actor to authorise here.
 */
export async function addSystemNote(
	organisationId: string,
	ticketId: string,
	body: string,
	executor: Executor = getDb()
): Promise<void> {
	const write = async (tx: Executor) => {
		await tx
			.insert(ticketComments)
			.values({ organisationId, ticketId, authorPersonId: null, body, visibility: 'internal' });
		await tx.update(tickets).set({ updatedAt: new Date() }).where(eq(tickets.id, ticketId));
	};

	// Both writes or neither, unless the caller already holds the transaction.
	if ('transaction' in executor) await executor.transaction(write);
	else await write(executor);
}

/**
 * The note a decided handover leaves on a ticket it fulfils (#279). The body
 * states the fact and hands the decision back: nothing about the ticket has
 * changed (ADR 0035). Wording is Spanish like the mails (ADR 0008).
 */
export function handoverDecidedNote(
	handover: { handoverCode: string; direction: 'delivery' | 'return'; personName: string },
	outcome: { accepted: true } | { accepted: false; reason: string }
): string {
	const what = handover.direction === 'delivery' ? 'La entrega' : 'La devolución';
	const head = `${what} ${handover.handoverCode} ha sido`;
	return outcome.accepted
		? `${head} aceptada y firmada por ${handover.personName}.`
		: `${head} rechazada por ${handover.personName}. Motivo: ${outcome.reason}`;
}
