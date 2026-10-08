import { and, asc, eq, or, sql, type SQL } from 'drizzle-orm';
import type { AssetState } from '#lib/domain/status.js';
import { listActivity, recordActivity, type TimelineEntry } from '../activity';
import { can } from '../access/permissions';
import type { SessionUser } from '../auth/guards';
import { getDb, type Transaction } from '../db';
import { uniqueConstraintName } from '../db/errors';
import { locations, people } from '../directory/schema';
import { failure, success, type Outcome } from '../shared/outcome';
import { page, pageWindow, type Page, type PageRequest } from '../shared/pagination';
import { assetModels, assets, categories, manufacturers } from './schema';
import { viewAsset, type AssetView } from './view';
import { registerAssetInput, updateAssetDetailsInput } from './validation';
import type { RegisterAssetInput, UpdateAssetDetailsInput } from './validation';

export { viewAsset } from './view';
export type { AssetView, FullAssetView, SharedAssetView } from './view';

export {
	createManufacturer,
	createCategory,
	createAssetModel,
	listManufacturers,
	listCategories,
	listAssetModels
} from './catalogue';
export type { CatalogueEntry, CatalogueFailure, AssetModelEntry } from './catalogue';

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

/**
 * `simple` + `unaccent`, through the immutable wrapper the migration creates.
 *
 * `plainto_tsquery`, not `to_tsquery`: the term comes from a search box, and
 * `to_tsquery` raises a syntax error on "macbook pro" — somebody typing two
 * words is not a 500.
 *
 * **The surface searched is the surface visible.** A viewer who sees whole rows
 * matches the asset's full vector or its model's, so searching "macbook" finds
 * the forty machines of that model. A viewer restricted to shared rows matches
 * `search_shared` alone — name and tag. Searching the full vector would let
 * them confirm a serial, and searching the model's would let them learn a model,
 * neither of which the shared view shows them; a search box that answers
 * questions the payload refuses is the same leak taking one more step.
 *
 * The cost is that an employee cannot search the serial of the laptop in their
 * own custody, which `viewAsset` would have shown them in full. One predicate
 * cannot vary per row, and erring towards the narrower surface is the safe way
 * to be wrong.
 */
function matchesSearch(term: string, wholeRows: boolean): SQL {
	const query = sql`plainto_tsquery('simple', immutable_unaccent(${term}))`;

	return wholeRows
		? sql`(${assets.search} @@ ${query} or ${assetModels.search} @@ ${query})`
		: sql`(${assets.searchShared} @@ ${query})`;
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
 * An asset with its catalogue chain and its two optional sides, joined once.
 *
 * Written once for the same reason `fullAssetColumns` is: the listing, its
 * count and the detail read must see exactly the same rows, and a search that
 * reaches `asset_models` makes that a question about the joins. Three
 * hand-written copies of five joins are three chances for the count to report a
 * total the pager cannot reach.
 *
 * Inner joins for the catalogue, because every column of it is `not null`; left
 * joins for custody and location, because neither is — an inner join there
 * would silently hide every asset nobody holds, which is most of an inventory.
 */
function assetsWithCatalogue() {
	return getDb()
		.select(fullAssetColumns)
		.from(assets)
		.innerJoin(assetModels, eq(assets.assetModelId, assetModels.id))
		.innerJoin(manufacturers, eq(assetModels.manufacturerId, manufacturers.id))
		.innerJoin(categories, eq(assetModels.categoryId, categories.id))
		.leftJoin(people, eq(assets.custodianPersonId, people.id))
		.leftJoin(locations, eq(assets.locationId, locations.id));
}

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
	const wholeRows = can(viewer, 'assets.view');
	const term = request.search?.trim();
	const where = and(requireScope(viewer), term ? matchesSearch(term, wholeRows) : undefined) as SQL;

	const rows = await assetsWithCatalogue()
		.where(where)
		// Unique per organisation, so it is a total order: without a tie-break a
		// row can appear on both page 1 and page 2, or on neither.
		.orderBy(asc(assets.assetTag))
		.limit(window.limit)
		.offset(window.offset);

	/**
	 * The count wraps the *same* query as a subquery rather than repeating its
	 * joins and predicate. Two hand-written queries can disagree — and when they
	 * do, the symptom is a pager offering a page that comes back empty. One of
	 * them being literally a `count(*)` over the other cannot.
	 *
	 * It is a second round trip, not a window function over the page, because
	 * `total` is every matching row while `rows` is twenty-five of them: that is
	 * the whole point of paging in the database instead of in memory.
	 */
	const matching = assetsWithCatalogue().where(where).as('matching');
	const [counted] = await getDb()
		.select({ total: sql<number>`count(*)::int` })
		.from(matching);

	const visible = rows.map((row) => viewAsset({ visibility: 'full', ...row }, viewer));

	return page(visible, counted?.total ?? 0, window);
}

/** The asset behind a `/assets/AST-0142` URL (ADR 0010), redacted for its viewer. */
export async function getAssetByTag(
	viewer: SessionUser,
	assetTag: string
): Promise<Outcome<AssetView, 'asset_not_found'>> {
	const [row] = await assetsWithCatalogue()
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
} as const satisfies Record<string, RegisterAssetFailure>;

function assetCollision(error: unknown): RegisterAssetFailure | null {
	const constraint = uniqueConstraintName(error);
	if (constraint === null) return null;

	return constraint in ASSET_COLLISIONS
		? ASSET_COLLISIONS[constraint as keyof typeof ASSET_COLLISIONS]
		: null;
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
		const collision = assetCollision(error);
		if (collision === null) throw error;
		return failure(collision);
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

		await tx
			.update(assets)
			.set({ custodianPersonId: null, updatedAt: new Date() })
			.where(eq(assets.id, asset.id));

		await recordActivity(tx, {
			organisationId: actor.organisationId,
			actorPersonId: actor.personId,
			target: { assetId: asset.id },
			verb: 'custody.returned',
			payload: { fromPersonId: asset.custodianPersonId, fromPersonName: person.fullName }
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
