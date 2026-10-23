import { and, asc, eq } from 'drizzle-orm';
import { actorColumns, recordActivity } from '../activity';
import type { SessionUser } from '../auth/guards';
import { getDb, type Transaction } from '../db';
import { people } from '../directory/schema';
import { attachmentProblem, storeFiles, type UploadedFile } from '../shared/attachments';
import { failure, success, type Outcome } from '../shared/outcome';
import { runtimeStorage } from '../shared/runtime';
import type { Storage } from '../shared/storage';
import { readablePages, requirePagesManage } from './scope';
import { pageAttachments, pages } from './schema';

/**
 * Files attached to a page (ADR 0039, #325).
 *
 * Reads go through `readablePages`, the same scope as the page itself: an
 * employee reads the attachments of a published `portal` page, never of a draft
 * or a `staff` page, and an id they may not read is `attachment_not_found`,
 * which confirms nothing. Writes need `knowledge.manage` and a page that is not
 * archived. **Attaching a file is not an edit**: it appends no revision.
 *
 * **Bytes and rows are never allowed to disagree in the dangerous direction.**
 * On add the bytes are written first and removed again if the transaction
 * fails; on remove the row goes first and the bytes after commit, swallowing a
 * storage failure. An orphaned file is harmless; a row pointing at missing
 * bytes is not.
 */

export type AttachmentDeps = { storage?: Storage };

export type PageAttachmentView = {
	id: string;
	filename: string;
	contentType: string;
	byteSize: number;
	uploaderName: string | null;
	createdAt: Date;
};

export type PageAttachmentBytes = { filename: string; contentType: string; data: Uint8Array };

export type PageAttachmentAddFailure =
	'not_found' | 'archived' | 'attachments_too_many' | 'attachments_too_large';
export type PageAttachmentRemoveFailure = 'attachment_not_found' | 'archived';

const viewColumns = {
	id: pageAttachments.id,
	filename: pageAttachments.filename,
	contentType: pageAttachments.contentType,
	byteSize: pageAttachments.byteSize,
	uploaderName: people.fullName,
	createdAt: pageAttachments.createdAt
};

/**
 * One transaction has one `now()`, so files added together would tie on
 * `created_at` and list in random order. A millisecond apart keeps the order
 * the visitor picked them in.
 */
const orderedAt = (base: number, index: number) => new Date(base + index);

/** Bytes that were written but whose rows never landed. Best effort: a leftover is harmless. */
async function discard(storage: Storage, keys: readonly string[]): Promise<void> {
	await Promise.allSettled(keys.map((key) => storage.delete(key)));
}

/**
 * The page row, locked, if the actor may read it: a concurrent archive is
 * serialised against an upload. `undefined` is "not there for this actor".
 */
async function lockReadablePage(tx: Transaction, actor: SessionUser, pageId: string) {
	const [row] = await tx
		.select({ id: pages.id, archivedAt: pages.archivedAt })
		.from(pages)
		.where(and(eq(pages.id, pageId), readablePages(actor, { includeArchived: true })))
		.for('update');
	return row;
}

/** Readable by the viewer; staff also read the attachments of an archived page. */
export async function listPageAttachments(
	viewer: SessionUser,
	pageId: string
): Promise<Outcome<PageAttachmentView[], 'not_found'>> {
	const [page] = await getDb()
		.select({ id: pages.id })
		.from(pages)
		.where(and(eq(pages.id, pageId), readablePages(viewer, { includeArchived: true })))
		.limit(1);
	if (!page) return failure('not_found');

	return success(
		await getDb()
			.select(viewColumns)
			.from(pageAttachments)
			.leftJoin(people, eq(people.id, pageAttachments.uploadedByPersonId))
			.where(eq(pageAttachments.pageId, page.id))
			.orderBy(asc(pageAttachments.createdAt), asc(pageAttachments.id))
	);
}

export async function addPageAttachments(
	actor: SessionUser,
	pageId: string,
	files: UploadedFile[],
	deps: AttachmentDeps = {}
): Promise<Outcome<PageAttachmentView[], PageAttachmentAddFailure>> {
	requirePagesManage(actor);
	const problem = attachmentProblem(files);
	if (problem) return failure(`attachments_${problem}`);
	if (files.length === 0) return success([]);

	const storage = deps.storage ?? runtimeStorage();
	const stored = await storeFiles(storage, actor.organisationId, files);
	const keys = stored.map(({ row }) => row.storageKey);
	const now = Date.now();

	try {
		const outcome = await getDb().transaction(
			async (tx): Promise<Outcome<PageAttachmentView[], PageAttachmentAddFailure>> => {
				const page = await lockReadablePage(tx, actor, pageId);
				if (!page) return failure('not_found');
				if (page.archivedAt) return failure('archived');

				const inserted = await tx
					.insert(pageAttachments)
					.values(
						stored.map(({ row }, index) => ({
							organisationId: actor.organisationId,
							pageId,
							createdAt: orderedAt(now, index),
							uploadedByPersonId: actor.personId,
							...row
						}))
					)
					.returning({ id: pageAttachments.id });

				for (const { row } of stored) {
					await recordActivity(tx, {
						organisationId: actor.organisationId,
						...actorColumns(actor),
						target: { pageId },
						verb: 'page.attachment.added',
						payload: { filename: row.filename }
					});
				}

				const ids = new Set(inserted.map(({ id }) => id));
				const rows = await tx
					.select(viewColumns)
					.from(pageAttachments)
					.leftJoin(people, eq(people.id, pageAttachments.uploadedByPersonId))
					.where(eq(pageAttachments.pageId, pageId))
					.orderBy(asc(pageAttachments.createdAt), asc(pageAttachments.id));
				return success(rows.filter((row) => ids.has(row.id)));
			}
		);

		if (!outcome.ok) await discard(storage, keys);
		return outcome;
	} catch (error) {
		await discard(storage, keys);
		throw error;
	}
}

export async function removePageAttachment(
	actor: SessionUser,
	attachmentId: string,
	deps: AttachmentDeps = {}
): Promise<Outcome<void, PageAttachmentRemoveFailure>> {
	requirePagesManage(actor);
	const storage = deps.storage ?? runtimeStorage();

	const [owning] = await getDb()
		.select({ pageId: pageAttachments.pageId })
		.from(pageAttachments)
		.where(
			and(
				eq(pageAttachments.id, attachmentId),
				eq(pageAttachments.organisationId, actor.organisationId)
			)
		);
	if (!owning) return failure('attachment_not_found');

	const outcome = await getDb().transaction(
		async (tx): Promise<Outcome<string, PageAttachmentRemoveFailure>> => {
			const page = await lockReadablePage(tx, actor, owning.pageId);
			if (!page) return failure('attachment_not_found');
			if (page.archivedAt) return failure('archived');

			const [removed] = await tx
				.delete(pageAttachments)
				.where(
					and(
						eq(pageAttachments.id, attachmentId),
						eq(pageAttachments.organisationId, actor.organisationId)
					)
				)
				.returning({
					storageKey: pageAttachments.storageKey,
					filename: pageAttachments.filename
				});
			// A second tab got there first.
			if (!removed) return failure('attachment_not_found');

			await recordActivity(tx, {
				organisationId: actor.organisationId,
				...actorColumns(actor),
				target: { pageId: owning.pageId },
				verb: 'page.attachment.removed',
				payload: { filename: removed.filename }
			});
			return success(removed.storageKey);
		}
	);
	if (!outcome.ok) return outcome;

	await discard(storage, [outcome.value]);
	return success(undefined);
}

/** The bytes for the download route, through the page's own scope. */
export async function getPageAttachment(
	viewer: SessionUser,
	attachmentId: string,
	deps: AttachmentDeps = {}
): Promise<Outcome<PageAttachmentBytes, 'attachment_not_found'>> {
	const [row] = await getDb()
		.select({
			filename: pageAttachments.filename,
			contentType: pageAttachments.contentType,
			storageKey: pageAttachments.storageKey
		})
		.from(pageAttachments)
		.innerJoin(pages, eq(pageAttachments.pageId, pages.id))
		.where(
			and(
				eq(pageAttachments.id, attachmentId),
				eq(pageAttachments.organisationId, viewer.organisationId),
				readablePages(viewer, { includeArchived: true })
			)
		)
		.limit(1);
	if (!row) return failure('attachment_not_found');

	const data = await (deps.storage ?? runtimeStorage()).get(row.storageKey);
	if (!data) return failure('attachment_not_found');
	return success({ filename: row.filename, contentType: row.contentType, data });
}
