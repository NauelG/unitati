import { and, eq, isNull } from 'drizzle-orm';
import type { AssetState } from '#lib/domain/status.js';
import { actorColumns, recordActivity } from '../activity';
import type { SessionUser } from '../auth/guards';
import { getDb, type Transaction } from '../db';
import { locationPaths } from '../directory';
import { people } from '../directory/schema';
import { failure, success, type Outcome } from '../shared/outcome';
import type { WriteOptions } from '../shared/write-options';
import { assets, handoverAssets } from './schema';
import { recordCustodyAssigned, recordCustodyReturned } from './custody';

/**
 * Loads an asset for writing, inside the caller's transaction and scoped to the
 * actor's organisation. Returns null rather than throwing so each caller can
 * name its own failure.
 */
export async function lockedAsset(
	tx: Transaction,
	actor: SessionUser,
	assetId: string,
	options: { includeArchived?: boolean } = {}
) {
	const [row] = await tx
		.select({
			id: assets.id,
			assetTag: assets.assetTag,
			name: assets.name,
			state: assets.state,
			custodianPersonId: assets.custodianPersonId,
			locationId: assets.locationId,
			archivedAt: assets.archivedAt
		})
		.from(assets)
		.where(
			and(
				eq(assets.id, assetId),
				eq(assets.organisationId, actor.organisationId),
				// An archived asset takes no writes: to everything but its own
				// restoration it is as good as gone.
				options.includeArchived ? undefined : isNull(assets.archivedAt)
			)
		)
		.for('update')
		.limit(1);

	return row ?? null;
}

export type ArchiveAssetFailure = 'asset_not_found' | 'has_history';

/**
 * Archives an asset that should never have been registered. Refused when the
 * asset has a history that archiving would hide: somebody holds it, or it has
 * been through a handover. Those are retired, not archived. Idempotent.
 */
export async function archiveAsset(
	actor: SessionUser,
	assetId: string
): Promise<Outcome<void, ArchiveAssetFailure>> {
	return getDb().transaction(async (tx) => {
		const asset = await lockedAsset(tx, actor, assetId, { includeArchived: true });
		if (!asset) return failure('asset_not_found');
		if (asset.archivedAt) return success(undefined);

		const [handedOver] = await tx
			.select({ assetId: handoverAssets.assetId })
			.from(handoverAssets)
			.where(eq(handoverAssets.assetId, asset.id))
			.limit(1);
		if (asset.custodianPersonId !== null || handedOver) return failure('has_history');

		await tx
			.update(assets)
			.set({ archivedAt: new Date(), updatedAt: new Date() })
			.where(eq(assets.id, asset.id));

		await recordActivity(tx, {
			organisationId: actor.organisationId,
			...actorColumns(actor),
			target: { assetId: asset.id },
			verb: 'asset.archived',
			payload: {}
		});

		return success(undefined);
	});
}

/** Restores an archived asset exactly as it was. Idempotent on an active one. */
export async function unarchiveAsset(
	actor: SessionUser,
	assetId: string
): Promise<Outcome<void, 'asset_not_found'>> {
	return getDb().transaction(async (tx) => {
		const asset = await lockedAsset(tx, actor, assetId, { includeArchived: true });
		if (!asset) return failure('asset_not_found');
		if (!asset.archivedAt) return success(undefined);

		await tx
			.update(assets)
			.set({ archivedAt: null, updatedAt: new Date() })
			.where(eq(assets.id, asset.id));

		await recordActivity(tx, {
			organisationId: actor.organisationId,
			...actorColumns(actor),
			target: { assetId: asset.id },
			verb: 'asset.unarchived',
			payload: {}
		});

		return success(undefined);
	});
}

export type AssignCustodyFailure = 'asset_not_found' | 'person_not_found' | 'already_in_custody';

/**
 * The low-level recorder of custody: it sets the holder and writes
 * `custody.assigned`, and nothing else. It never issues a handover, which is why
 * only callers that record historical facts use it directly: CSV import and the
 * seed. Everything a person does goes through `deliver`, so the rule that a
 * category can require a signature cannot be bypassed (ADR 0035).
 *
 * An asset somebody already holds is refused rather than silently reassigned:
 * the handover would leave `custody.assigned` with no `custody.returned` before
 * it, and a timeline that says two people had the same laptop is not an audit
 * trail. Return it first.
 *
 * The person's name is snapshotted into the payload beside their id (ADR 0009).
 * The id is for linking; the snapshot is the fact, and it is what keeps the
 * entry true after a rename.
 */
export async function assignCustody(
	actor: SessionUser,
	assetId: string,
	toPersonId: string,
	options: WriteOptions = {}
): Promise<Outcome<void, AssignCustodyFailure>> {
	return (options.executor ?? getDb()).transaction(async (tx) => {
		const asset = await lockedAsset(tx, actor, assetId);
		if (!asset) return failure('asset_not_found');
		if (asset.custodianPersonId !== null) return failure('already_in_custody');

		const [person] = await tx
			.select({ id: people.id, fullName: people.fullName })
			.from(people)
			.where(and(eq(people.id, toPersonId), eq(people.organisationId, actor.organisationId)))
			.limit(1);

		if (!person) return failure('person_not_found');

		await recordCustodyAssigned(tx, actor, asset.id, person);
		return success(undefined);
	});
}

export type ReturnCustodyFailure = 'asset_not_found' | 'not_in_custody';

/**
 * The low-level recorder of a return, `assignCustody`'s counterpart: it clears
 * the holder and writes `custody.returned`, with no condition and no handover.
 * The seed and the API use it; a technician in the app goes through `takeBack`,
 * so a category that requires a signature gets its return handover (#278).
 */
export async function returnCustody(
	actor: SessionUser,
	assetId: string
): Promise<Outcome<void, ReturnCustodyFailure>> {
	return getDb().transaction(async (tx) => {
		const asset = await lockedAsset(tx, actor, assetId);
		if (!asset) return failure('asset_not_found');
		if (asset.custodianPersonId === null) return failure('not_in_custody');

		const [person] = await tx
			.select({ id: people.id, fullName: people.fullName })
			.from(people)
			.where(eq(people.id, asset.custodianPersonId))
			.limit(1);

		/**
		 * `custodian_person_id` is a `set null` foreign key, so a held asset always
		 * has a person to name. If it does not, the database has contradicted
		 * itself, and the only safe thing is to stop: inventing a placeholder would
		 * write a sentence into the audit trail that nobody ever said, and ADR 0009
		 * calls that trail non-negotiable. An exception for an invariant violation,
		 * exactly as ADR 0002 prescribes.
		 */
		if (!person) {
			throw new Error(
				`Asset ${asset.id} names custodian ${asset.custodianPersonId}, who is not in the directory.`
			);
		}

		await recordCustodyReturned(tx, actor, asset.id, person);
		return success(undefined);
	});
}

/**
 * State is orthogonal to custody, and nothing here couples them: an asset can
 * go `in_repair` while somebody still holds it, and sit `in_stock` in a
 * custodian's drawer.
 */
export async function changeState(
	actor: SessionUser,
	assetId: string,
	to: AssetState
): Promise<Outcome<void, 'asset_not_found'>> {
	return getDb().transaction(async (tx) => {
		const asset = await lockedAsset(tx, actor, assetId);
		if (!asset) return failure('asset_not_found');

		// Setting a state to the one it already has is not an event. Writing one
		// would fill a timeline with entries that say nothing happened.
		if (asset.state === to) return success(undefined);

		await tx
			.update(assets)
			.set({ state: to, updatedAt: new Date() })
			.where(eq(assets.id, asset.id));

		await recordActivity(tx, {
			organisationId: actor.organisationId,
			...actorColumns(actor),
			target: { assetId: asset.id },
			verb: 'state.changed',
			payload: { from: asset.state, to }
		});

		return success(undefined);
	});
}

/**
 * The asset's own location, not its custodian's: #24 audits rooms.
 *
 * `location.changed` keeps its `…LocationName` keys so old rows still parse, but
 * since ADR 0027 the value written is the location's full path.
 */
export async function changeLocation(
	actor: SessionUser,
	assetId: string,
	toLocationId: string | null
): Promise<Outcome<void, 'asset_not_found' | 'location_not_found'>> {
	return getDb().transaction(async (tx) => {
		const asset = await lockedAsset(tx, actor, assetId);
		if (!asset) return failure('asset_not_found');
		if (asset.locationId === toLocationId) return success(undefined);

		// The path at the moment of the move: a later rename or re-parenting must not
		// rewrite what the timeline says happened.
		const named = async (id: string | null) => {
			if (id === null) return null;
			const path = (await locationPaths(actor.organisationId, [id], tx)).get(id);
			return path === undefined ? null : { id, name: path };
		};

		const to = await named(toLocationId);
		if (toLocationId !== null && !to) return failure('location_not_found');

		const from = await named(asset.locationId);

		await tx
			.update(assets)
			.set({ locationId: toLocationId, updatedAt: new Date() })
			.where(eq(assets.id, asset.id));

		await recordActivity(tx, {
			organisationId: actor.organisationId,
			...actorColumns(actor),
			target: { assetId: asset.id },
			verb: 'location.changed',
			payload: {
				fromLocationId: from?.id ?? null,
				fromLocationName: from?.name ?? null,
				toLocationId: to?.id ?? null,
				toLocationName: to?.name ?? null
			}
		});

		return success(undefined);
	});
}
