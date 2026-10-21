import { and, asc, eq } from 'drizzle-orm';
import {
	HANDOVER_CONDITIONS,
	conditionNotes,
	type HandoverCondition
} from '#lib/domain/handover.js';
import type { SessionUser } from '../auth/guards';
import { getDb, type Executor } from '../db';
import { people } from '../directory/schema';
import { sendQuietly, type Mailer } from '../shared/mail';
import { failure, success, type Outcome } from '../shared/outcome';
import { runtimeMailer } from '../shared/runtime';
import { recordCustodyReturned } from './custody';
import {
	issueHandover,
	lockOperationAssets,
	prepareHandover,
	type IssueDeps,
	type PendingHandover
} from './handover-issue';
import { assetModels, assets, categories } from './schema';

/**
 * Taking assets back from a person: `deliver`'s counterpart (#278, ADR 0035
 * decision 9).
 *
 * Every custody is returned at once, or none. The technician records each
 * asset's condition, and that recorded, authenticated action is their side of
 * the return. When any asset's category requires a handover, the same
 * transaction issues a pending `return` handover for the person to sign; the
 * custody is returned whether or not they ever do.
 *
 * The condition is a statement, not a state change: a `damaged` laptop stays in
 * whatever lifecycle state it was in until the technician changes it.
 */

export interface TakeBackItem {
	assetId: string;
	condition: HandoverCondition;
	/** Optional for `good`, required otherwise (`MAX_CONDITION_NOTES` at most). */
	notes?: string | null;
}

export interface TakeBackDeps extends IssueDeps {
	mailer?: Mailer | null;
	now?: () => Date;
}

export type TakeBackFailure =
	| 'no_assets'
	| 'duplicate_asset'
	| 'invalid_condition'
	| 'asset_not_found'
	| 'person_not_found'
	| 'not_in_custody'
	| 'no_return_template';

export async function takeBack(
	actor: SessionUser,
	personId: string,
	items: readonly TakeBackItem[],
	deps: TakeBackDeps = {}
): Promise<Outcome<{ handover: PendingHandover | null }, TakeBackFailure>> {
	const mailer = deps.mailer === undefined ? runtimeMailer() : deps.mailer;
	const now = (deps.now ?? (() => new Date()))();

	if (items.length === 0) return failure('no_assets');
	// Two conditions for one asset is a question with no answer, not a duplicate to drop.
	if (new Set(items.map((item) => item.assetId)).size !== items.length) {
		return failure('duplicate_asset');
	}

	const conditions = new Map<string, { condition: HandoverCondition; notes: string | null }>();
	for (const item of items) {
		if (!HANDOVER_CONDITIONS.includes(item.condition)) return failure('invalid_condition');
		const notes = conditionNotes(item.condition, item.notes);
		if (!notes.ok) return failure('invalid_condition');
		conditions.set(item.assetId, { condition: item.condition, notes: notes.notes });
	}

	const outcome = await getDb().transaction(async (tx) => {
		const [person] = await tx
			.select({ id: people.id, fullName: people.fullName, email: people.email })
			.from(people)
			.where(and(eq(people.id, personId), eq(people.organisationId, actor.organisationId)))
			.limit(1);
		if (!person) return failure('person_not_found' as const);

		const locked = await lockOperationAssets(tx, actor.organisationId, [...conditions.keys()]);
		if (locked.length !== conditions.size) return failure('asset_not_found' as const);
		// `returnCustody`'s refusal, per asset: each one must be held, and by this person.
		if (locked.some((row) => row.custodianPersonId !== person.id)) {
			return failure('not_in_custody' as const);
		}
		const rows = locked.map((row) => ({ ...row, condition: conditions.get(row.id)! }));

		// Resolved before anything is written: a refusal must leave every custody in place.
		const prepared = await prepareHandover(tx, actor.organisationId, 'return', rows);
		if (prepared === 'no_template') return failure('no_return_template' as const);

		for (const row of rows) {
			await recordCustodyReturned(tx, actor, row.id, person, row.condition);
		}

		if (!prepared) return success({ handover: null, mail: null });
		const issued = await issueHandover(
			tx,
			actor,
			{ direction: 'return', prepared },
			person,
			rows,
			now,
			deps
		);
		await deps.afterIssue?.(tx, issued.handover);
		// Only a delivery can be waived, so a return is always pending.
		if (issued.handover.status !== 'pending') throw new Error('A return cannot be waived.');
		return success({ handover: issued.handover, mail: issued.mail });
	});

	if (!outcome.ok) return outcome;

	// After commit and not awaited: a failed send changes nothing (ADR 0006, 0035).
	if (outcome.value.mail) void sendQuietly(mailer, outcome.value.mail);

	return success({ handover: outcome.value.handover });
}

export interface HeldAsset {
	id: string;
	assetTag: string;
	name: string;
	requiresHandover: boolean;
}

/** A person's current assets for the take-back picker, scoped to the organisation. */
export async function listAssetsHeldBy(
	organisationId: string,
	personId: string,
	executor: Executor = getDb()
): Promise<HeldAsset[]> {
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
		.where(and(eq(assets.organisationId, organisationId), eq(assets.custodianPersonId, personId)))
		.orderBy(asc(assets.assetTag))
		.limit(500);
}
