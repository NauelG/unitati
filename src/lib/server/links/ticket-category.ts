import { and, eq } from 'drizzle-orm';
import { categories } from '../assets/schema';
import type { SessionUser } from '../auth/guards';
import { getDb, type Transaction } from '../db';
import { failure, success, type Outcome } from '../shared/outcome';
import { ticketInOrganisation } from './ticket-asset';
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

/** The category, if it belongs to the actor's organisation; the one check a form's posted id needs. */
export async function categoryInOrganisation(
	actor: SessionUser,
	categoryId: string
): Promise<RequestedCategory | null> {
	const [category] = await getDb()
		.select({ id: categories.id, name: categories.name })
		.from(categories)
		.where(and(eq(categories.id, categoryId), eq(categories.organisationId, actor.organisationId)))
		.limit(1);
	return category ?? null;
}

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

	const [category] = await tx
		.select({ id: categories.id })
		.from(categories)
		.where(
			and(eq(categories.id, pair.categoryId), eq(categories.organisationId, actor.organisationId))
		)
		.limit(1);
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
	const [row] = await getDb()
		.select({ id: categories.id, name: categories.name })
		.from(ticketCategory)
		.innerJoin(categories, eq(categories.id, ticketCategory.categoryId))
		.where(
			and(eq(ticketCategory.organisationId, organisationId), eq(ticketCategory.ticketId, ticketId))
		)
		.orderBy(ticketCategory.createdAt)
		.limit(1);
	return row ?? null;
}
