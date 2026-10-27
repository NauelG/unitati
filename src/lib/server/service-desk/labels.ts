import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import type { CatalogueColor } from '#lib/domain/catalogue-color.js';
import { actorColumns, recordActivity } from '../activity';
import type { SessionUser } from '../auth/guards';
import { getDb } from '../db';
import { constraintViolation, uniqueConstraintName } from '../db/errors';
import { failure, success, type Outcome } from '../shared/outcome';
import { labels, ticketLabels, tickets } from './schema';
import { labelInput, type LabelInput } from './validation';

/**
 * Labels on tickets (ADR 0053): a flat catalogue the organisation owns, applied
 * to any ticket whatever its queue. The catalogue is staff business, gated by the
 * settings section (`tickets.manage`); applying a label is `tickets.manage` too,
 * enforced by the route. Both trust the route's gate and scope tenancy only.
 */

export type LabelFailure = 'duplicate_label_name' | 'invalid_label';
export type LabelEditFailure = LabelFailure | 'label_not_found';
export type LabelDeleteFailure = 'label_not_found' | 'label_in_use';
export type SetTicketLabelsFailure = 'ticket_not_found' | 'label_not_found' | 'label_archived';

export interface LabelEntry {
	id: string;
	name: string;
	description: string | null;
	color: CatalogueColor;
	active: boolean;
}

const entryColumns = {
	id: labels.id,
	name: labels.name,
	description: labels.description,
	color: labels.color,
	active: labels.active
};

/** Every label of the organisation, archived ones included, alphabetically without regard to case. */
export function listLabels(viewer: SessionUser): Promise<LabelEntry[]> {
	return getDb()
		.select(entryColumns)
		.from(labels)
		.where(eq(labels.organisationId, viewer.organisationId))
		.orderBy(asc(sql`lower(${labels.name})`), asc(labels.id));
}

/** The labels on one ticket, by name. Archived ones are included: they are shown and can be removed. */
export function ticketLabelsOf(organisationId: string, ticketId: string): Promise<LabelEntry[]> {
	return getDb()
		.select(entryColumns)
		.from(ticketLabels)
		.innerJoin(labels, eq(labels.id, ticketLabels.labelId))
		.where(and(eq(ticketLabels.ticketId, ticketId), eq(labels.organisationId, organisationId)))
		.orderBy(asc(sql`lower(${labels.name})`), asc(labels.id));
}

export async function createLabel(
	actor: SessionUser,
	input: LabelInput
): Promise<Outcome<{ id: string }, LabelFailure>> {
	const parsed = labelInput.safeParse(input);
	if (!parsed.success) return failure('invalid_label');

	try {
		const [row] = await getDb()
			.insert(labels)
			.values({ ...parsed.data, organisationId: actor.organisationId })
			.returning({ id: labels.id });
		return success({ id: row.id });
	} catch (error) {
		if (uniqueConstraintName(error) === 'labels_org_name') return failure('duplicate_label_name');
		throw error;
	}
}

export async function updateLabel(
	actor: SessionUser,
	labelId: string,
	input: LabelInput
): Promise<Outcome<void, LabelEditFailure>> {
	const parsed = labelInput.safeParse(input);
	if (!parsed.success) return failure('invalid_label');

	try {
		const updated = await getDb()
			.update(labels)
			.set({ ...parsed.data, updatedAt: new Date() })
			.where(and(eq(labels.id, labelId), eq(labels.organisationId, actor.organisationId)))
			.returning({ id: labels.id });
		return updated.length === 0 ? failure('label_not_found') : success(undefined);
	} catch (error) {
		if (uniqueConstraintName(error) === 'labels_org_name') return failure('duplicate_label_name');
		throw error;
	}
}

/** Archive or bring back: the label stays on the tickets that carry it, it just stops being offered. */
export async function setLabelActive(
	actor: SessionUser,
	labelId: string,
	active: boolean
): Promise<Outcome<void, 'label_not_found'>> {
	const updated = await getDb()
		.update(labels)
		.set({ active, updatedAt: new Date() })
		.where(and(eq(labels.id, labelId), eq(labels.organisationId, actor.organisationId)))
		.returning({ id: labels.id });
	return updated.length === 0 ? failure('label_not_found') : success(undefined);
}

/** A label on a ticket cannot go: the foreign key is `restrict` and says so. Archive it instead. */
export async function deleteLabel(
	actor: SessionUser,
	labelId: string
): Promise<Outcome<void, LabelDeleteFailure>> {
	try {
		const deleted = await getDb()
			.delete(labels)
			.where(and(eq(labels.id, labelId), eq(labels.organisationId, actor.organisationId)))
			.returning({ id: labels.id });
		return deleted.length === 0 ? failure('label_not_found') : success(undefined);
	} catch (error) {
		if (constraintViolation(error)?.code === '23503') return failure('label_in_use');
		throw error;
	}
}

/**
 * Replaces the label set of a ticket with `labelIds`. The diff against what the
 * ticket has is the change: one `ticket.labels.changed` entry in the same
 * transaction, none when nothing changed. A label already on the ticket may stay
 * even when archived; an archived one cannot be added.
 */
export async function setTicketLabels(
	actor: SessionUser,
	ticketTag: string,
	labelIds: readonly string[]
): Promise<Outcome<void, SetTicketLabelsFailure>> {
	const wanted = [...new Set(labelIds)];

	return getDb().transaction(async (tx) => {
		const [ticket] = await tx
			.select({ id: tickets.id })
			.from(tickets)
			.where(
				and(eq(tickets.organisationId, actor.organisationId), eq(tickets.ticketTag, ticketTag))
			)
			.limit(1);
		if (!ticket) return failure('ticket_not_found');

		const current = await tx
			.select({ id: labels.id, name: labels.name })
			.from(ticketLabels)
			.innerJoin(labels, eq(labels.id, ticketLabels.labelId))
			.where(eq(ticketLabels.ticketId, ticket.id));
		const currentIds = new Set(current.map((label) => label.id));

		const addedIds = wanted.filter((id) => !currentIds.has(id));
		const removed = current.filter((label) => !wanted.includes(label.id));

		// Organisation scoped, so a label of another organisation is simply not found.
		const added =
			addedIds.length === 0
				? []
				: await tx
						.select({ id: labels.id, name: labels.name, active: labels.active })
						.from(labels)
						.where(
							and(inArray(labels.id, addedIds), eq(labels.organisationId, actor.organisationId))
						);
		if (added.length !== addedIds.length) return failure('label_not_found');
		if (added.some((label) => !label.active)) return failure('label_archived');

		if (added.length === 0 && removed.length === 0) return success(undefined);

		if (added.length > 0) {
			await tx
				.insert(ticketLabels)
				.values(added.map((label) => ({ ticketId: ticket.id, labelId: label.id })))
				// A second save racing this one may have added the same label first.
				.onConflictDoNothing();
		}
		if (removed.length > 0) {
			await tx.delete(ticketLabels).where(
				and(
					eq(ticketLabels.ticketId, ticket.id),
					inArray(
						ticketLabels.labelId,
						removed.map((label) => label.id)
					)
				)
			);
		}
		await tx.update(tickets).set({ updatedAt: new Date() }).where(eq(tickets.id, ticket.id));

		await recordActivity(tx, {
			organisationId: actor.organisationId,
			...actorColumns(actor),
			target: { ticketId: ticket.id },
			verb: 'ticket.labels.changed',
			payload: {
				added: added.map(({ id, name }) => ({ id, name })),
				removed: removed.map(({ id, name }) => ({ id, name }))
			}
		});

		return success(undefined);
	});
}
