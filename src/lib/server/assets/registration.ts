import { and, eq, isNull, sql } from 'drizzle-orm';
import { actorColumns, recordActivity } from '../activity';
import type { SessionUser } from '../auth/guards';
import { getDb, type Executor } from '../db';
import { uniqueConstraintName } from '../db/errors';
import { locationPaths } from '../directory';
import { failure, success, type Outcome } from '../shared/outcome';
import type { WriteOptions } from '../shared/write-options';
import { assetModels, assets } from './schema';
import { registerAssetInput, updateAssetDetailsInput } from './validation';
import type { RegisterAssetInput, UpdateAssetDetailsInput } from './validation';

/**
 * The two collisions an asset write can expect, keyed by the constraint that
 * reports them.
 *
 * A lookup rather than a ternary, because a ternary has an `else`: written as
 * `constraint === 'assets_org_serial' ? 'duplicate_serial' : 'duplicate_tag'`
 * it answers "duplicate tag" for *every* unique constraint added later, which
 * would turn a future collision into a confidently wrong message. Anything not
 * in this table is not an expected failure and is rethrown.
 */
const ASSET_COLLISIONS = {
	assets_org_tag: 'duplicate_asset_tag',
	assets_org_serial: 'duplicate_serial'
} as const satisfies Record<string, RegisterAssetFailure & UpdateAssetFailure>;

/** The two collisions both registering and editing can hit; the narrow type is what lets each declare only its own failures. */
type AssetCollision = (typeof ASSET_COLLISIONS)[keyof typeof ASSET_COLLISIONS];

function assetCollision(error: unknown): AssetCollision | null {
	const constraint = uniqueConstraintName(error);
	if (constraint === null) return null;

	return constraint in ASSET_COLLISIONS
		? ASSET_COLLISIONS[constraint as keyof typeof ASSET_COLLISIONS]
		: null;
}

/* -------------------------------------------------------------------------- */
/* Writes                                                                     */
/* -------------------------------------------------------------------------- */

export type RegisterAssetFailure =
	'duplicate_asset_tag' | 'duplicate_serial' | 'model_not_found' | 'location_not_found';

export type UpdateAssetFailure =
	'asset_not_found' | 'duplicate_asset_tag' | 'duplicate_serial' | 'model_not_found';

/**
 * The model and the location arrive as ids from a form, and a foreign key only
 * proves a row exists — not that it belongs to the actor's organisation. Without
 * this an asset could be hung on another tenant's model, and the next listing
 * would read that model's name back to the wrong organisation (ADR 0004).
 */
async function foreignReference(
	organisationId: string,
	refs: { assetModelId?: string; locationId?: string | null },
	executor: Executor = getDb()
): Promise<'model_not_found' | 'location_not_found' | null> {
	if (refs.assetModelId !== undefined) {
		const [model] = await executor
			.select({ id: assetModels.id })
			.from(assetModels)
			.where(
				and(eq(assetModels.id, refs.assetModelId), eq(assetModels.organisationId, organisationId))
			)
			.limit(1);
		if (!model) return 'model_not_found';
	}

	if (refs.locationId) {
		// Through `directory`'s own function, not its table: an id from another
		// organisation has no path here, which is the same as not existing.
		const paths = await locationPaths(organisationId, [refs.locationId], executor);
		if (!paths.has(refs.locationId)) return 'location_not_found';
	}

	return null;
}

/**
 * Registers an asset and opens its history in the same transaction (ADR 0009):
 * an asset that exists with no `asset.created` entry is a timeline that starts
 * in the middle.
 *
 * The input is parsed rather than trusted. The route validates with the same
 * schema and maps the issues to `fail(400)`; this parse is the backstop that
 * makes "rejected before it reaches the database" true however the function is
 * reached, and it throws because malformed input here is a programming error.
 */
export async function registerAsset(
	actor: SessionUser,
	input: RegisterAssetInput,
	options: WriteOptions = {}
): Promise<Outcome<{ id: string; assetTag: string }, RegisterAssetFailure>> {
	const values = registerAssetInput.parse(input);

	try {
		// Both the reads and the writes go through the caller's executor, so a
		// model or location created earlier in an import's transaction is visible.
		return await (options.executor ?? getDb()).transaction(async (tx) => {
			const missing = await foreignReference(actor.organisationId, values, tx);
			if (missing) return failure(missing);

			const [row] = await tx
				.insert(assets)
				.values({ ...values, organisationId: actor.organisationId })
				.returning({ id: assets.id, assetTag: assets.assetTag, name: assets.name });

			await recordActivity(tx, {
				organisationId: actor.organisationId,
				...actorColumns(actor),
				target: { assetId: row.id },
				verb: 'asset.created',
				payload:
					options.via === 'import'
						? { assetTag: row.assetTag, name: row.name, via: 'import' }
						: { assetTag: row.assetTag, name: row.name }
			});

			return success({ id: row.id, assetTag: row.assetTag });
		});
	} catch (error) {
		const collision = assetCollision(error);
		if (collision === null) throw error;
		return failure(collision);
	}
}

/**
 * Corrections, not events: a mistyped name or a serial read off the wrong
 * sticker did not *happen* to the asset, so nothing is written to the log.
 * State, custody and location each have their own function because each of them
 * did.
 */
export async function updateAssetDetails(
	actor: SessionUser,
	assetId: string,
	input: UpdateAssetDetailsInput
): Promise<Outcome<void, UpdateAssetFailure>> {
	const values = updateAssetDetailsInput.parse(input);

	// An edit carries no location, so the model is the only reference that can
	// be foreign here; `location_not_found` belongs to registering alone.
	const missing = await foreignReference(actor.organisationId, values);
	if (missing === 'model_not_found') return failure(missing);

	try {
		const updated = await getDb()
			.update(assets)
			.set({ ...values, updatedAt: new Date() })
			.where(
				and(
					eq(assets.id, assetId),
					eq(assets.organisationId, actor.organisationId),
					isNull(assets.archivedAt)
				)
			)
			.returning({ id: assets.id });

		if (updated.length === 0) return failure('asset_not_found');
		return success(undefined);
	} catch (error) {
		const collision = assetCollision(error);
		if (collision === null) throw error;
		return failure(collision);
	}
}

/**
 * Moves `asset_code_seq` forward so the next *generated* tag is free.
 *
 * Needed by anything that writes explicit tags in bulk — the development seed
 * today, the CSV import (#21) tomorrow: an explicit tag never touches the
 * sequence, so without this the next asset somebody registers by hand draws
 * `AST-0001` and is refused as a duplicate of the first imported one. A bug
 * that appears the first time anyone clicks "Register" after an import.
 *
 * `GREATEST` keeps it from ever winding the sequence *back* when the real
 * inventory has already outgrown what is being imported.
 */
export async function advanceAssetTagSequence(
	upTo: number,
	options: WriteOptions = {}
): Promise<void> {
	// `setval` is not transactional: a rolled-back import leaves the sequence
	// advanced, which only leaves a gap in generated tags.
	await (options.executor ?? getDb()).execute(
		sql`select setval('asset_code_seq', greatest((select last_value from asset_code_seq), ${upTo}))`
	);
}

/**
 * Every tag and serial the organisation already uses, for an import to tell a
 * row it has seen from one it has not. Serials are compared case-blind.
 */
export async function existingAssetKeys(
	organisationId: string,
	executor: Executor = getDb()
): Promise<{
	tags: Map<string, { id: string }>;
	serials: Map<string, { id: string; assetTag: string }>;
}> {
	const rows = await executor
		.select({ id: assets.id, assetTag: assets.assetTag, serial: assets.serial })
		.from(assets)
		.where(eq(assets.organisationId, organisationId));
	const tags = new Map<string, { id: string }>();
	const serials = new Map<string, { id: string; assetTag: string }>();
	for (const row of rows) {
		tags.set(row.assetTag.toLowerCase(), { id: row.id });
		if (row.serial !== null) serials.set(row.serial.toLowerCase(), row);
	}
	return { tags, serials };
}
