import { and, desc, eq } from 'drizzle-orm';
import { actorColumns, recordActivity } from '../activity';
import { can } from '../access/permissions';
import type { SessionUser } from '../auth/guards';
import { getDb } from '../db';
import { people } from '../directory/schema';
import { checkCommentBody, type CommentBodyFailure, type CommentView } from '../shared/comments';
import { failure, success, type Outcome } from '../shared/outcome';
import type { WriteOptions } from '../shared/write-options';
import { assetComments, assets } from './schema';
import { lockedAsset } from './lifecycle';
import { requireAssetScope } from './scope';

/**
 * A comment on the asset: a row in `asset_comments`, plus the `note.added` entry
 * that puts it on the timeline in the same transaction.
 */
export async function addAssetComment(
	actor: SessionUser,
	assetId: string,
	text: string,
	options: WriteOptions = {}
): Promise<Outcome<void, 'asset_not_found' | CommentBodyFailure>> {
	const checked = checkCommentBody(text);
	if ('error' in checked) return failure(checked.error);

	return (options.executor ?? getDb()).transaction(async (tx) => {
		const asset = await lockedAsset(tx, actor, assetId);
		if (!asset) return failure('asset_not_found');

		const [comment] = await tx
			.insert(assetComments)
			.values({
				organisationId: actor.organisationId,
				assetId: asset.id,
				authorPersonId: actor.personId,
				body: checked.body
			})
			.returning({ id: assetComments.id });

		await recordActivity(tx, {
			organisationId: actor.organisationId,
			...actorColumns(actor),
			target: { assetId: asset.id },
			verb: 'note.added',
			payload: { text: checked.body, commentId: comment.id }
		});

		return success(undefined);
	});
}

/**
 * The comments of an asset, newest first. Same gate as its history: the full
 * view, or being the person who holds it (ADR 0007 gives a shared asset's
 * visitor its name and location, not what was said about it).
 */
export async function listAssetComments(
	viewer: SessionUser,
	assetTag: string
): Promise<Outcome<CommentView[], 'asset_not_found' | 'history_not_visible'>> {
	const [row] = await getDb()
		.select({ id: assets.id, custodianPersonId: assets.custodianPersonId })
		.from(assets)
		.where(
			and(
				requireAssetScope(viewer, { includeArchived: can(viewer, 'assets.manage') }),
				eq(assets.assetTag, assetTag)
			)
		)
		.limit(1);
	if (!row) return failure('asset_not_found');

	const own = viewer.personId !== null && row.custodianPersonId === viewer.personId;
	if (!can(viewer, 'assets.view') && !own) return failure('history_not_visible');

	return success(
		await getDb()
			.select({
				id: assetComments.id,
				body: assetComments.body,
				authorName: people.fullName,
				createdAt: assetComments.createdAt
			})
			.from(assetComments)
			.leftJoin(people, eq(assetComments.authorPersonId, people.id))
			.where(eq(assetComments.assetId, row.id))
			.orderBy(desc(assetComments.createdAt), desc(assetComments.id))
	);
}
