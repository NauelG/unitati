import { and, desc, eq } from 'drizzle-orm';
import { PAGE_BODY_MAX_LENGTH } from '#lib/domain/knowledge.js';
import { actorColumns, recordActivity } from '../activity';
import type { SessionUser } from '../auth/guards';
import { getDb, type Transaction } from '../db';
import { people } from '../directory/schema';
import { failure, success, type Outcome } from '../shared/outcome';
import { readablePages, requirePagesManage } from './scope';
import { pageRevisions, pages } from './schema';

/**
 * Writing a page (ADR 0031 §6, #324): every save appends a revision, guarded
 * against concurrent edits by the revision the editor started from.
 *
 * **The page row is the lock.** A save or a restore takes it `FOR UPDATE`,
 * compares `pages.revision` with the caller's `baseRevision`, and only then
 * writes. Two saves from the same base serialise on that row: the first appends
 * `base + 1`, the second finds the page moved on and answers `stale_revision`
 * having written nothing, so the user keeps their text and decides. No
 * organisation lock: a save changes content, not the tree.
 *
 * `pages.revision = max(page_revisions.number)` holds at every commit: the
 * revision and the page row are written in the same transaction.
 */

/** Who saved the version the editor did not start from, so the screen can say so. */
export type StaleRevision = {
	kind: 'stale_revision';
	revision: number;
	authorName: string | null;
	savedAt: Date;
};

export type PageSaveFailure = 'not_found' | 'archived' | 'body_too_long' | StaleRevision;
export type RevisionRestoreFailure =
	'not_found' | 'archived' | 'revision_not_found' | StaleRevision;

/** `changed: false` is the no-op: the content was already what was asked for, so no revision. */
export type SaveResult = { revision: number; changed: boolean };

export type PageSaveInput = { title: string; body: string; baseRevision: number };

export type RevisionEntry = {
	number: number;
	title: string;
	authorName: string | null;
	createdAt: Date;
};

export type RevisionView = RevisionEntry & { body: string };

/** The page row, locked for the rest of the transaction. */
async function lockPage(tx: Transaction, organisationId: string, pageId: string) {
	const [row] = await tx
		.select()
		.from(pages)
		.where(and(eq(pages.id, pageId), eq(pages.organisationId, organisationId)))
		.for('update');
	return row;
}

/** One revision with its author's name, or `undefined`. */
async function readRevision(executor: Pick<Transaction, 'select'>, pageId: string, number: number) {
	const [row] = await executor
		.select({
			number: pageRevisions.number,
			title: pageRevisions.title,
			body: pageRevisions.body,
			authorName: people.fullName,
			createdAt: pageRevisions.createdAt
		})
		.from(pageRevisions)
		.leftJoin(people, eq(people.id, pageRevisions.authorPersonId))
		.where(and(eq(pageRevisions.pageId, pageId), eq(pageRevisions.number, number)));
	return row;
}

async function staleRevision(
	tx: Transaction,
	page: { id: string; revision: number }
): Promise<StaleRevision> {
	const current = await readRevision(tx, page.id, page.revision);
	return {
		kind: 'stale_revision',
		revision: page.revision,
		authorName: current?.authorName ?? null,
		savedAt: current?.createdAt ?? new Date()
	};
}

/**
 * Appends `page.revision + 1` with this content and makes it the page's. The
 * caller holds the page lock and has checked the base revision.
 */
async function appendRevision(
	tx: Transaction,
	actor: SessionUser,
	page: { id: string; revision: number },
	content: { title: string; body: string }
): Promise<number> {
	const next = page.revision + 1;
	const now = new Date();
	await tx.insert(pageRevisions).values({
		organisationId: actor.organisationId,
		pageId: page.id,
		number: next,
		title: content.title,
		body: content.body,
		authorPersonId: actor.personId,
		createdAt: now
	});
	await tx
		.update(pages)
		.set({ title: content.title, body: content.body, revision: next, updatedAt: now })
		.where(eq(pages.id, page.id));
	return next;
}

/**
 * Saves the title and body as a new revision. A published page stays published,
 * so the change is public at once; a draft stays a draft. No activity row: the
 * revision is the record.
 *
 * Content identical to the current revision is a no-op, whatever the base: the
 * user's text is already the page's, so there is nothing to lose (a double
 * submit is the common case).
 */
export async function savePage(
	actor: SessionUser,
	pageId: string,
	input: PageSaveInput
): Promise<Outcome<SaveResult, PageSaveFailure>> {
	requirePagesManage(actor);
	if (input.body.length > PAGE_BODY_MAX_LENGTH) return failure('body_too_long');

	return getDb().transaction(async (tx) => {
		const page = await lockPage(tx, actor.organisationId, pageId);
		if (!page) return failure('not_found');
		if (page.archivedAt) return failure('archived');

		if (page.title === input.title && page.body === input.body) {
			return success({ revision: page.revision, changed: false });
		}
		if (page.revision !== input.baseRevision) return failure(await staleRevision(tx, page));

		const revision = await appendRevision(tx, actor, page, input);
		return success({ revision, changed: true });
	});
}

/** The pages a revision read may reach: staff, archived pages included (their history stays readable). */
function revisionScope(viewer: SessionUser, pageId: string) {
	requirePagesManage(viewer);
	return and(eq(pages.id, pageId), readablePages(viewer, { includeArchived: true }));
}

async function pageExists(viewer: SessionUser, pageId: string): Promise<boolean> {
	const [row] = await getDb()
		.select({ id: pages.id })
		.from(pages)
		.where(revisionScope(viewer, pageId));
	return row !== undefined;
}

/** Every revision of the page, newest first. Staff only: it throws for anybody else. */
export async function listRevisions(
	viewer: SessionUser,
	pageId: string
): Promise<Outcome<RevisionEntry[], 'not_found'>> {
	if (!(await pageExists(viewer, pageId))) return failure('not_found');
	const rows = await getDb()
		.select({
			number: pageRevisions.number,
			title: pageRevisions.title,
			authorName: people.fullName,
			createdAt: pageRevisions.createdAt
		})
		.from(pageRevisions)
		.leftJoin(people, eq(people.id, pageRevisions.authorPersonId))
		.where(eq(pageRevisions.pageId, pageId))
		.orderBy(desc(pageRevisions.number));
	return success(rows);
}

/** One revision with its body. Staff only: it throws for anybody else. */
export async function getRevision(
	viewer: SessionUser,
	pageId: string,
	number: number
): Promise<Outcome<RevisionView, 'not_found'>> {
	if (!(await pageExists(viewer, pageId))) return failure('not_found');
	const row = await readRevision(getDb(), pageId, number);
	return row ? success(row) : failure('not_found');
}

/**
 * Makes revision `number` the page's content again by appending a new revision
 * equal to it (history is append-only) and writing `page.revision.restored`.
 * Same lock and the same stale check as a save; restoring what the page already
 * says appends nothing.
 */
export async function restoreRevision(
	actor: SessionUser,
	pageId: string,
	number: number,
	options: { baseRevision: number }
): Promise<Outcome<SaveResult, RevisionRestoreFailure>> {
	requirePagesManage(actor);
	return getDb().transaction(async (tx) => {
		const page = await lockPage(tx, actor.organisationId, pageId);
		if (!page) return failure('not_found');
		if (page.archivedAt) return failure('archived');
		if (page.revision !== options.baseRevision) return failure(await staleRevision(tx, page));

		const restored = await readRevision(tx, page.id, number);
		if (!restored) return failure('revision_not_found');
		if (restored.title === page.title && restored.body === page.body) {
			return success({ revision: page.revision, changed: false });
		}

		const revision = await appendRevision(tx, actor, page, restored);
		await recordActivity(tx, {
			organisationId: actor.organisationId,
			...actorColumns(actor),
			target: { pageId: page.id },
			verb: 'page.revision.restored',
			payload: { from: number, to: revision }
		});
		return success({ revision, changed: true });
	});
}
