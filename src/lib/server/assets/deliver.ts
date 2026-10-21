import { and, asc, eq, isNull } from 'drizzle-orm';
import { can } from '../access/permissions';
import type { SessionUser } from '../auth/guards';
import { getDb, type Executor } from '../db';
import { people } from '../directory/schema';
import { sendQuietly, type Mailer } from '../shared/mail';
import { failure, success, type Outcome } from '../shared/outcome';
import { runtimeMailer } from '../shared/runtime';
import { recordCustodyAssigned } from './custody';
import {
	issueHandover,
	lockOperationAssets,
	prepareHandover,
	type IssueDeps,
	type IssuedHandover
} from './handover-issue';
import { assetModels, assets, categories } from './schema';

/**
 * Delivering assets to a person: the operation a technician performs (ADR 0035).
 *
 * Custody is recorded at once, for every asset, or for none. When any asset's
 * category requires a handover, the same transaction also issues a pending one
 * listing all of them, with the rendered agreement and a single-use token; or,
 * when the actor waives it, a `waived` one with the reason and nothing to sign.
 */

export interface DeliverDeps extends IssueDeps {
	mailer?: Mailer | null;
	now?: () => Date;
}

export interface DeliverRequest {
	personId: string;
	assetIds: readonly string[];
	/**
	 * Records the required handover as waived instead of asking for a signature
	 * (ADR 0035, decision 8). Needs `assets.handover.waive`, and a handover that
	 * is actually required.
	 */
	waive?: { reason: string };
}

export type DeliverFailure =
	| 'no_assets'
	| 'asset_not_found'
	| 'person_not_found'
	| 'already_in_custody'
	| 'no_delivery_template'
	| 'waive_forbidden'
	| 'waive_not_required'
	| 'invalid_waive_reason';

/** The bounds of a waiver's reason, after trimming. */
export const WAIVE_REASON_MAX = 500;

export type DeliveredHandover = IssuedHandover;

export async function deliver(
	actor: SessionUser,
	request: DeliverRequest,
	deps: DeliverDeps = {}
): Promise<Outcome<{ handover: DeliveredHandover | null }, DeliverFailure>> {
	const mailer = deps.mailer === undefined ? runtimeMailer() : deps.mailer;
	const now = (deps.now ?? (() => new Date()))();

	const ids = [...new Set(request.assetIds)];
	if (ids.length === 0) return failure('no_assets');

	let waiveReason: string | null = null;
	if (request.waive) {
		// Admins only. A service account never qualifies: it cannot have the admin
		// role (`service_accounts_not_admin`), and the API offers no waive option.
		if (!can(actor, 'assets.handover.waive')) return failure('waive_forbidden');
		waiveReason = request.waive.reason.trim();
		if (waiveReason.length === 0 || waiveReason.length > WAIVE_REASON_MAX) {
			return failure('invalid_waive_reason');
		}
	}

	const outcome = await getDb().transaction(async (tx) => {
		const [person] = await tx
			.select({ id: people.id, fullName: people.fullName, email: people.email })
			.from(people)
			.where(and(eq(people.id, request.personId), eq(people.organisationId, actor.organisationId)))
			.limit(1);
		if (!person) return failure('person_not_found' as const);

		const rows = await lockOperationAssets(tx, actor.organisationId, ids);
		if (rows.length !== ids.length) return failure('asset_not_found' as const);
		if (rows.some((row) => row.custodianPersonId !== null)) {
			return failure('already_in_custody' as const);
		}

		const required = rows.some((row) => row.requiresHandover);
		// A waiver of nothing would be a record that means nothing.
		if (waiveReason !== null && !required) return failure('waive_not_required' as const);

		// Resolved before anything is written: a refusal must leave no custody behind.
		// A waiver has nothing to render, so it needs no template.
		const prepared =
			waiveReason === null
				? await prepareHandover(tx, actor.organisationId, 'delivery', rows)
				: null;
		if (prepared === 'no_template') return failure('no_delivery_template' as const);

		for (const row of rows) await recordCustodyAssigned(tx, actor, row.id, person);

		if (!required) return success({ handover: null, mail: null });
		const issued = await issueHandover(
			tx,
			actor,
			{ direction: 'delivery', prepared, waiveReason },
			person,
			rows,
			now,
			deps
		);
		await deps.afterIssue?.(tx, issued.handover);
		return success(issued);
	});

	if (!outcome.ok) return outcome;

	// After commit and not awaited: a failed send changes nothing (ADR 0006, 0035).
	if (outcome.value.mail) void sendQuietly(mailer, outcome.value.mail);

	return success({ handover: outcome.value.handover });
}

export interface DeliverableAsset {
	id: string;
	assetTag: string;
	name: string;
	/** Delivering this asset makes a handover necessary (its category requires one). */
	requiresHandover: boolean;
}

export interface DeliverableFilter {
	/**
	 * Only in-stock assets of this category: what an equipment request asked for
	 * (#271). The technician is not bound to it; the filter narrows the picker,
	 * and `deliver` itself accepts any asset nobody holds.
	 */
	categoryId?: string;
}

/** The assets nobody holds, for the delivery picker. Bounded: a picker is not a report. */
export async function listDeliverableAssets(
	organisationId: string,
	executor: Executor = getDb(),
	filter: DeliverableFilter = {}
): Promise<DeliverableAsset[]> {
	return executor
		.select({
			id: assets.id,
			assetTag: assets.assetTag,
			name: assets.name,
			requiresHandover: categories.requiresHandover
		})
		.from(assets)
		.innerJoin(assetModels, eq(assetModels.id, assets.assetModelId))
		.innerJoin(categories, eq(categories.id, assetModels.categoryId))
		.where(
			and(
				eq(assets.organisationId, organisationId),
				isNull(assets.custodianPersonId),
				filter.categoryId
					? and(eq(categories.id, filter.categoryId), eq(assets.state, 'in_stock'))
					: undefined
			)
		)
		.orderBy(asc(assets.assetTag))
		.limit(500);
}
