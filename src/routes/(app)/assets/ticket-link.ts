import { can } from '#lib/server/access/permissions.js';
import type { SessionUser } from '#lib/server/auth/guards.js';
import type { Transaction } from '#lib/server/db/index.js';
import { linkHandover } from '#lib/server/links/index.js';
import { getTicketByTag } from '#lib/server/service-desk/index.js';

/**
 * The optional ticket of a deliver or take-back form (#279): the handover
 * fulfils it, and the link is written in the operation's own transaction.
 *
 * Linking is `tickets.manage` business, checked here because the form may be
 * posted by someone who can hand equipment over but cannot manage tickets. A
 * blank tag is no ticket, which is a real choice, not an error.
 */
export type TicketLink =
	| {
			ok: true;
			afterIssue?: (tx: Transaction, handover: { id: string }) => Promise<void>;
	  }
	| { ok: false };

export async function ticketLinkFor(user: SessionUser, rawTag: unknown): Promise<TicketLink> {
	const tag = typeof rawTag === 'string' ? rawTag.trim().toUpperCase() : '';
	if (tag === '') return { ok: true };
	if (!can(user, 'tickets.manage')) return { ok: false };

	const found = await getTicketByTag(user, tag);
	if (!found.ok) return { ok: false };

	const ticketId = found.value.id;
	return {
		ok: true,
		afterIssue: async (tx, handover) => {
			const linked = await linkHandover(tx, user, { ticketId, handoverId: handover.id });
			// Throwing rolls the whole operation back: no custody without its link.
			if (!linked.ok) throw new Error(`Could not link the handover: ${linked.error}`);
		}
	};
}
