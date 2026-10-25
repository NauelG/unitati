import { and, eq } from 'drizzle-orm';
import { categoryInOrganisation as findCategory } from '../assets';
import type { SessionUser } from '../auth/guards';
import { getDb, type Transaction } from '../db';
import { ticketInOrganisation } from '../service-desk';
import { failure, success, type Outcome } from '../shared/outcome';
import { ticketCategory } from './schema';

/**
 * A ticket asks for an asset category (`requests`, #271): the half of an
 * equipment request that is not text. Like `ticket-handover.ts` it writes
 * nothing to `activity`: the ticket is created in the same transaction, and
 * its own `ticket.created` entry already says it was opened.
 */

export interface RequestedCategory {
	id: string;
	name: string;
}

export type LinkCategoryFailure = 'ticket_not_found' | 'category_not_found';

/**
 * Links a category to a ticket inside the caller's transaction, so the ticket
 * and the request commit together. Idempotent. The ticket is the caller's to
 * authorise, as in `linkAsset`.
 */
export async function linkCategory(
	tx: Transaction,
	actor: SessionUser,
	pair: { ticketId: string; categoryId: string }
): Promise<Outcome<void, LinkCategoryFailure>> {
	if (!(await ticketInOrganisation(tx, actor, pair.ticketId))) return failure('ticket_not_found');

	const category = await findCategory(tx, actor.organisationId, pair.categoryId);
	if (!category) return failure('category_not_found');

	await tx
		.insert(ticketCategory)
		.values({
			organisationId: actor.organisationId,
			ticketId: pair.ticketId,
			categoryId: pair.categoryId,
			createdByPersonId: actor.personId
		})
		.onConflictDoNothing({ target: [ticketCategory.ticketId, ticketCategory.categoryId] });

	return success(undefined);
}

/**
 * The category a ticket asked for, or `null`. Tenancy only: the ticket page
 * has already scoped the ticket to the viewer, and the name of a category is
 * not redacted per viewer (as `listCategories`).
 */
export async function requestedCategory(
	organisationId: string,
	ticketId: string
): Promise<RequestedCategory | null> {
	const [link] = await getDb()
		.select({ categoryId: ticketCategory.categoryId })
		.from(ticketCategory)
		.where(
			and(eq(ticketCategory.organisationId, organisationId), eq(ticketCategory.ticketId, ticketId))
		)
		.orderBy(ticketCategory.createdAt)
		.limit(1);
	if (!link) return null;

	return findCategory(getDb(), organisationId, link.categoryId);
}
