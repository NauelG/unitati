import type { Transaction } from '../db';
import { follows } from './schema';

/**
 * Makes `personId` a follower of a ticket (#303). Idempotent: following twice is
 * the same as once. Callers decide *who* should follow (a mention does, unless the
 * person is a participant already); #57 reuses this for the explicit Follow button.
 */
export async function followTicket(
	tx: Transaction,
	input: { organisationId: string; personId: string; ticketId: string }
): Promise<void> {
	await tx.insert(follows).values(input).onConflictDoNothing();
}
