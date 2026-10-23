import { and, eq } from 'drizzle-orm';
import { can } from '../access/permissions';
import { handoverByCode, handoverInOrganisation } from '../assets';
import type { SessionUser } from '../auth/guards';
import { getDb, type Transaction } from '../db';
import { failure, success, type Outcome } from '../shared/outcome';
import { ticketInOrganisation } from '../service-desk';
import { ticketHandover } from './schema';

/**
 * Relating a ticket to the handover that fulfils it (`fulfilled-by`, #279).
 *
 * The same shape as `ticket-asset.ts`, with two differences. Nothing is written
 * to `activity`: the relation shows on the ticket's related panel and the
 * decision leaves its own note, so a second record of the link would only
 * repeat them. And linking never touches the ticket row: closing it is each
 * organisation's policy, not ours (ADR 0035).
 */

export interface TicketHandoverPair {
	ticketId: string;
	handoverId: string;
}

export type LinkHandoverFailure = 'ticket_not_found' | 'handover_not_found';

/**
 * Links a handover to a ticket inside the caller's transaction, so a delivery
 * and its link commit together. Idempotent: a pair that already exists writes
 * nothing and succeeds, because the dialog can be submitted twice.
 *
 * The ticket is the caller's to authorise, exactly as in `linkAsset`.
 */
export async function linkHandover(
	tx: Transaction,
	actor: SessionUser,
	pair: TicketHandoverPair
): Promise<Outcome<void, LinkHandoverFailure>> {
	if (!(await ticketInOrganisation(tx, actor, pair.ticketId))) return failure('ticket_not_found');
	if (!(await handoverInOrganisation(tx, actor.organisationId, pair.handoverId))) {
		return failure('handover_not_found');
	}

	await tx
		.insert(ticketHandover)
		.values({
			organisationId: actor.organisationId,
			ticketId: pair.ticketId,
			handoverId: pair.handoverId,
			createdByPersonId: actor.personId
		})
		.onConflictDoNothing({ target: [ticketHandover.ticketId, ticketHandover.handoverId] });

	return success(undefined);
}

export type LinkHandoverByCodeFailure = LinkHandoverFailure | 'forbidden';

/** Links an existing handover, named by its code, from the ticket page. */
export async function linkHandoverByCode(
	actor: SessionUser,
	input: { ticketId: string; code: string }
): Promise<Outcome<void, LinkHandoverByCodeFailure>> {
	if (!can(actor, 'tickets.manage')) return failure('forbidden');

	return getDb().transaction(async (tx) => {
		const handover = await handoverByCode(tx, actor.organisationId, input.code);
		if (!handover) return failure('handover_not_found' as const);

		return linkHandover(tx, actor, { ticketId: input.ticketId, handoverId: handover.id });
	});
}

export type UnlinkHandoverFailure = 'forbidden' | 'not_linked';

/** Undoes a link. Behind `tickets.manage`, checked here as well as in the route. */
export async function unlinkHandover(
	actor: SessionUser,
	pair: TicketHandoverPair
): Promise<Outcome<void, UnlinkHandoverFailure>> {
	if (!can(actor, 'tickets.manage')) return failure('forbidden');

	const removed = await getDb()
		.delete(ticketHandover)
		.where(
			and(
				eq(ticketHandover.organisationId, actor.organisationId),
				eq(ticketHandover.ticketId, pair.ticketId),
				eq(ticketHandover.handoverId, pair.handoverId)
			)
		)
		.returning({ id: ticketHandover.id });

	return removed.length === 0 ? failure('not_linked') : success(undefined);
}
