import { and, asc, desc, eq, ilike, inArray, isNotNull, isNull, or, sql } from 'drizzle-orm';
import {
	PAGE_BODY_MAX_LENGTH,
	PAGE_PICK_LIMIT,
	type SpaceAudience,
	type SpaceColour,
	type SpaceIcon
} from '#lib/domain/knowledge.js';
import { actorColumns, recordActivity } from '../activity';
import type { SessionUser } from '../auth/guards';
import { getDb, type Transaction } from '../db';
import { organisations, people } from '../directory/schema';
import { failure, success, type Outcome } from '../shared/outcome';
import { placeBetween, spread } from '../shared/position';
import { authorColumns, withAuthorNames } from './authors';
import { readablePages, requirePagesManage } from './scope';
import { knowledgeSpaces, pageRevisions, pages } from './schema';
import { lockSpace } from './spaces';
import type { PageCreateInput } from './validation';

/**
 * The page tree and its lifecycle (ADR 0031 §3–§7): browse, create, reorder,
 * move, publish, archive. Writing the body, and its revisions, live in
 * `revisions.ts` (#324).
 *
 * Reads go through the scope in `scope.ts`, in the query. Every write requires
 * `knowledge.manage` and throws without it (`requirePagesManage`).
 *
 * **Lock order, in every write: the organisation row, then the space rows
 * (by id).** The organisation lock serialises every structural write, which is
 * what makes two opposite moves (A under B, B under A) answer one `cycle` (the
 * ADR 0027 §7 pattern); the space locks are the ones `changeSpaceAudience`
 * takes, so a count an admin confirmed cannot move under them.
 */

export type PageStatus = 'draft' | 'published' | 'archived';

export type TreeEntry = {
	id: string;
	tag: string;
	title: string;
	parentId: string | null;
	position: number;
	status: PageStatus;
};

export type PageView = {
	id: string;
	tag: string;
	title: string;
	body: string;
	revision: number;
	/** Who saved the revision the page shows, and when; `null` once that person is deleted. */
	revisionAuthorName: string | null;
	revisedAt: Date;
	parentId: string | null;
	status: PageStatus;
	publishedAt: Date | null;
	archivedAt: Date | null;
	createdAt: Date;
	updatedAt: Date;
	space: {
		id: string;
		name: string;
		description: string | null;
		icon: SpaceIcon;
		colour: SpaceColour;
		audience: SpaceAudience;
	};
	/** Ancestors from the root down to the parent; the page itself is not in it. */
	path: { id: string; tag: string; title: string }[];
};

export type PageCreateFailure =
	'space_not_found' | 'space_archived' | 'parent_not_found' | 'parent_archived' | 'body_too_long';
export type PageReorderFailure = 'not_found' | 'archived' | 'not_siblings';
export type PageMoveFailure =
	| 'not_found'
	| 'archived'
	| 'space_not_found'
	| 'space_archived'
	| 'parent_not_found'
	| 'parent_archived'
	| 'cycle'
	| 'parent_unpublished'
	| 'not_siblings';
export type PageMoveConfirmationFailure =
	PageMoveFailure | 'confirmation_required' | 'count_changed';
export type PagePublishFailure = 'not_found' | 'archived' | 'parent_unpublished';
export type PageArchiveFailure = 'not_found' | 'archived';
export type PageUnarchiveFailure =
	'not_found' | 'not_archived' | 'space_archived' | 'parent_archived';

/** Where among its new siblings a moved or reordered page lands. */
export type Placement = { before: string } | { after: string };

export type MovePreview = {
	/** The page and its non-archived descendants: what the move carries along and what is confirmed. */
	subtreeCount: number;
	audienceChanges: boolean;
	fromAudience: SpaceAudience;
	toAudience: SpaceAudience;
};

function statusOf(row: { publishedAt: Date | null; archivedAt: Date | null }): PageStatus {
	if (row.archivedAt) return 'archived';
	return row.publishedAt ? 'published' : 'draft';
}

/** `DOC-0042`, in any case, is the canonical link; the stored form is upper case. */
function normaliseTag(tag: string): string {
	return tag.trim().toUpperCase();
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

/**
 * Every page of the space the viewer may read, ordered by `(parent_id,
 * position)`. `includeArchived` is honoured for staff only. A space the viewer
 * cannot read yields an empty tree, the same as a missing one.
 */
export async function listSpaceTree(
	viewer: SessionUser,
	spaceId: string,
	options: { includeArchived?: boolean } = {}
): Promise<TreeEntry[]> {
	const rows = await getDb()
		.select({
			id: pages.id,
			tag: pages.pageTag,
			title: pages.title,
			parentId: pages.parentId,
			position: pages.position,
			publishedAt: pages.publishedAt,
			archivedAt: pages.archivedAt
		})
		.from(pages)
		.where(and(eq(pages.spaceId, spaceId), readablePages(viewer, options)))
		.orderBy(sql`${pages.parentId} asc nulls first`, asc(pages.position), asc(pages.id));

	return rows.map((row) => ({
		id: row.id,
		tag: row.tag,
		title: row.title,
		parentId: row.parentId,
		position: Number(row.position),
		status: statusOf(row)
	}));
}

/**
 * A page by its `DOC-####` tag, with its space and the ancestors above it.
 * Unreadable is indistinguishable from missing. Staff also read archived pages
 * (that is how they get to unarchive one); everybody else does not.
 */
export async function getPageByTag(
	viewer: SessionUser,
	tag: string
): Promise<Outcome<PageView, 'not_found'>> {
	const scope = readablePages(viewer, { includeArchived: true });
	const [row] = await getDb()
		.select({
			page: pages,
			space: {
				id: knowledgeSpaces.id,
				name: knowledgeSpaces.name,
				description: knowledgeSpaces.description,
				icon: knowledgeSpaces.icon,
				colour: knowledgeSpaces.colour,
				audience: knowledgeSpaces.audience
			}
		})
		.from(pages)
		.innerJoin(knowledgeSpaces, eq(knowledgeSpaces.id, pages.spaceId))
		.where(and(eq(pages.pageTag, normaliseTag(tag)), scope))
		.limit(1);
	if (!row) return failure('not_found');

	const ancestorIds = await ancestorsOf(getDb(), row.page.id);
	const ancestors =
		ancestorIds.length === 0
			? []
			: await getDb()
					.select({ id: pages.id, tag: pages.pageTag, title: pages.title })
					.from(pages)
					.where(and(inArray(pages.id, ancestorIds), scope));
	const byId = new Map(ancestors.map((ancestor) => [ancestor.id, ancestor]));
	// `ancestorsOf` returns them parent first; the breadcrumb reads root first.
	const path = ancestorIds
		.map((id) => byId.get(id))
		.filter((ancestor): ancestor is NonNullable<typeof ancestor> => ancestor !== undefined)
		.reverse();

	const { page } = row;
	const [latestRow] = await getDb()
		.select({
			personName: people.fullName,
			serviceAccountId: pageRevisions.authorServiceAccountId,
			createdAt: pageRevisions.createdAt
		})
		.from(pageRevisions)
		.leftJoin(people, eq(people.id, pageRevisions.authorPersonId))
		.where(and(eq(pageRevisions.pageId, page.id), eq(pageRevisions.number, page.revision)));
	const [latest] = await withAuthorNames(viewer.organisationId, latestRow ? [latestRow] : []);
	return success({
		id: page.id,
		tag: page.pageTag,
		title: page.title,
		body: page.body,
		revision: page.revision,
		revisionAuthorName: latest?.authorName ?? null,
		revisedAt: latest?.createdAt ?? page.updatedAt,
		parentId: page.parentId,
		status: statusOf(page),
		publishedAt: page.publishedAt,
		archivedAt: page.archivedAt,
		createdAt: page.createdAt,
		updatedAt: page.updatedAt,
		space: {
			...row.space,
			icon: row.space.icon as SpaceIcon,
			colour: row.space.colour as SpaceColour
		},
		path
	});
}

/** A page the editor's picker offers to link to (#324). */
export type PagePick = { tag: string; title: string; spaceName: string; status: PageStatus };

function likePattern(query: string): string {
	return `%${query.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;
}

/**
 * The pages the viewer could link to: what they can read (published pages, and
 * drafts for staff; never archived), matching `query` in the title or the code,
 * most recently changed first. An empty query offers the latest pages.
 */
export async function pickPages(
	viewer: SessionUser,
	query: string,
	options: { citableIn?: 'public' | 'internal' } = {}
): Promise<PagePick[]> {
	const text = query.trim();
	const rows = await getDb()
		.select({
			tag: pages.pageTag,
			title: pages.title,
			spaceName: knowledgeSpaces.name,
			publishedAt: pages.publishedAt,
			archivedAt: pages.archivedAt
		})
		.from(pages)
		.innerJoin(knowledgeSpaces, eq(knowledgeSpaces.id, pages.spaceId))
		.where(
			and(
				readablePages(viewer),
				// What a ticket reply may cite (#327): published pages only, and for a
				// public reply those of a `portal` space, the ones its readers can open.
				options.citableIn ? isNotNull(pages.publishedAt) : undefined,
				options.citableIn === 'public' ? eq(knowledgeSpaces.audience, 'portal') : undefined,
				text === ''
					? undefined
					: or(ilike(pages.title, likePattern(text)), ilike(pages.pageTag, likePattern(text)))
			)
		)
		.orderBy(desc(pages.updatedAt), asc(pages.pageTag))
		.limit(PAGE_PICK_LIMIT);
	return rows.map((row) => ({
		tag: row.tag,
		title: row.title,
		spaceName: row.spaceName,
		status: statusOf(row)
	}));
}

// ---------------------------------------------------------------------------
// Tree helpers
// ---------------------------------------------------------------------------

type Reader = Pick<Transaction, 'execute'>;

/** The page's ancestors, parent first. */
async function ancestorsOf(executor: Reader, pageId: string): Promise<string[]> {
	const rows = await executor.execute<{ id: string }>(sql`
		WITH RECURSIVE up AS (
			SELECT parent_id AS id, 1 AS depth FROM pages WHERE id = ${pageId} AND parent_id IS NOT NULL
			UNION ALL
			SELECT p.parent_id, up.depth + 1 FROM pages p JOIN up ON p.id = up.id WHERE p.parent_id IS NOT NULL
		)
		SELECT id FROM up ORDER BY depth
	`);
	return rows.map((row) => row.id);
}

/** The page and every page below it, archived included. */
async function subtreeIds(tx: Reader, pageId: string): Promise<string[]> {
	const rows = await tx.execute<{ id: string }>(sql`
		WITH RECURSIVE below AS (
			SELECT id FROM pages WHERE id = ${pageId}
			UNION ALL
			SELECT p.id FROM pages p JOIN below ON p.parent_id = below.id
		)
		SELECT id FROM below
	`);
	return rows.map((row) => row.id);
}

/** The organisation row, locked: it serialises every structural write on the tree. */
async function lockOrganisation(tx: Transaction, organisationId: string): Promise<void> {
	await tx
		.select({ id: organisations.id })
		.from(organisations)
		.where(eq(organisations.id, organisationId))
		.for('update');
}

/** Space rows, locked in id order so two writers never wait on each other. */
async function lockSpaces(tx: Transaction, organisationId: string, ids: string[]) {
	const locked = new Map<string, Awaited<ReturnType<typeof lockSpace>>>();
	for (const id of [...new Set(ids)].sort()) {
		locked.set(id, await lockSpace(tx, organisationId, id));
	}
	return locked;
}

async function loadPage(tx: Transaction, organisationId: string, id: string) {
	const [row] = await tx
		.select()
		.from(pages)
		.where(and(eq(pages.id, id), eq(pages.organisationId, organisationId)))
		.limit(1);
	return row;
}

type Sibling = { id: string; position: number };

async function siblingsOf(
	tx: Transaction,
	spaceId: string,
	parentId: string | null,
	excludeId?: string
): Promise<Sibling[]> {
	const rows = await tx
		.select({ id: pages.id, position: pages.position })
		.from(pages)
		.where(
			and(
				eq(pages.spaceId, spaceId),
				parentId ? eq(pages.parentId, parentId) : isNull(pages.parentId)
			)
		)
		.orderBy(asc(pages.position), asc(pages.id));
	return rows
		.filter((row) => row.id !== excludeId)
		.map((row) => ({ id: row.id, position: Number(row.position) }));
}

/**
 * The position that puts a page next to one of `siblings` (or last), renumbering
 * the siblings first when the gap has collapsed (ADR 0021). `siblings` must not
 * contain the page being placed. `null` when the neighbour is not among them.
 */
async function positionAmong(
	tx: Transaction,
	siblings: Sibling[],
	placement: Placement | undefined
): Promise<number | null> {
	let lowerIndex: number;
	let upperIndex: number;
	if (!placement) {
		lowerIndex = siblings.length - 1;
		upperIndex = siblings.length;
	} else {
		const anchorId = 'before' in placement ? placement.before : placement.after;
		const anchor = siblings.findIndex((sibling) => sibling.id === anchorId);
		if (anchor === -1) return null;
		lowerIndex = 'before' in placement ? anchor - 1 : anchor;
		upperIndex = lowerIndex + 1;
	}

	const bracket = () => ({
		lower: lowerIndex >= 0 ? siblings[lowerIndex].position : null,
		upper: upperIndex < siblings.length ? siblings[upperIndex].position : null
	});

	let placed = placeBetween(bracket().lower, bracket().upper);
	if ('renumber' in placed) {
		for (const [index, position] of spread(siblings.length).entries()) {
			siblings[index].position = position;
			await tx
				.update(pages)
				.set({ position: String(position) })
				.where(eq(pages.id, siblings[index].id));
		}
		placed = placeBetween(bracket().lower, bracket().upper);
	}
	if (!('position' in placed)) throw new Error('A renumbered list always has room.');
	return placed.position;
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

/**
 * A draft at the end of its siblings, with revision 1 inserted in the same
 * transaction (`pages.revision = max(page_revisions.number)`, ADR 0031).
 */
export async function createPage(
	actor: SessionUser,
	input: PageCreateInput
): Promise<Outcome<{ id: string; tag: string }, PageCreateFailure>> {
	requirePagesManage(actor);
	const body = input.body ?? '';
	if (body.length > PAGE_BODY_MAX_LENGTH) return failure('body_too_long');
	const author = authorColumns(actor);
	return getDb().transaction(async (tx) => {
		await lockOrganisation(tx, actor.organisationId);
		const space = (await lockSpaces(tx, actor.organisationId, [input.spaceId])).get(input.spaceId);
		if (!space) return failure('space_not_found');
		if (space.archivedAt) return failure('space_archived');

		if (input.parentId) {
			const parent = await loadPage(tx, actor.organisationId, input.parentId);
			if (!parent || parent.spaceId !== input.spaceId) return failure('parent_not_found');
			if (parent.archivedAt) return failure('parent_archived');
		}

		const siblings = await siblingsOf(tx, input.spaceId, input.parentId);
		const position = (await positionAmong(tx, siblings, undefined)) as number;

		const [created] = await tx
			.insert(pages)
			.values({
				organisationId: actor.organisationId,
				spaceId: input.spaceId,
				parentId: input.parentId,
				title: input.title,
				body,
				revision: 1,
				position: String(position),
				createdByPersonId: author.personId,
				createdByServiceAccountId: author.serviceAccountId
			})
			.returning({ id: pages.id, tag: pages.pageTag });
		await tx.insert(pageRevisions).values({
			organisationId: actor.organisationId,
			pageId: created.id,
			number: 1,
			title: input.title,
			body,
			authorPersonId: author.personId,
			authorServiceAccountId: author.serviceAccountId
		});
		await recordActivity(tx, {
			organisationId: actor.organisationId,
			...actorColumns(actor),
			target: { pageId: created.id },
			verb: 'page.created',
			payload: { title: input.title }
		});
		return success(created);
	});
}

/** Puts the page before or after one of its siblings. */
export async function reorderPage(
	actor: SessionUser,
	pageId: string,
	placement: Placement
): Promise<Outcome<void, PageReorderFailure>> {
	requirePagesManage(actor);
	return getDb().transaction(async (tx) => {
		await lockOrganisation(tx, actor.organisationId);
		const page = await loadPage(tx, actor.organisationId, pageId);
		if (!page) return failure('not_found');
		if (page.archivedAt) return failure('archived');

		const siblings = await siblingsOf(tx, page.spaceId, page.parentId, page.id);
		const position = await positionAmong(tx, siblings, placement);
		if (position === null) return failure('not_siblings');

		await tx
			.update(pages)
			.set({ position: String(position), updatedAt: new Date() })
			.where(eq(pages.id, page.id));
		return success(undefined);
	});
}

type MoveTarget = { spaceId: string; parentId: string | null };

/**
 * Everything a move is checked against, shared by the preview and the move so
 * the two cannot disagree. Runs inside the caller's transaction; the move holds
 * the locks, the preview does not (it is a read, and the move re-checks).
 */
async function resolveMove(
	tx: Transaction,
	actor: SessionUser,
	pageId: string,
	target: MoveTarget
) {
	const page = await loadPage(tx, actor.organisationId, pageId);
	if (!page) return failure('not_found' as const);
	if (page.archivedAt) return failure('archived' as const);

	const [space, source] = await Promise.all([
		readSpace(tx, actor.organisationId, target.spaceId),
		readSpace(tx, actor.organisationId, page.spaceId)
	]);
	if (!space) return failure('space_not_found' as const);
	if (space.archivedAt) return failure('space_archived' as const);

	// The page itself is in its own subtree, so this also refuses "under itself".
	const below = await subtreeIds(tx, page.id);
	if (target.parentId) {
		const parent = await loadPage(tx, actor.organisationId, target.parentId);
		if (!parent || parent.spaceId !== target.spaceId) return failure('parent_not_found' as const);
		if (parent.archivedAt) return failure('parent_archived' as const);
		if (below.includes(parent.id)) return failure('cycle' as const);
		if (page.publishedAt && !parent.publishedAt) return failure('parent_unpublished' as const);
	}

	const live = await tx
		.select({ id: pages.id })
		.from(pages)
		.where(and(inArray(pages.id, below), isNull(pages.archivedAt)));
	return success({
		page,
		space,
		source: source as NonNullable<typeof source>,
		subtree: below,
		subtreeCount: live.length
	});
}

/** A plain read of a space row, scoped to the organisation. */
async function readSpace(tx: Transaction, organisationId: string, id: string) {
	const [row] = await tx
		.select()
		.from(knowledgeSpaces)
		.where(and(eq(knowledgeSpaces.id, id), eq(knowledgeSpaces.organisationId, organisationId)));
	return row;
}

/** What a move would carry along and whether it changes who can read it. A read: the move re-checks under its locks. */
export async function previewMove(
	actor: SessionUser,
	pageId: string,
	target: MoveTarget
): Promise<Outcome<MovePreview, PageMoveFailure>> {
	requirePagesManage(actor);
	return getDb().transaction(async (tx) => {
		const resolved = await resolveMove(tx, actor, pageId, target);
		if (!resolved.ok) return resolved;
		const { space, source, subtreeCount } = resolved.value;
		return success({
			subtreeCount,
			audienceChanges: space.audience !== source.audience,
			fromAudience: source.audience,
			toAudience: space.audience
		});
	});
}

/**
 * Moves a page with its whole subtree, across spaces too. No revision is
 * written: the content did not change, only where it sits (`page.moved`).
 *
 * When the move changes the audience, `confirmedCount` is the subtree size the
 * user saw, and a different number now answers `count_changed`.
 */
export async function movePage(
	actor: SessionUser,
	pageId: string,
	target: MoveTarget & { position?: Placement },
	options: { confirmedCount?: number } = {}
): Promise<Outcome<void, PageMoveConfirmationFailure>> {
	requirePagesManage(actor);
	return getDb().transaction(async (tx) => {
		await lockOrganisation(tx, actor.organisationId);
		const current = await loadPage(tx, actor.organisationId, pageId);
		if (!current) return failure('not_found');
		await lockSpaces(tx, actor.organisationId, [current.spaceId, target.spaceId]);

		const resolved = await resolveMove(tx, actor, pageId, target);
		if (!resolved.ok) return resolved;
		const { page, space, source, subtree, subtreeCount } = resolved.value;

		if (space.audience !== source.audience) {
			if (options.confirmedCount === undefined) return failure('confirmation_required');
			if (options.confirmedCount !== subtreeCount) return failure('count_changed');
		}

		const siblings = await siblingsOf(tx, target.spaceId, target.parentId, page.id);
		const position = await positionAmong(tx, siblings, target.position);
		if (position === null) return failure('not_siblings');

		const relocated = page.spaceId !== target.spaceId || page.parentId !== target.parentId;
		const now = new Date();
		await tx
			.update(pages)
			.set({
				spaceId: target.spaceId,
				parentId: target.parentId,
				position: String(position),
				updatedAt: now
			})
			.where(eq(pages.id, page.id));
		if (page.spaceId !== target.spaceId) {
			await tx
				.update(pages)
				.set({ spaceId: target.spaceId, updatedAt: now })
				.where(
					inArray(
						pages.id,
						subtree.filter((id) => id !== page.id)
					)
				);
		}

		if (relocated) {
			const [fromParent, toParent] = await Promise.all([
				page.parentId ? loadPage(tx, actor.organisationId, page.parentId) : undefined,
				target.parentId ? loadPage(tx, actor.organisationId, target.parentId) : undefined
			]);
			await recordActivity(tx, {
				organisationId: actor.organisationId,
				...actorColumns(actor),
				target: { pageId: page.id },
				verb: 'page.moved',
				payload: {
					fromSpace: source.name,
					toSpace: space.name,
					fromParentTag: fromParent?.pageTag ?? null,
					toParentTag: toParent?.pageTag ?? null
				}
			});
		}
		return success(undefined);
	});
}

/** Draft to published. Already published is a no-op. */
export async function publishPage(
	actor: SessionUser,
	pageId: string
): Promise<Outcome<void, PagePublishFailure>> {
	requirePagesManage(actor);
	return getDb().transaction(async (tx) => {
		await lockOrganisation(tx, actor.organisationId);
		const page = await loadPage(tx, actor.organisationId, pageId);
		if (!page) return failure('not_found');
		if (page.archivedAt) return failure('archived');
		if (page.publishedAt) return success(undefined);

		if (page.parentId) {
			const parent = await loadPage(tx, actor.organisationId, page.parentId);
			if (!parent?.publishedAt) return failure('parent_unpublished');
		}

		const now = new Date();
		await tx.update(pages).set({ publishedAt: now, updatedAt: now }).where(eq(pages.id, page.id));
		await recordActivity(tx, {
			organisationId: actor.organisationId,
			...actorColumns(actor),
			target: { pageId: page.id },
			verb: 'page.published',
			payload: {}
		});
		return success(undefined);
	});
}

/** The page and its subtree, in one transaction. Pages already archived keep their own date. */
export async function archivePage(
	actor: SessionUser,
	pageId: string
): Promise<Outcome<{ subtreeCount: number }, PageArchiveFailure>> {
	requirePagesManage(actor);
	return getDb().transaction(async (tx) => {
		await lockOrganisation(tx, actor.organisationId);
		const page = await loadPage(tx, actor.organisationId, pageId);
		if (!page) return failure('not_found');
		if (page.archivedAt) return failure('archived');

		const now = new Date();
		const archived = await tx
			.update(pages)
			.set({ archivedAt: now, updatedAt: now })
			.where(and(inArray(pages.id, await subtreeIds(tx, page.id)), isNull(pages.archivedAt)))
			.returning({ id: pages.id });
		await recordActivity(tx, {
			organisationId: actor.organisationId,
			...actorColumns(actor),
			target: { pageId: page.id },
			verb: 'page.archived',
			payload: { subtreeCount: archived.length }
		});
		return success({ subtreeCount: archived.length });
	});
}

/**
 * Restores the page and the pages that were archived **with it** (the same
 * instant): a branch archived on its own earlier stays archived. Refuses when
 * the parent is still archived, or the whole space is.
 */
export async function unarchivePage(
	actor: SessionUser,
	pageId: string
): Promise<Outcome<{ subtreeCount: number }, PageUnarchiveFailure>> {
	requirePagesManage(actor);
	return getDb().transaction(async (tx) => {
		await lockOrganisation(tx, actor.organisationId);
		const page = await loadPage(tx, actor.organisationId, pageId);
		if (!page) return failure('not_found');
		if (!page.archivedAt) return failure('not_archived');

		const space = await readSpace(tx, actor.organisationId, page.spaceId);
		if (space?.archivedAt) return failure('space_archived');
		if (page.parentId) {
			const parent = await loadPage(tx, actor.organisationId, page.parentId);
			if (parent?.archivedAt) return failure('parent_archived');
		}

		const restored = await tx
			.update(pages)
			.set({ archivedAt: null, updatedAt: new Date() })
			.where(
				and(inArray(pages.id, await subtreeIds(tx, page.id)), eq(pages.archivedAt, page.archivedAt))
			)
			.returning({ id: pages.id });
		await recordActivity(tx, {
			organisationId: actor.organisationId,
			...actorColumns(actor),
			target: { pageId: page.id },
			verb: 'page.unarchived',
			payload: { subtreeCount: restored.length }
		});
		return success({ subtreeCount: restored.length });
	});
}
