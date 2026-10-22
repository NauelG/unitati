import { and, asc, eq } from 'drizzle-orm';
import { actorColumns, recordActivity } from '../activity';
import { can } from '../access/permissions';
import type { SessionUser } from '../auth/guards';
import { getDb } from '../db';
import {
	attachmentProblem,
	storeFiles,
	uploadedFilesOf,
	type UploadedFile
} from '../shared/attachments';
import { failure, success, type Outcome } from '../shared/outcome';
import { runtimeStorage } from '../shared/runtime';
import type { Storage } from '../shared/storage';
import { assetAttachments, assets } from './schema';
import { requireAssetScope } from './scope';

/**
 * Files attached to an asset: the invoice, the warranty, the delivery note
 * (ADR 0039). The asset owns the rows; the shared `Storage` owns the bytes.
 *
 * **Who sees them.** Only a viewer who sees whole asset rows (`assets.view`).
 * ADR 0007 gives an employee the name and place of a shared asset and nothing
 * else, and an invoice carries a price and a supplier: the files follow the
 * same rule as the serial and the history, not the looser rule of the name. A
 * viewer who may not read them gets `asset_not_found`, which confirms nothing.
 *
 * Writing trusts the route's `assets.manage` gate and scopes tenancy only, like
 * every other write in the domain.
 *
 * **Bytes and rows are never allowed to disagree in the dangerous direction.**
 * On add the bytes are written first and removed again if the transaction
 * fails; on remove the row goes first and the bytes after commit, swallowing a
 * storage failure. An orphaned file is harmless; a row pointing at missing
 * bytes is not.
 */

export type AssetAttachmentDeps = { storage?: Storage };

export type AssetAttachmentView = {
	id: string;
	filename: string;
	contentType: string;
	byteSize: number;
	createdAt: Date;
};

export type AssetAttachmentBytes = { filename: string; contentType: string; data: Uint8Array };

export type AddAssetAttachmentsFailure =
	'asset_not_found' | 'attachments_too_many' | 'attachments_too_large';
export type RemoveAssetAttachmentFailure = 'attachment_not_found';

const viewColumns = {
	id: assetAttachments.id,
	filename: assetAttachments.filename,
	contentType: assetAttachments.contentType,
	byteSize: assetAttachments.byteSize,
	createdAt: assetAttachments.createdAt
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
 * The files a multipart form posted under `files`, and the id of the one to
 * remove. Lives with the domain, as `readAttachmentForm` does for projects: a
 * route is not where bytes become `UploadedFile`.
 */
export async function readAssetAttachmentForm(
	request: Request
): Promise<{ files: UploadedFile[]; attachmentId: string }> {
	const data = await request.formData();
	const id = data.get('attachmentId');
	return { files: await uploadedFilesOf(data), attachmentId: typeof id === 'string' ? id : '' };
}

export async function addAssetAttachments(
	actor: SessionUser,
	assetId: string,
	files: UploadedFile[],
	deps: AssetAttachmentDeps = {}
): Promise<Outcome<AssetAttachmentView[], AddAssetAttachmentsFailure>> {
	const problem = attachmentProblem(files);
	if (problem) return failure(`attachments_${problem}`);
	if (files.length === 0) return success([]);

	const storage = deps.storage ?? runtimeStorage();
	const stored = await storeFiles(storage, actor.organisationId, files);
	const keys = stored.map(({ row }) => row.storageKey);
	const now = Date.now();

	try {
		const outcome = await getDb().transaction(
			async (tx): Promise<Outcome<AssetAttachmentView[], 'asset_not_found'>> => {
				const [asset] = await tx
					.select({ id: assets.id })
					.from(assets)
					.where(and(eq(assets.id, assetId), eq(assets.organisationId, actor.organisationId)))
					.limit(1);
				if (!asset) return failure('asset_not_found');

				const rows = await tx
					.insert(assetAttachments)
					.values(
						stored.map(({ row }, index) => ({
							organisationId: actor.organisationId,
							assetId,
							createdAt: orderedAt(now, index),
							uploadedByPersonId: actor.personId,
							...row
						}))
					)
					.returning(viewColumns);

				for (const row of rows) {
					await recordActivity(tx, {
						organisationId: actor.organisationId,
						...actorColumns(actor),
						target: { assetId },
						verb: 'asset.attachment.added',
						payload: { filename: row.filename }
					});
				}
				return success(rows);
			}
		);

		if (!outcome.ok) await discard(storage, keys);
		return outcome;
	} catch (error) {
		await discard(storage, keys);
		throw error;
	}
}

export async function listAssetAttachments(
	viewer: SessionUser,
	assetId: string
): Promise<Outcome<AssetAttachmentView[], 'asset_not_found'>> {
	if (!can(viewer, 'assets.view')) return failure('asset_not_found');

	const [asset] = await getDb()
		.select({ id: assets.id })
		.from(assets)
		.where(and(requireAssetScope(viewer), eq(assets.id, assetId)))
		.limit(1);
	if (!asset) return failure('asset_not_found');

	return success(
		await getDb()
			.select(viewColumns)
			.from(assetAttachments)
			.where(eq(assetAttachments.assetId, asset.id))
			.orderBy(asc(assetAttachments.createdAt), asc(assetAttachments.id))
	);
}

export async function removeAssetAttachment(
	actor: SessionUser,
	attachmentId: string,
	deps: AssetAttachmentDeps = {}
): Promise<Outcome<void, RemoveAssetAttachmentFailure>> {
	const storage = deps.storage ?? runtimeStorage();

	const removed = await getDb().transaction(async (tx) => {
		const [row] = await tx
			.delete(assetAttachments)
			.where(
				and(
					eq(assetAttachments.id, attachmentId),
					eq(assetAttachments.organisationId, actor.organisationId)
				)
			)
			.returning({
				assetId: assetAttachments.assetId,
				storageKey: assetAttachments.storageKey,
				filename: assetAttachments.filename
			});
		// A second tab got there first.
		if (!row) return null;

		await recordActivity(tx, {
			organisationId: actor.organisationId,
			...actorColumns(actor),
			target: { assetId: row.assetId },
			verb: 'asset.attachment.removed',
			payload: { filename: row.filename }
		});
		return row.storageKey;
	});
	if (removed === null) return failure('attachment_not_found');

	await discard(storage, [removed]);
	return success(undefined);
}

export async function getAssetAttachment(
	viewer: SessionUser,
	attachmentId: string,
	deps: AssetAttachmentDeps = {}
): Promise<Outcome<AssetAttachmentBytes, 'attachment_not_found'>> {
	if (!can(viewer, 'assets.view')) return failure('attachment_not_found');

	const [row] = await getDb()
		.select({
			filename: assetAttachments.filename,
			contentType: assetAttachments.contentType,
			storageKey: assetAttachments.storageKey
		})
		.from(assetAttachments)
		.innerJoin(assets, eq(assetAttachments.assetId, assets.id))
		.where(
			and(
				eq(assetAttachments.id, attachmentId),
				eq(assetAttachments.organisationId, viewer.organisationId),
				requireAssetScope(viewer)
			)
		)
		.limit(1);
	if (!row) return failure('attachment_not_found');

	const data = await (deps.storage ?? runtimeStorage()).get(row.storageKey);
	if (!data) return failure('attachment_not_found');
	return success({ filename: row.filename, contentType: row.contentType, data });
}
