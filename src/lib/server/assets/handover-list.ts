import { and, asc, count, desc, eq, gt, inArray, lte, or, sql, type SQL } from 'drizzle-orm';
import {
	DEFAULT_HANDOVER_STATES,
	deriveHandoverState,
	HANDOVER_STATES,
	type HandoverCondition,
	type HandoverState
} from '#lib/domain/handover.js';
import { can } from '../access/permissions';
import { listActivity, type TimelineEntry } from '../activity';
import { serviceAccountName } from '../api/service-accounts';
import type { SessionUser } from '../auth/guards';
import { getDb } from '../db';
import { people } from '../directory/schema';
import { failure, success, type Outcome } from '../shared/outcome';
import type { HandoverDirection } from './handover-template';
import { assets, handoverAssets, handovers } from './schema';

/**
 * Reading handovers back (#280): the staff list, one handover's detail, and an
 * employee's own. The state is always `deriveHandoverState`, never a column, so
 * a pending handover past its date reads as expired with nothing written.
 *
 * Staff reads need `assets.view`; the route calls `requirePermission` first and
 * a function reached without it throws, like the service accounts' do. The
 * employee read is scoped to the viewer's own person instead.
 */

/** The list is a work queue, not a report: it is bounded rather than paged. */
export const HANDOVER_LIST_LIMIT = 200;

export interface HandoverFilter {
	/** Defaults to `DEFAULT_HANDOVER_STATES`. */
	states?: readonly HandoverState[];
	direction?: HandoverDirection;
	personId?: string;
	/** Every handover that listed this asset, for the asset page. */
	assetId?: string;
}

export interface HandoverListItem {
	id: string;
	code: string;
	direction: HandoverDirection;
	state: HandoverState;
	personId: string;
	personName: string;
	assetCount: number;
	issuedAt: Date;
	expiresAt: Date | null;
	/** The technician, or the integration that issued it. `null` if neither survives. */
	issuedByName: string | null;
	/** A decided handover whose document was never generated reads `false`. */
	hasDocument: boolean;
}

export interface ReadDeps {
	now?: () => Date;
}

function requireStaff(viewer: SessionUser): void {
	if (!can(viewer, 'assets.view')) {
		throw new Error(
			`The ${viewer.role} role cannot read the handover list; the route should have called requirePermission first.`
		);
	}
}

/** One derived state as the stored columns that mean it. */
function stateCondition(state: HandoverState, now: Date): SQL {
	switch (state) {
		case 'pending':
			return and(eq(handovers.status, 'pending'), gt(handovers.expiresAt, now))!;
		case 'expired':
			return and(eq(handovers.status, 'pending'), lte(handovers.expiresAt, now))!;
		default:
			return eq(handovers.status, state);
	}
}

async function rowsOf(
	conditions: SQL[],
	now: Date,
	limit = HANDOVER_LIST_LIMIT
): Promise<HandoverListItem[]> {
	const assetCount = getDb()
		.select({ handoverId: handoverAssets.handoverId, assetCount: count().as('asset_count') })
		.from(handoverAssets)
		.groupBy(handoverAssets.handoverId)
		.as('asset_counts');

	const rows = await getDb()
		.select({
			id: handovers.id,
			code: handovers.code,
			direction: handovers.direction,
			status: handovers.status,
			personId: handovers.personId,
			personName: handovers.personNameSnapshot,
			assetCount: assetCount.assetCount,
			issuedAt: handovers.issuedAt,
			expiresAt: handovers.expiresAt,
			organisationId: handovers.organisationId,
			hasDocument: sql<boolean>`${handovers.documentStorageKey} is not null`,
			issuerName: people.fullName,
			issuerServiceAccountId: handovers.issuedByServiceAccountId
		})
		.from(handovers)
		.innerJoin(assetCount, eq(assetCount.handoverId, handovers.id))
		.leftJoin(people, eq(people.id, handovers.issuedByPersonId))
		.where(and(...conditions))
		.orderBy(desc(handovers.issuedAt), desc(handovers.code))
		.limit(limit);

	const accounts = new Map<string, string | null>();
	for (const row of rows) {
		if (row.issuerServiceAccountId && !accounts.has(row.issuerServiceAccountId)) {
			accounts.set(
				row.issuerServiceAccountId,
				await serviceAccountName(row.organisationId, row.issuerServiceAccountId)
			);
		}
	}

	return rows.map((row) => ({
		id: row.id,
		code: row.code,
		direction: row.direction,
		state: deriveHandoverState(row, now),
		personId: row.personId,
		personName: row.personName,
		assetCount: Number(row.assetCount),
		hasDocument: row.hasDocument,
		issuedAt: row.issuedAt,
		expiresAt: row.expiresAt,
		issuedByName:
			row.issuerName ??
			(row.issuerServiceAccountId ? (accounts.get(row.issuerServiceAccountId) ?? null) : null)
	}));
}

/** The organisation's handovers, newest first, filtered by derived state. */
export async function listHandovers(
	viewer: SessionUser,
	filter: HandoverFilter = {},
	deps: ReadDeps = {}
): Promise<HandoverListItem[]> {
	requireStaff(viewer);
	const now = (deps.now ?? (() => new Date()))();
	const states = filter.states?.length ? filter.states : DEFAULT_HANDOVER_STATES;

	const conditions: SQL[] = [
		eq(handovers.organisationId, viewer.organisationId),
		or(...states.map((state) => stateCondition(state, now)))!
	];
	if (filter.direction) conditions.push(eq(handovers.direction, filter.direction));
	if (filter.personId) conditions.push(eq(handovers.personId, filter.personId));
	if (filter.assetId) {
		conditions.push(
			inArray(
				handovers.id,
				getDb()
					.select({ id: handoverAssets.handoverId })
					.from(handoverAssets)
					.where(eq(handoverAssets.assetId, filter.assetId))
			)
		);
	}
	return rowsOf(conditions, now);
}

/** The handovers of an employee who may only see their own (`assets.view.own`), whatever their state. */
export async function listOwnHandovers(
	viewer: SessionUser,
	deps: ReadDeps = {}
): Promise<HandoverListItem[]> {
	if (!can(viewer, 'assets.view.own') || !viewer.personId) return [];
	const now = (deps.now ?? (() => new Date()))();
	return rowsOf(
		[
			eq(handovers.organisationId, viewer.organisationId),
			eq(handovers.personId, viewer.personId),
			// A waiver or a link not yet decided is not the employee's to open or download.
			inArray(handovers.status, ['pending', 'accepted', 'rejected'])
		],
		now
	);
}

export interface HandoverDetailAsset {
	assetId: string;
	/** The live tag, to link to the asset; `null` never happens while the foreign key restricts deletes. */
	currentTag: string | null;
	assetTag: string;
	name: string;
	serial: string | null;
	model: string;
	condition: HandoverCondition | null;
	conditionNotes: string | null;
}

export interface HandoverDetail extends HandoverListItem {
	body: string | null;
	bodySha256: string | null;
	recipientEmail: string;
	waiveReason: string | null;
	decidedAt: Date | null;
	decisionReason: string | null;
	signerIp: string | null;
	signerUserAgent: string | null;
	hasSignature: boolean;
	documentSha256: string | null;
	assets: HandoverDetailAsset[];
	/** This handover's own entries, newest first. */
	activity: TimelineEntry[];
}

export async function getHandover(
	viewer: SessionUser,
	code: string,
	deps: ReadDeps = {}
): Promise<Outcome<HandoverDetail, 'not_found'>> {
	requireStaff(viewer);
	const now = (deps.now ?? (() => new Date()))();

	const [row] = await getDb()
		.select({
			id: handovers.id,
			personId: handovers.personId,
			recipientEmail: handovers.recipientEmailSnapshot,
			body: handovers.bodySnapshot,
			bodySha256: handovers.bodySha256,
			waiveReason: handovers.waiveReason,
			decidedAt: handovers.decidedAt,
			decisionReason: handovers.decisionReason,
			signerIp: sql<string | null>`host(${handovers.signerIp})`,
			signerUserAgent: handovers.signerUserAgent,
			signatureKey: handovers.signatureStorageKey,
			documentSha256: handovers.documentSha256
		})
		.from(handovers)
		.where(and(eq(handovers.code, code), eq(handovers.organisationId, viewer.organisationId)))
		.limit(1);
	if (!row) return failure('not_found');

	const [[item], detailAssets, entries] = await Promise.all([
		rowsOf([eq(handovers.id, row.id)], now, 1),
		getDb()
			.select({
				assetId: handoverAssets.assetId,
				currentTag: assets.assetTag,
				assetTag: handoverAssets.assetTagSnapshot,
				name: handoverAssets.assetNameSnapshot,
				serial: handoverAssets.serialSnapshot,
				model: handoverAssets.modelSnapshot,
				condition: handoverAssets.condition,
				conditionNotes: handoverAssets.conditionNotes
			})
			.from(handoverAssets)
			.leftJoin(assets, eq(assets.id, handoverAssets.assetId))
			.where(eq(handoverAssets.handoverId, row.id))
			.orderBy(asc(handoverAssets.assetTagSnapshot)),
		personEntries(viewer.organisationId, row.personId, row.id)
	]);

	return success({
		...item,
		body: row.body,
		bodySha256: row.bodySha256,
		recipientEmail: row.recipientEmail,
		waiveReason: row.waiveReason,
		decidedAt: row.decidedAt,
		decisionReason: row.decisionReason,
		signerIp: row.signerIp,
		signerUserAgent: row.signerUserAgent,
		hasSignature: row.signatureKey !== null,
		documentSha256: row.documentSha256,
		assets: detailAssets,
		activity: entries
	});
}

/**
 * Every handover entry is written on the person as well as on each asset, so
 * the person's log holds each exactly once. Filtering on the payload's id keeps
 * only this handover's.
 */
async function personEntries(
	organisationId: string,
	personId: string,
	handoverId: string
): Promise<TimelineEntry[]> {
	const entries = await listActivity({
		organisationId,
		target: { personId },
		limit: 500
	});
	return entries.filter(
		(entry) =>
			entry.verb.startsWith('handover.') &&
			(entry.payload as { handoverId?: string }).handoverId === handoverId
	);
}

/**
 * The indicator on an asset page: the state of the handover that covers the
 * current custody, or `none_required` when nobody holds the asset or no
 * delivery to its holder needed a signature.
 */
export type CustodyHandover =
	{ kind: 'none_required' } | { kind: 'handover'; code: string; state: HandoverState };

export async function custodyHandover(
	viewer: SessionUser,
	asset: { id: string; custodianPersonId: string | null },
	deps: ReadDeps = {}
): Promise<CustodyHandover> {
	if (!asset.custodianPersonId) return { kind: 'none_required' };
	const [latest] = await listHandovers(
		viewer,
		{
			states: HANDOVER_STATES,
			assetId: asset.id,
			personId: asset.custodianPersonId,
			direction: 'delivery'
		},
		deps
	);
	return latest
		? { kind: 'handover', code: latest.code, state: latest.state }
		: { kind: 'none_required' };
}
