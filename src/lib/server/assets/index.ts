import { and, asc, eq, or, sql, type SQL } from 'drizzle-orm';
import type { AssetState } from '#lib/domain/status.js';
import { listActivity, recordActivity, type TimelineEntry } from '../activity';
import { can } from '../access/permissions';
import type { SessionUser } from '../auth/guards';
import { getDb, type Transaction } from '../db';
import { constraintViolation } from '../db/errors';
import { locations, people } from '../directory/schema';
import { failure, success, type Outcome } from '../shared/outcome';
import { page, pageWindow, type Page, type PageRequest } from '../shared/pagination';
import { assetModels, assets, categories, manufacturers } from './schema';
import { viewAsset, type AssetView } from './view';
import { registerAssetInput, updateAssetDetailsInput } from './validation';
import type {
	AssetModelInput,
	CategoryInput,
	ManufacturerInput,
	RegisterAssetInput,
	UpdateAssetDetailsInput
} from './validation';

export { viewAsset } from './view';
export type { AssetView, FullAssetView, SharedAssetView } from './view';

export {
	assets,
	assetModels,
	categories,
	manufacturers,
	assetState,
	assetCodeSequence
} from './schema';
export type { Asset, AssetModel, Category, Manufacturer } from './schema';
export {
	registerAssetInput,
	updateAssetDetailsInput,
	assetModelInput,
	categoryInput,
	manufacturerInput
} from './validation';
export type {
	RegisterAssetInput,
	UpdateAssetDetailsInput,
	AssetModelInput,
	CategoryInput,
	ManufacturerInput
} from './validation';

/**
 * The assets domain's public surface (ADR 0002): routes validate input, call
 * one of these, and map the outcome to HTTP. Nothing below is reachable from a
 * route, and no route builds a query of its own.
 *
 * **Two kinds of check, split on purpose.** Whether a user may *reach* a screen
 * is a capability, gated by `requirePermission` in the route (ADR 0007). Which
 * *rows and fields* they then see is data, and that cannot live in a route — so
 * it lives here, in `visibleAssets` and `viewAsset`. The write functions below
 * trust the route's gate and scope tenancy only; the read functions resolve the
 * permission themselves, because for them the permission *is* the query.
 */

/* -------------------------------------------------------------------------- */
/* Scope                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * The rows a viewer may see at all, as SQL. Returns `null` when the viewer
 * holds no asset-read permission whatsoever, which the callers turn into a
 * thrown error rather than an empty page: an empty list is indistinguishable
 * from a correctly-scoped empty inventory, and silently returning one would
 * hide a route that forgot its `requirePermission`.
 */
function visibleAssets(viewer: SessionUser): SQL | null {
	const organisation = eq(assets.organisationId, viewer.organisationId);

	if (can(viewer, 'assets.view')) return organisation;

	const clauses: SQL[] = [];

	/**
	 * The null check is the point, not a formality. An employee whose credential
	 * has no directory record has `personId === null`, and "the assets in my
	 * custody" written against it becomes `custodian_person_id is null` — which
	 * matches every asset nobody holds, i.e. most of the inventory. The clause
	 * has to be dropped, not parameterised with null.
	 */
	if (can(viewer, 'assets.view.own') && viewer.personId !== null) {
		clauses.push(eq(assets.custodianPersonId, viewer.personId));
	}

	if (can(viewer, 'assets.view.shared')) clauses.push(eq(assets.shared, true));

	if (clauses.length === 0) return null;

	return and(organisation, or(...clauses)) as SQL;
}

function requireScope(viewer: SessionUser): SQL {
	const scope = visibleAssets(viewer);
	if (scope) return scope;

	// An invariant violation, not a business failure: every role in ADR 0007
	// holds at least one asset-read permission, so arriving here means a route
	// called a listing without gating it first.
	throw new Error(
		`The ${viewer.role} role holds no asset-read permission; the route should have called requirePermission first.`
	);
}

/** `simple` + `unaccent`, through the immutable wrapper the migration creates.
 *
 * `plainto_tsquery`, not `to_tsquery`: the term comes from a search box, and
 * `to_tsquery` raises a syntax error on "macbook pro" — a user typing two words
 * is not an error worth a 500. It matches the asset's own vector or its model's,
 * so searching a model name finds the forty machines of that model. */
function matchesSearch(term: string): SQL {
	const query = sql`plainto_tsquery('simple', immutable_unaccent(${term}))`;
	return sql`(${assets.search} @@ ${query} or ${assetModels.search} @@ ${query})`;
}

/* -------------------------------------------------------------------------- */
/* Reads                                                                      */
/* -------------------------------------------------------------------------- */

export interface AssetListRequest extends PageRequest {
	/** Free text from a search box. Blank and whitespace are treated as absent. */
	search?: string;
}

/** The columns every read selects, so a list row and a detail row cannot drift. */
const fullAssetColumns = {
	id: assets.id,
	assetTag: assets.assetTag,
	name: assets.name,
	serial: assets.serial,
	state: assets.state,
	shared: assets.shared,
	modelName: assetModels.name,
	manufacturerName: manufacturers.name,
	categoryName: categories.name,
	custodianPersonId: assets.custodianPersonId,
	custodianName: people.fullName,
	locationId: assets.locationId,
	locationName: locations.name
};

/**
 * Paginated on the server from the first list screen (ADR-less but deliberate):
 * with 200 seeded assets, loading everything works, and that is exactly the
 * trap — it keeps working until the install with 4,000 rows.
 */
export async function listAssets(
	viewer: SessionUser,
	request: AssetListRequest = {}
): Promise<Page<AssetView>> {
	const window = pageWindow(request);
	const term = request.search?.trim();
	const where = and(requireScope(viewer), term ? matchesSearch(term) : undefined) as SQL;

	const db = getDb();

	const rows = await db
		.select(fullAssetColumns)
		.from(assets)
		.innerJoin(assetModels, eq(assets.assetModelId, assetModels.id))
		.innerJoin(manufacturers, eq(assetModels.manufacturerId, manufacturers.id))
		.innerJoin(categories, eq(assetModels.categoryId, categories.id))
		.leftJoin(people, eq(assets.custodianPersonId, people.id))
		.leftJoin(locations, eq(assets.locationId, locations.id))
		.where(where)
		// Unique per organisation, so it is a total order: without a tie-break a
		// row can appear on both page 1 and page 2 and on neither.
		.orderBy(asc(assets.assetTag))
		.limit(window.limit)
		.offset(window.offset);

	// Counted over the same joins and the same predicate, because the search
	// filter touches `asset_models`: a count over `assets` alone would report a
	// total the pager cannot reach.
	const [counted] = await db
		.select({ total: sql<number>`count(*)::int` })
		.from(assets)
		.innerJoin(assetModels, eq(assets.assetModelId, assetModels.id))
		.innerJoin(manufacturers, eq(assetModels.manufacturerId, manufacturers.id))
		.innerJoin(categories, eq(assetModels.categoryId, categories.id))
		.leftJoin(people, eq(assets.custodianPersonId, people.id))
		.leftJoin(locations, eq(assets.locationId, locations.id))
		.where(where);

	const visible = rows.map((row) => viewAsset({ visibility: 'full', ...row }, viewer));

	return page(visible, counted?.total ?? 0, window);
}

/** The asset behind a `/assets/AST-0142` URL (ADR 0010), redacted for its viewer. */
export async function getAssetByTag(
	viewer: SessionUser,
	assetTag: string
): Promise<Outcome<AssetView, 'asset_not_found'>> {
	const [row] = await getDb()
		.select(fullAssetColumns)
		.from(assets)
		.innerJoin(assetModels, eq(assets.assetModelId, assetModels.id))
		.innerJoin(manufacturers, eq(assetModels.manufacturerId, manufacturers.id))
		.innerJoin(categories, eq(assetModels.categoryId, categories.id))
		.leftJoin(people, eq(assets.custodianPersonId, people.id))
		.leftJoin(locations, eq(assets.locationId, locations.id))
		.where(and(requireScope(viewer), eq(assets.assetTag, assetTag)))
		.limit(1);

	if (!row) return failure('asset_not_found');

	return success(viewAsset({ visibility: 'full', ...row }, viewer));
}

/**
 * The events half of an asset's timeline (ADR 0009 merges in live relations at
 * read time; #9 brings those).
 *
 * Gated separately from the row itself, because ADR 0007 grants an employee
 * name and location of a shared asset and explicitly not its history. Holding
 * `assets.view.shared` is therefore not enough to read this.
 */
export async function assetTimeline(
	viewer: SessionUser,
	assetTag: string
): Promise<Outcome<TimelineEntry[], 'asset_not_found' | 'history_not_visible'>> {
	const [row] = await getDb()
		.select({ id: assets.id, custodianPersonId: assets.custodianPersonId })
		.from(assets)
		.where(and(requireScope(viewer), eq(assets.assetTag, assetTag)))
		.limit(1);

	if (!row) return failure('asset_not_found');

	const own = viewer.personId !== null && row.custodianPersonId === viewer.personId;
	if (!can(viewer, 'assets.view') && !own) return failure('history_not_visible');

	return success(
		await listActivity({ organisationId: viewer.organisationId, target: { assetId: row.id } })
	);
}

/* -------------------------------------------------------------------------- */
/* Catalogue                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Which unique constraint refused a write, or null if the failure was something
 * else. The constraint's name is the only thing that separates "that tag is
 * taken" from "that serial is taken", and those are two different sentences for
 * the person who typed one of them.
 */
function violatedUniqueConstraint(error: unknown): string | null {
	const violation = constraintViolation(error);
	return violation?.code === '23505' ? violation.constraint : null;
}

export type CatalogueFailure = 'duplicate_name';

export async function createManufacturer(
	actor: SessionUser,
	input: ManufacturerInput
): Promise<Outcome<{ id: string }, CatalogueFailure>> {
	try {
		const [row] = await getDb()
			.insert(manufacturers)
			.values({ ...input, organisationId: actor.organisationId })
			.returning({ id: manufacturers.id });
		return success(row);
	} catch (error) {
		if (violatedUniqueConstraint(error) !== null) return failure('duplicate_name');
		throw error;
	}
}

export async function createCategory(
	actor: SessionUser,
	input: CategoryInput
): Promise<Outcome<{ id: string }, CatalogueFailure>> {
	try {
		const [row] = await getDb()
			.insert(categories)
			.values({ ...input, organisationId: actor.organisationId })
			.returning({ id: categories.id });
		return success(row);
	} catch (error) {
		if (violatedUniqueConstraint(error) !== null) return failure('duplicate_name');
		throw error;
	}
}

export async function createAssetModel(
	actor: SessionUser,
	input: AssetModelInput
): Promise<Outcome<{ id: string }, CatalogueFailure>> {
	try {
		const [row] = await getDb()
			.insert(assetModels)
			.values({ ...input, organisationId: actor.organisationId })
			.returning({ id: assetModels.id });
		return success(row);
	} catch (error) {
		if (violatedUniqueConstraint(error) !== null) return failure('duplicate_name');
		throw error;
	}
}

export interface CatalogueEntry {
	id: string;
	name: string;
}

export function listManufacturers(organisationId: string): Promise<CatalogueEntry[]> {
	return getDb()
		.select({ id: manufacturers.id, name: manufacturers.name })
		.from(manufacturers)
		.where(eq(manufacturers.organisationId, organisationId))
		.orderBy(asc(manufacturers.name));
}

export function listCategories(organisationId: string): Promise<CatalogueEntry[]> {
	return getDb()
		.select({ id: categories.id, name: categories.name })
		.from(categories)
		.where(eq(categories.organisationId, organisationId))
		.orderBy(asc(categories.name));
}

export interface AssetModelEntry extends CatalogueEntry {
	manufacturerName: string;
	categoryName: string;
}

export function listAssetModels(organisationId: string): Promise<AssetModelEntry[]> {
	return getDb()
		.select({
			id: assetModels.id,
			name: assetModels.name,
			manufacturerName: manufacturers.name,
			categoryName: categories.name
		})
		.from(assetModels)
		.innerJoin(manufacturers, eq(assetModels.manufacturerId, manufacturers.id))
		.innerJoin(categories, eq(assetModels.categoryId, categories.id))
		.where(eq(assetModels.organisationId, organisationId))
		.orderBy(asc(manufacturers.name), asc(assetModels.name));
}

/* -------------------------------------------------------------------------- */
/* Writes                                                                     */
/* -------------------------------------------------------------------------- */

export type RegisterAssetFailure = 'duplicate_asset_tag' | 'duplicate_serial';

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
	input: RegisterAssetInput
): Promise<Outcome<{ id: string; assetTag: string }, RegisterAssetFailure>> {
	const values = registerAssetInput.parse(input);

	try {
		return await getDb().transaction(async (tx) => {
			const [row] = await tx
				.insert(assets)
				.values({ ...values, organisationId: actor.organisationId })
				.returning({ id: assets.id, assetTag: assets.assetTag, name: assets.name });

			await recordActivity(tx, {
				organisationId: actor.organisationId,
				actorPersonId: actor.personId,
				target: { assetId: row.id },
				verb: 'asset.created',
				payload: { assetTag: row.assetTag, name: row.name }
			});

			return success({ id: row.id, assetTag: row.assetTag });
		});
	} catch (error) {
		const constraint = violatedUniqueConstraint(error);
		if (constraint === null) throw error;
		return failure(constraint === 'assets_org_serial' ? 'duplicate_serial' : 'duplicate_asset_tag');
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
): Promise<Outcome<void, 'asset_not_found' | RegisterAssetFailure>> {
	const values = updateAssetDetailsInput.parse(input);

	try {
		const updated = await getDb()
			.update(assets)
			.set({ ...values, updatedAt: new Date() })
			.where(and(eq(assets.id, assetId), eq(assets.organisationId, actor.organisationId)))
			.returning({ id: assets.id });

		if (updated.length === 0) return failure('asset_not_found');
		return success(undefined);
	} catch (error) {
		const constraint = violatedUniqueConstraint(error);
		if (constraint === null) throw error;
		return failure(constraint === 'assets_org_serial' ? 'duplicate_serial' : 'duplicate_asset_tag');
	}
}

/**
 * Loads an asset for writing, inside the caller's transaction and scoped to the
 * actor's organisation. Returns null rather than throwing so each caller can
 * name its own failure.
 */
async function lockedAsset(tx: Transaction, actor: SessionUser, assetId: string) {
	const [row] = await tx
		.select({
			id: assets.id,
			state: assets.state,
			custodianPersonId: assets.custodianPersonId,
			locationId: assets.locationId
		})
		.from(assets)
		.where(and(eq(assets.id, assetId), eq(assets.organisationId, actor.organisationId)))
		.limit(1);

	return row ?? null;
}

export type AssignCustodyFailure = 'asset_not_found' | 'person_not_found';

/**
 * Hands an asset to a person. Custody is a technician recording a fact, not a
 * workflow with a signature — the request-and-acceptance flow is #25.
 *
 * The person's name is snapshotted into the payload beside their id (ADR 0009).
 * The id is for linking; the snapshot is the fact, and it is what keeps the
 * entry true after a rename.
 */
export async function assignCustody(
	actor: SessionUser,
	assetId: string,
	toPersonId: string
): Promise<Outcome<void, AssignCustodyFailure>> {
	return getDb().transaction(async (tx) => {
		const asset = await lockedAsset(tx, actor, assetId);
		if (!asset) return failure('asset_not_found');

		const [person] = await tx
			.select({ id: people.id, fullName: people.fullName })
			.from(people)
			.where(and(eq(people.id, toPersonId), eq(people.organisationId, actor.organisationId)))
			.limit(1);

		if (!person) return failure('person_not_found');

		await tx
			.update(assets)
			.set({ custodianPersonId: person.id, updatedAt: new Date() })
			.where(eq(assets.id, asset.id));

		await recordActivity(tx, {
			organisationId: actor.organisationId,
			actorPersonId: actor.personId,
			target: { assetId: asset.id },
			verb: 'custody.assigned',
			payload: { toPersonId: person.id, toPersonName: person.fullName }
		});

		return success(undefined);
	});
}

export type ReturnCustodyFailure = 'asset_not_found' | 'not_in_custody';

export async function returnCustody(
	actor: SessionUser,
	assetId: string
): Promise<Outcome<void, ReturnCustodyFailure>> {
	return getDb().transaction(async (tx) => {
		const asset = await lockedAsset(tx, actor, assetId);
		if (!asset) return failure('asset_not_found');
		if (asset.custodianPersonId === null) return failure('not_in_custody');

		const [person] = await tx
			.select({ fullName: people.fullName })
			.from(people)
			.where(eq(people.id, asset.custodianPersonId))
			.limit(1);

		await tx
			.update(assets)
			.set({ custodianPersonId: null, updatedAt: new Date() })
			.where(eq(assets.id, asset.id));

		await recordActivity(tx, {
			organisationId: actor.organisationId,
			actorPersonId: actor.personId,
			target: { assetId: asset.id },
			verb: 'custody.returned',
			payload: {
				fromPersonId: asset.custodianPersonId,
				// The custodian column is a `set null` foreign key, so the person is
				// still there whenever custody is held. Falling back keeps the payload
				// valid rather than throwing on a row that should not exist.
				fromPersonName: person?.fullName ?? 'Unknown'
			}
		});

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
			actorPersonId: actor.personId,
			target: { assetId: asset.id },
			verb: 'state.changed',
			payload: { from: asset.state, to }
		});

		return success(undefined);
	});
}

/** The asset's own location, not its custodian's: #24 audits rooms. */
export async function changeLocation(
	actor: SessionUser,
	assetId: string,
	toLocationId: string | null
): Promise<Outcome<void, 'asset_not_found' | 'location_not_found'>> {
	return getDb().transaction(async (tx) => {
		const asset = await lockedAsset(tx, actor, assetId);
		if (!asset) return failure('asset_not_found');
		if (asset.locationId === toLocationId) return success(undefined);

		const named = async (id: string | null) => {
			if (id === null) return null;
			const [row] = await tx
				.select({ id: locations.id, name: locations.name })
				.from(locations)
				.where(and(eq(locations.id, id), eq(locations.organisationId, actor.organisationId)))
				.limit(1);
			return row ?? null;
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
			actorPersonId: actor.personId,
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

/** A free-text entry on the timeline: "keyboard replaced under warranty". */
export async function addNote(
	actor: SessionUser,
	assetId: string,
	text: string
): Promise<Outcome<void, 'asset_not_found' | 'empty_note'>> {
	const body = text.trim();
	if (body.length === 0) return failure('empty_note');

	return getDb().transaction(async (tx) => {
		const asset = await lockedAsset(tx, actor, assetId);
		if (!asset) return failure('asset_not_found');

		await recordActivity(tx, {
			organisationId: actor.organisationId,
			actorPersonId: actor.personId,
			target: { assetId: asset.id },
			verb: 'note.added',
			payload: { text: body }
		});

		return success(undefined);
	});
}
