import { and, asc, count, eq, isNull, sql } from 'drizzle-orm';
import {
	isSpaceColour,
	isSpaceIcon,
	type SpaceAudience,
	type SpaceColour,
	type SpaceIcon
} from '#lib/domain/knowledge.js';
import type { SessionUser } from '../auth/guards';
import { getDb, type Transaction } from '../db';
import { uniqueConstraintName } from '../db/errors';
import { actorColumns, recordActivity } from '../activity';
import { failure, success, type Outcome } from '../shared/outcome';
import { audienceScope, readsAsStaff, requireSpaceScope, requireSpacesManage } from './scope';
import { knowledgeSpaces, pages } from './schema';
import type { SpaceInput, SpaceUpdateInput } from './validation';

/**
 * The catalogue of spaces (ADR 0031): who reads each one, and what it looks
 * like. Pages live in them; the pages' own writes are #323.
 *
 * Every write requires `knowledge.spaces.manage` and throws without it
 * (`requireSpacesManage`). Reads go through the scope in `scope.ts`.
 */

export type SpaceEntry = {
	id: string;
	name: string;
	description: string | null;
	icon: SpaceIcon;
	colour: SpaceColour;
	audience: SpaceAudience;
	archivedAt: Date | null;
	/**
	 * The pages the viewer's reads can reach: not archived, and for a non-staff
	 * viewer published. This is the figure an audience change or an archive is
	 * confirmed against, drafts included for staff.
	 */
	pageCount: number;
	/** Every page the space holds, archived included — what decides whether it can be deleted. Staff only; equals `pageCount` otherwise. */
	totalPageCount: number;
};

export type SpaceCreateFailure = 'duplicate_name' | 'invalid_icon' | 'invalid_colour';
export type SpaceUpdateFailure = SpaceCreateFailure | 'not_found' | 'archived';
export type SpaceAudienceFailure = 'not_found' | 'archived' | 'count_changed';
export type SpacePreviewFailure = 'not_found' | 'archived';
export type SpaceArchiveFailure = 'not_found' | 'archived';
export type SpaceDeleteFailure = 'not_found' | 'has_pages';

/**
 * The spaces the viewer may read, with their page counts. An archived space is
 * listed only when asked for **and** the viewer is staff: for everyone else it
 * does not exist.
 */
export async function listSpaces(
	viewer: SessionUser,
	options: { includeArchived?: boolean } = {}
): Promise<SpaceEntry[]> {
	// Throws without `knowledge.view`; the scope below then only narrows.
	requireSpaceScope(viewer);
	const staff = readsAsStaff(viewer);
	const includeArchived = options.includeArchived === true && staff;

	const visibleCount = staff
		? sql<number>`count(${pages.id}) filter (where ${pages.archivedAt} is null)::int`
		: sql<number>`count(${pages.id}) filter (where ${pages.archivedAt} is null and ${pages.publishedAt} is not null)::int`;

	const rows = await getDb()
		.select({
			id: knowledgeSpaces.id,
			name: knowledgeSpaces.name,
			description: knowledgeSpaces.description,
			icon: knowledgeSpaces.icon,
			colour: knowledgeSpaces.colour,
			audience: knowledgeSpaces.audience,
			archivedAt: knowledgeSpaces.archivedAt,
			pageCount: visibleCount,
			totalPageCount: sql<number>`count(${pages.id})::int`
		})
		.from(knowledgeSpaces)
		.leftJoin(pages, eq(pages.spaceId, knowledgeSpaces.id))
		.where(
			and(audienceScope(viewer), includeArchived ? undefined : isNull(knowledgeSpaces.archivedAt))
		)
		.groupBy(knowledgeSpaces.id)
		.orderBy(asc(sql`lower(${knowledgeSpaces.name})`), asc(knowledgeSpaces.id));

	return rows.map((row) => ({
		...row,
		icon: row.icon as SpaceIcon,
		colour: row.colour as SpaceColour,
		totalPageCount: staff ? row.totalPageCount : row.pageCount
	}));
}

/** The set a stored key is held to: the domain is where text becomes a closed set. */
function keysRefused(input: { icon: string; colour: string }): SpaceCreateFailure | null {
	if (!isSpaceIcon(input.icon)) return 'invalid_icon';
	if (!isSpaceColour(input.colour)) return 'invalid_colour';
	return null;
}

function isDuplicateName(error: unknown): boolean {
	return uniqueConstraintName(error) === 'knowledge_spaces_org_name';
}

export async function createSpace(
	actor: SessionUser,
	input: SpaceInput
): Promise<Outcome<{ id: string }, SpaceCreateFailure>> {
	requireSpacesManage(actor);
	const refused = keysRefused(input);
	if (refused) return failure(refused);

	try {
		return await getDb().transaction(async (tx) => {
			const [row] = await tx
				.insert(knowledgeSpaces)
				.values({ ...input, organisationId: actor.organisationId })
				.returning({ id: knowledgeSpaces.id });

			await recordActivity(tx, {
				organisationId: actor.organisationId,
				...actorColumns(actor),
				target: { spaceId: row.id },
				verb: 'space.created',
				payload: { name: input.name, audience: input.audience }
			});
			return success(row);
		});
	} catch (error) {
		if (isDuplicateName(error)) return failure('duplicate_name');
		throw error;
	}
}

/** Name, description, icon and colour. The audience has its own, confirmed, path. */
export async function updateSpace(
	actor: SessionUser,
	id: string,
	input: SpaceUpdateInput
): Promise<Outcome<void, SpaceUpdateFailure>> {
	requireSpacesManage(actor);
	const refused = keysRefused(input);
	if (refused) return failure(refused);

	try {
		return await getDb().transaction(async (tx) => {
			const current = await lockSpace(tx, actor.organisationId, id);
			if (!current) return failure('not_found');
			if (current.archivedAt) return failure('archived');

			await tx
				.update(knowledgeSpaces)
				.set({ ...input, updatedAt: new Date() })
				.where(eq(knowledgeSpaces.id, id));
			return success(undefined);
		});
	} catch (error) {
		if (isDuplicateName(error)) return failure('duplicate_name');
		throw error;
	}
}

/** The row, locked for the length of the transaction: counts taken after it cannot move. */
export async function lockSpace(tx: Transaction, organisationId: string, id: string) {
	const [row] = await tx
		.select()
		.from(knowledgeSpaces)
		.where(and(eq(knowledgeSpaces.id, id), eq(knowledgeSpaces.organisationId, organisationId)))
		.for('update');
	return row;
}

/**
 * Pages whose visibility an audience change or an archive touches: not
 * archived, drafts included.
 */
async function countAffectedPages(tx: Transaction, spaceId: string): Promise<number> {
	const [row] = await tx
		.select({ count: count() })
		.from(pages)
		.where(and(eq(pages.spaceId, spaceId), isNull(pages.archivedAt)));
	return row?.count ?? 0;
}

/**
 * The exact figure the confirmation shows. A read, not a promise: the count can
 * move before the admin confirms, which is why `changeSpaceAudience` takes it
 * back and refuses `count_changed`.
 */
export async function previewAudienceChange(
	actor: SessionUser,
	id: string,
	audience: SpaceAudience
): Promise<Outcome<{ pageCount: number }, SpacePreviewFailure>> {
	requireSpacesManage(actor);
	return getDb().transaction(async (tx) => {
		const current = await lockSpace(tx, actor.organisationId, id);
		if (!current) return failure('not_found');
		if (current.archivedAt) return failure('archived');
		// Nothing changes visibility when the audience is already the one asked for.
		if (current.audience === audience) return success({ pageCount: 0 });
		return success({ pageCount: await countAffectedPages(tx, id) });
	});
}

/**
 * Publishing internal content to every employee, or hiding it from them, is the
 * decision ADR 0031 leaves to a confirmation: `confirmedCount` is what the admin
 * saw, and a different number now means the question changed under them.
 *
 * The space row is locked, so a page created in the same instant (it locks the
 * space too, #323) is either counted or waits.
 */
export async function changeSpaceAudience(
	actor: SessionUser,
	id: string,
	audience: SpaceAudience,
	options: { confirmedCount: number }
): Promise<Outcome<void, SpaceAudienceFailure>> {
	requireSpacesManage(actor);
	return getDb().transaction(async (tx) => {
		const current = await lockSpace(tx, actor.organisationId, id);
		if (!current) return failure('not_found');
		if (current.archivedAt) return failure('archived');
		if (current.audience === audience) return success(undefined);

		const pageCount = await countAffectedPages(tx, id);
		if (pageCount !== options.confirmedCount) return failure('count_changed');

		await tx
			.update(knowledgeSpaces)
			.set({ audience, updatedAt: new Date() })
			.where(eq(knowledgeSpaces.id, id));
		await recordActivity(tx, {
			organisationId: actor.organisationId,
			...actorColumns(actor),
			target: { spaceId: id },
			verb: 'space.audience.changed',
			payload: { from: current.audience, to: audience, pageCount }
		});
		return success(undefined);
	});
}

/**
 * Archives the space and every page in it in one transaction. Pages already
 * archived keep their own `archived_at`: the count is of the ones that changed.
 */
export async function archiveSpace(
	actor: SessionUser,
	id: string
): Promise<Outcome<{ pageCount: number }, SpaceArchiveFailure>> {
	requireSpacesManage(actor);
	return getDb().transaction(async (tx) => {
		const current = await lockSpace(tx, actor.organisationId, id);
		if (!current) return failure('not_found');
		if (current.archivedAt) return failure('archived');

		const now = new Date();
		const archived = await tx
			.update(pages)
			.set({ archivedAt: now, updatedAt: now })
			.where(and(eq(pages.spaceId, id), isNull(pages.archivedAt)))
			.returning({ id: pages.id });
		await tx
			.update(knowledgeSpaces)
			.set({ archivedAt: now, updatedAt: now })
			.where(eq(knowledgeSpaces.id, id));
		await recordActivity(tx, {
			organisationId: actor.organisationId,
			...actorColumns(actor),
			target: { spaceId: id },
			verb: 'space.archived',
			payload: { pageCount: archived.length }
		});
		return success({ pageCount: archived.length });
	});
}

/**
 * Only a space that never held a page — or whose pages are gone — may go.
 * Archived pages count: they still carry history and revisions.
 *
 * The activity of a deleted space goes with it (the foreign key cascades): the
 * space had no page, so what it recorded is its own creation.
 */
export async function deleteSpace(
	actor: SessionUser,
	id: string
): Promise<Outcome<void, SpaceDeleteFailure>> {
	requireSpacesManage(actor);
	return getDb().transaction(async (tx) => {
		const current = await lockSpace(tx, actor.organisationId, id);
		if (!current) return failure('not_found');

		const [row] = await tx.select({ count: count() }).from(pages).where(eq(pages.spaceId, id));
		if ((row?.count ?? 0) > 0) return failure('has_pages');

		await tx.delete(knowledgeSpaces).where(eq(knowledgeSpaces.id, id));
		return success(undefined);
	});
}
