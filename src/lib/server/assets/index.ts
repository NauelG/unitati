import { and, asc, desc, eq, inArray, isNull, or, sql, type SQL } from 'drizzle-orm';
import type { AssetState } from '#lib/domain/status.js';
import { listActivity, actorColumns, recordActivity, type TimelineEntry } from '../activity';
import { can } from '../access/permissions';
import type { SessionUser } from '../auth/guards';
import { getDb, type Executor, type Transaction } from '../db';
import { uniqueConstraintName } from '../db/errors';
import { locationPaths } from '../directory';
import { people } from '../directory/schema';
import { checkCommentBody, type CommentBodyFailure, type CommentView } from '../shared/comments';
import { failure, success, type Outcome } from '../shared/outcome';
import type { WriteOptions } from '../shared/write-options';
import { page, pageWindow, type Page, type PageRequest } from '../shared/pagination';
import {
	assetComments,
	assetModels,
	assets,
	categories,
	handoverAssets,
	manufacturers
} from './schema';
import { recordCustodyAssigned, recordCustodyReturned } from './custody';
import { requireAssetScope } from './scope';
import { viewAsset, type AssetView } from './view';
import { registerAssetInput, updateAssetDetailsInput } from './validation';
import type { RegisterAssetInput, UpdateAssetDetailsInput } from './validation';

export { viewAsset } from './view';
export type { AssetView, FullAssetView, SharedAssetView } from './view';

/**
 * What `links` reads of an asset, a handover or a category to relate a ticket to
 * it (ADR 0002). The row scope itself (`scope.ts`) stays inside the domain.
 */
export {
	assetSnapshot,
	assetSummaries,
	categoryInOrganisation,
	findAssetInScope,
	handoverByCode,
	handoverInOrganisation,
	handoverSummaries
} from './link-targets';
export type { AssetLinkTarget, AssetLinkSummary, HandoverSummary } from './link-targets';

/** Asset registrations per day, for the KPI sparkline (#90). */
export { assetRegistrationsSparkline } from './sparkline';

/** Files attached to an asset: invoice, warranty, delivery note (ADR 0039). */
export {
	addAssetAttachments,
	getAssetAttachment,
	listAssetAttachments,
	readAssetAttachmentForm,
	removeAssetAttachment
} from './attachments';
export type {
	AddAssetAttachmentsFailure,
	AssetAttachmentBytes,
	AssetAttachmentDeps,
	AssetAttachmentView,
	RemoveAssetAttachmentFailure
} from './attachments';

/** Count per lifecycle state, for the donut on the assets index (#90). */
export { assetStateDistribution } from './state-distribution';
export type { AssetStateSlice } from './state-distribution';

export {
	listHandoverAgreements,
	listHandoverTemplateVersions,
	saveHandoverTemplate,
	removeHandoverOverride,
	getHandoverSettings,
	setHandoverLinkValidDays,
	setCategoryRequiresHandover,
	ensureDefaultHandoverTemplates,
	LINK_VALID_DAYS_DEFAULT,
	LINK_VALID_DAYS_MIN,
	LINK_VALID_DAYS_MAX
} from './handover-templates';
export type {
	HandoverAgreement,
	HandoverSettings,
	HandoverTemplateVersion,
	RemoveHandoverOverrideFailure,
	SaveHandoverTemplateFailure
} from './handover-templates';
export { deliver, listDeliverableAssets, WAIVE_REASON_MAX } from './deliver';
export { takeBack, listAssetsHeldBy } from './take-back';
export { signingLinkQr } from './handover-qr';
export type { HeldAsset, TakeBackDeps, TakeBackFailure, TakeBackItem } from './take-back';
export { decideHandover, openHandover } from './handover-decision';
export { ensureHandoverDocument, getHandoverDocument } from './handover-documents';
export { regulariseCustody } from './regularise-custody';
export type {
	RegularisationResult,
	RegularisedHandover,
	RegulariseDeps,
	RegulariseFilter,
	SkippedPerson
} from './regularise-custody';
export { resendHandover } from './handover-resend';
export type { ResendDeps, ResendFailure, ResentHandover } from './handover-resend';
export {
	custodyHandover,
	getHandover,
	HANDOVER_LIST_LIMIT,
	listHandovers,
	listOwnHandovers
} from './handover-list';
export type {
	CustodyHandover,
	HandoverDetail,
	HandoverDetailAsset,
	HandoverFilter,
	HandoverListItem
} from './handover-list';
export type {
	DocumentDeps,
	EnsureDocumentFailure,
	StoredHandoverDocument
} from './handover-documents';
export type {
	DecideFailure,
	DecidedStatus,
	DecisionDeps,
	DecisionEvidence,
	HandoverDecision,
	SigningAsset,
	SigningView
} from './handover-decision';
export type {
	DeliverableAsset,
	DeliverableFilter,
	DeliverDeps,
	DeliverFailure,
	DeliveredHandover,
	DeliverRequest
} from './deliver';
export { renderHandoverTemplate, resolveHandoverTemplate } from './handover-template';

export { getLabelSettings, setLabelOwnerText } from './label-settings';
export type { LabelSettings, SetLabelOwnerTextFailure } from './label-settings';
export type { HandoverDirection } from './handover-template';

export {
	createManufacturer,
	createCategory,
	createAssetModel,
	renameManufacturer,
	renameCategory,
	updateAssetModel,
	deleteManufacturer,
	deleteCategory,
	deleteAssetModel,
	listManufacturers,
	listCategories,
	listAssetModels
} from './catalogue';
export type {
	CatalogueEntry,
	CategoryEntry,
	CatalogueFailure,
	CatalogueEditFailure,
	CatalogueDeleteFailure,
	AssetModelFailure,
	AssetModelEditFailure,
	AssetModelEntry
} from './catalogue';

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
	RESERVED_ASSET_TAGS,
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
	assetModelId: assets.assetModelId,
	modelName: assetModels.name,
	manufacturerName: manufacturers.name,
	categoryName: categories.name,
	custodianPersonId: assets.custodianPersonId,
	custodianName: people.fullName,
	locationId: assets.locationId,
	archivedAt: assets.archivedAt
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
		.leftJoin(people, eq(assets.custodianPersonId, people.id));
}

type AssetRow = Awaited<ReturnType<typeof assetsWithCatalogue>>[number];

/**
 * The rows with their location's **path**. The path is a recursion over the
 * `directory` tree (ADR 0027), so it is asked of `directory` for the whole page
 * at once instead of being joined in: one extra query per page, not per row.
 */
async function withLocationPath(
	organisationId: string,
	rows: AssetRow[]
): Promise<(AssetRow & { locationPath: string | null })[]> {
	const ids = rows.flatMap((row) => (row.locationId ? [row.locationId] : []));
	const paths = await locationPaths(organisationId, ids);
	return rows.map((row) => ({
		...row,
		locationPath: row.locationId ? (paths.get(row.locationId) ?? null) : null
	}));
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
	const where = and(
		requireAssetScope(viewer),
		term ? matchesSearch(term, wholeRows) : undefined
	) as SQL;

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

	const visible = (await withLocationPath(viewer.organisationId, rows)).map((row) =>
		viewAsset({ visibility: 'full', ...row }, viewer)
	);

	return page(visible, counted?.total ?? 0, window);
}

/** What a picker needs of an asset, and nothing it does not. */
export interface AssetChoice {
	id: string;
	assetTag: string;
	name: string;
}

/**
 * Partial matching for a box that filters as you type: "mac" has to find
 * "MacBook", which the full-text search above, matching whole words, does not.
 *
 * **Same surface rule as `matchesSearch`.** A viewer who sees whole rows matches
 * tag, name or model; one restricted to shared rows matches tag and name alone,
 * the two things their view shows, so typing cannot reveal a model.
 *
 * `%`, `_` and the escape character are escaped, so the term is text and not a
 * pattern: searching `%` finds nothing instead of everything.
 */
function containsTerm(term: string, wholeRows: boolean): SQL {
	const pattern = `%${term.replace(/[\\%_]/g, '\\$&')}%`;
	const tagOrName = or(
		sql`${assets.assetTag} ilike ${pattern}`,
		sql`${assets.name} ilike ${pattern}`
	);

	return (wholeRows ? or(tagOrName, sql`${assetModels.name} ilike ${pattern}`) : tagOrName) as SQL;
}

/** A picker shows a short list and asks again as the term narrows. */
const CHOICES = 10;

/** Nobody types a longer search; a bound keeps a pasted novel out of an `ilike`. */
const MAX_TERM_LENGTH = 100;

export interface AssetChoiceRequest {
	search?: string;
}

/**
 * The assets a viewer may pick from, for a form that attaches one to something
 * (a ticket, #9). It exists apart from `listAssets` because a shared row there
 * deliberately carries no uuid (ADR 0007) and a link needs one.
 *
 * **The id is safe to return here** because the row passed the viewer's own
 * scope first: it is the id of an asset they can already see, handed back in
 * the narrowest shape that works. Whether they may attach it is still decided
 * again where the link is written, so a picker is a convenience and not a gate.
 *
 * Bounded in rows and in term length, since the term comes from a query string,
 * and ordered by tag so the same search always answers in the same order.
 */
export async function listAssetChoices(
	viewer: SessionUser,
	request: AssetChoiceRequest = {}
): Promise<AssetChoice[]> {
	const wholeRows = can(viewer, 'assets.view');
	const term = request.search?.trim().slice(0, MAX_TERM_LENGTH);

	return getDb()
		.select({ id: assets.id, assetTag: assets.assetTag, name: assets.name })
		.from(assets)
		.innerJoin(assetModels, eq(assets.assetModelId, assetModels.id))
		.where(and(requireAssetScope(viewer), term ? containsTerm(term, wholeRows) : undefined))
		.orderBy(asc(assets.assetTag))
		.limit(CHOICES);
}

/** An asset choice in the `{ value, label }` shape `SearchSelectField` reads: `AST-0142 · Nombre`. */
export function toAssetOption(choice: AssetChoice): { value: string; label: string } {
	return { value: choice.id, label: `${choice.assetTag} · ${choice.name}` };
}

/** Assets per location, direct only: a floor's count does not include its rooms'. */
export async function countAssetsByLocation(organisationId: string): Promise<Map<string, number>> {
	const rows = await getDb()
		.select({ locationId: assets.locationId, count: sql<number>`count(*)::int` })
		.from(assets)
		.where(and(eq(assets.organisationId, organisationId), sql`${assets.locationId} is not null`))
		.groupBy(assets.locationId);
	return new Map(
		rows.flatMap((row) => (row.locationId ? [[row.locationId, row.count] as const] : []))
	);
}

/**
 * The count `AppShell` prints beside the Assets link: every asset not
 * `retired`. Takes a bare `organisationId` rather than a `SessionUser` — the
 * sidebar link is already hidden from anyone without an asset-read permission,
 * so nothing here needs redacting per viewer, as with `listManufacturers`.
 */
/** How many assets, in any state, the person holds as custodian: what deactivating them leaves behind. */
export async function countAssetsInCustodyOf(
	organisationId: string,
	personId: string
): Promise<number> {
	const [row] = await getDb()
		.select({ count: sql<number>`count(*)::int` })
		.from(assets)
		.where(and(eq(assets.organisationId, organisationId), eq(assets.custodianPersonId, personId)));
	return row?.count ?? 0;
}

export async function countActive(organisationId: string): Promise<number> {
	const [row] = await getDb()
		.select({ count: sql<number>`count(*)::int` })
		.from(assets)
		.where(
			and(
				eq(assets.organisationId, organisationId),
				sql`${assets.state} <> 'retired'`,
				isNull(assets.archivedAt)
			)
		);
	return row?.count ?? 0;
}

export interface AssetSummary {
	/** Every asset the viewer may see, every state included — unlike `countActive`, which drops `retired`. */
	total: number;
	/** `in_use`: deployed to someone or somewhere, as opposed to sitting `in_stock` or `in_repair`. */
	inService: number;
	/** No custodian at all, regardless of state — a retired asset nobody holds still counts. */
	unassigned: number;
}

/**
 * The Overview KPI and the live `PageHeader` summary on `/assets` (#84): three
 * counts in one round trip, scoped by `requireAssetScope` so an employee
 * restricted to their own and shared rows reads a summary that agrees with
 * the list they are looking at, not the whole inventory.
 */
export async function assetSummary(viewer: SessionUser): Promise<AssetSummary> {
	const [row] = await getDb()
		.select({
			total: sql<number>`count(*)::int`,
			inService: sql<number>`count(*) filter (where ${assets.state} = 'in_use')::int`,
			unassigned: sql<number>`count(*) filter (where ${assets.custodianPersonId} is null)::int`
		})
		.from(assets)
		.where(requireAssetScope(viewer));

	return {
		total: row?.total ?? 0,
		inService: row?.inService ?? 0,
		unassigned: row?.unassigned ?? 0
	};
}

/**
 * Resolves asset tags to ids for a caller that addresses assets by tag (the
 * API, ADR 0022). Only what the viewer may see comes back, through the same
 * `requireAssetScope` every read here starts from: a tag that is missing from
 * the result is either unknown or invisible, and the caller cannot tell which.
 * A viewer who holds no asset-read permission sees nothing rather than
 * tripping the scope's invariant, because a key's scopes can legitimately omit it.
 */
export async function resolveAssetTags(
	viewer: SessionUser,
	assetTags: readonly string[]
): Promise<Map<string, string>> {
	if (assetTags.length === 0) return new Map();
	if (
		!can(viewer, 'assets.view') &&
		!can(viewer, 'assets.view.own') &&
		!can(viewer, 'assets.view.shared')
	) {
		return new Map();
	}

	const rows = await getDb()
		.select({ id: assets.id, assetTag: assets.assetTag })
		.from(assets)
		.where(and(requireAssetScope(viewer), inArray(assets.assetTag, [...assetTags])));

	return new Map(rows.map((row) => [row.assetTag, row.id]));
}

/**
 * What a printed label needs of each asset (ADR 0038): the tag and the name,
 * in the order of `assetTags`. Same visibility rule as `resolveAssetTags`: a
 * tag that is not in the result is unknown or invisible, and nobody can tell
 * which. Serial, custodian and location are deliberately not selected.
 */
export async function listAssetsByTags(
	viewer: SessionUser,
	assetTags: readonly string[]
): Promise<{ assetTag: string; name: string }[]> {
	if (assetTags.length === 0) return [];
	if (
		!can(viewer, 'assets.view') &&
		!can(viewer, 'assets.view.own') &&
		!can(viewer, 'assets.view.shared')
	) {
		return [];
	}

	const rows = await getDb()
		.select({ assetTag: assets.assetTag, name: assets.name })
		.from(assets)
		.where(and(requireAssetScope(viewer), inArray(assets.assetTag, [...assetTags])));

	const byTag = new Map(rows.map((row) => [row.assetTag, row]));
	return assetTags.flatMap((tag) => byTag.get(tag) ?? []);
}

/** The asset behind a `/assets/AST-0142` URL (ADR 0010), redacted for its viewer. */
export async function getAssetByTag(
	viewer: SessionUser,
	assetTag: string
): Promise<Outcome<AssetView, 'asset_not_found'>> {
	const [row] = await assetsWithCatalogue()
		.where(
			and(
				requireAssetScope(viewer, { includeArchived: can(viewer, 'assets.manage') }),
				eq(assets.assetTag, assetTag)
			)
		)
		.limit(1);

	if (!row) return failure('asset_not_found');

	const [withPath] = await withLocationPath(viewer.organisationId, [row]);
	return success(viewAsset({ visibility: 'full', ...withPath }, viewer));
}

/**
 * The events half of an asset's timeline (ADR 0009 merges in live relations at
 * read time: the page hands this and `links.relatedTo` to `mergeAssetTimeline`).
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
 * Loads an asset for writing, inside the caller's transaction and scoped to the
 * actor's organisation. Returns null rather than throwing so each caller can
 * name its own failure.
 */
async function lockedAsset(
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

export { assetHits } from './search';
