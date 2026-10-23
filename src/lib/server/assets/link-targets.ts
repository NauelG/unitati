import { and, eq, inArray } from 'drizzle-orm';
import { deriveHandoverState, type HandoverState } from '#lib/domain/handover.js';
import type { AssetState } from '#lib/domain/status.js';
import { can } from '../access/permissions';
import type { SessionUser } from '../auth/guards';
import { getDb, type Executor, type Transaction } from '../db';
import { assets, categories, handovers } from './schema';
import { requireAssetScope } from './scope';

/**
 * What `links` needs to know about an asset, a handover or a category to relate
 * a ticket to it, read through the owner (ADR 0002: `links` never queries these
 * tables itself). Mirrors `projects/link-targets.ts`.
 *
 * Two flavours of asset read, on purpose. `findAssetInScope` and
 * `assetSummaries` are **scoped**: what the viewer may see (ADR 0007), archived
 * excluded. `assetSnapshot` is **tenancy only** and includes archived assets:
 * the tag and name an activity entry freezes when a link is undone, which must
 * work whoever is asking and whether or not the asset has since been archived
 * (ADR 0045).
 */

export interface AssetLinkTarget {
	id: string;
	assetTag: string;
	name: string;
}

export interface AssetLinkSummary extends AssetLinkTarget {
	state: AssetState;
}

export interface HandoverSummary {
	id: string;
	code: string;
	/** The name the handover froze when it was issued. */
	personName: string;
	/** Already derived (`expired` is never stored): see `deriveHandoverState`. */
	state: HandoverState;
}

/** Whether the viewer holds any asset-read permission; without one the scope would throw. */
function readsAssets(viewer: SessionUser): boolean {
	return (
		can(viewer, 'assets.view') ||
		can(viewer, 'assets.view.own') ||
		can(viewer, 'assets.view.shared')
	);
}

/** The asset as the viewer may see it, or `null`: out of scope, archived or unpermitted reads as missing. */
export async function findAssetInScope(
	tx: Transaction,
	viewer: SessionUser,
	assetId: string
): Promise<AssetLinkTarget | null> {
	if (!readsAssets(viewer)) return null;

	const [asset] = await tx
		.select({ id: assets.id, assetTag: assets.assetTag, name: assets.name })
		.from(assets)
		.where(and(requireAssetScope(viewer), eq(assets.id, assetId)))
		.limit(1);

	return asset ?? null;
}

/** The asset of the organisation, archived or not, whoever is asking. */
export async function assetSnapshot(
	tx: Transaction,
	organisationId: string,
	assetId: string
): Promise<AssetLinkTarget | null> {
	const [asset] = await tx
		.select({ id: assets.id, assetTag: assets.assetTag, name: assets.name })
		.from(assets)
		.where(and(eq(assets.organisationId, organisationId), eq(assets.id, assetId)))
		.limit(1);

	return asset ?? null;
}

/**
 * The assets among `ids` the viewer may see, for `links` to draw on the other
 * side of a relation. Anybody who reads no asset at all gets none, rather than
 * the throw `requireAssetScope` reserves for a route that forgot its guard.
 */
export async function assetSummaries(
	viewer: SessionUser,
	ids: string[]
): Promise<AssetLinkSummary[]> {
	if (ids.length === 0 || !readsAssets(viewer)) return [];

	return getDb()
		.select({ id: assets.id, assetTag: assets.assetTag, name: assets.name, state: assets.state })
		.from(assets)
		.where(and(requireAssetScope(viewer), inArray(assets.id, ids)));
}

/**
 * The handovers among `ids`, with their state as it is now. Handovers are
 * signature evidence: reading them takes `assets.view`, and without it the
 * answer is empty.
 */
export async function handoverSummaries(
	viewer: SessionUser,
	ids: string[]
): Promise<HandoverSummary[]> {
	if (ids.length === 0 || !can(viewer, 'assets.view')) return [];

	const now = new Date();
	const rows = await getDb()
		.select({
			id: handovers.id,
			code: handovers.code,
			personName: handovers.personNameSnapshot,
			status: handovers.status,
			expiresAt: handovers.expiresAt
		})
		.from(handovers)
		.where(and(eq(handovers.organisationId, viewer.organisationId), inArray(handovers.id, ids)));

	return rows.map((row) => ({
		id: row.id,
		code: row.code,
		personName: row.personName,
		state: deriveHandoverState(row, now)
	}));
}

/** The handover, if it belongs to the organisation; tenancy only. */
export async function handoverInOrganisation(
	tx: Transaction,
	organisationId: string,
	handoverId: string
): Promise<{ id: string } | null> {
	const [handover] = await tx
		.select({ id: handovers.id })
		.from(handovers)
		.where(and(eq(handovers.id, handoverId), eq(handovers.organisationId, organisationId)))
		.limit(1);

	return handover ?? null;
}

/** The handover named by its code (`HND-0001`); the code format is ours, so the normalisation is too. */
export async function handoverByCode(
	tx: Transaction,
	organisationId: string,
	code: string
): Promise<{ id: string } | null> {
	const [handover] = await tx
		.select({ id: handovers.id })
		.from(handovers)
		.where(
			and(
				eq(handovers.organisationId, organisationId),
				eq(handovers.code, code.trim().toUpperCase())
			)
		)
		.limit(1);

	return handover ?? null;
}

/** The category, if it belongs to the organisation; the one check a form's posted id needs. */
export async function categoryInOrganisation(
	executor: Executor,
	organisationId: string,
	categoryId: string
): Promise<{ id: string; name: string } | null> {
	const [category] = await executor
		.select({ id: categories.id, name: categories.name })
		.from(categories)
		.where(and(eq(categories.id, categoryId), eq(categories.organisationId, organisationId)))
		.limit(1);

	return category ?? null;
}
