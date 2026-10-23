import { and, asc, eq, inArray, isNull, or, sql, type SQL } from 'drizzle-orm';
import { listActivity, type TimelineEntry } from '../activity';
import { can } from '../access/permissions';
import type { SessionUser } from '../auth/guards';
import { getDb } from '../db';
import { locationPaths } from '../directory';
import { people } from '../directory/schema';
import { failure, success, type Outcome } from '../shared/outcome';
import { page, pageWindow, type Page, type PageRequest } from '../shared/pagination';
import { assetModels, assets, categories, manufacturers } from './schema';
import { requireAssetScope } from './scope';
import { viewAsset, type AssetView } from './view';

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
