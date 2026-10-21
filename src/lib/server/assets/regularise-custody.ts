import { and, asc, eq, inArray, isNotNull, notExists, sql } from 'drizzle-orm';
import { can } from '../access/permissions';
import type { SessionUser } from '../auth/guards';
import { getDb, type Executor, type Transaction } from '../db';
import { people } from '../directory/schema';
import { sendQuietly, type Mailer, type MailMessage } from '../shared/mail';
import { runtimeMailer } from '../shared/runtime';
import {
	issueHandover,
	lockOperationAssets,
	prepareHandover,
	type IssueDeps,
	type PendingHandover
} from './handover-issue';
import { assetModels, assets, handoverAssets, handovers } from './schema';

/**
 * Regularising custody that already exists (#281, ADR 0035, decision 1): people
 * hold equipment that was recorded by hand, by CSV import or by the seed, so no
 * one ever signed for it. A handover is its own record, so one can be issued
 * for custody that is already there, without touching it.
 *
 * One operation serves a single person and a campaign alike: the filter says
 * whose custody and which categories; the result is one pending delivery
 * handover per person.
 *
 * "Covered" is what makes it safe to run twice: an asset a person holds already
 * has a delivery handover for them that is pending, accepted or waived. A
 * rejected one does not cover it (the technician resolves a rejection by issuing
 * a new handover, decision 1), and a pending one is skipped rather than
 * duplicated, so a re-run never sends a second link for the same equipment.
 */

export interface RegulariseDeps extends IssueDeps {
	mailer?: Mailer | null;
	now?: () => Date;
}

export interface RegulariseFilter {
	/** Only this person's custody. */
	personId?: string;
	/** Only the assets of this category. */
	categoryId?: string;
}

export interface RegularisedHandover extends PendingHandover {
	personId: string;
	personName: string;
	assetCount: number;
}

/** Why a person got no handover: `no_requirement` (nothing they hold needs one) or `no_template`. */
export interface SkippedPerson {
	personId: string;
	personName: string;
	reason: 'no_requirement' | 'no_template';
}

export interface RegularisationResult {
	issued: RegularisedHandover[];
	skipped: SkippedPerson[];
}

/** The delivery handover states that already answer for custody. */
const COVERING_STATES = ['pending', 'accepted', 'waived'] as const;

/** Held assets with no covering delivery handover for their current holder. */
function uncoveredCustody(
	executor: Executor,
	organisationId: string,
	filter: RegulariseFilter,
	ids?: readonly string[]
) {
	return executor
		.select({ id: assets.id, personId: assets.custodianPersonId })
		.from(assets)
		.innerJoin(assetModels, eq(assetModels.id, assets.assetModelId))
		.where(
			and(
				eq(assets.organisationId, organisationId),
				isNotNull(assets.custodianPersonId),
				filter.personId ? eq(assets.custodianPersonId, filter.personId) : undefined,
				filter.categoryId ? eq(assetModels.categoryId, filter.categoryId) : undefined,
				ids ? inArray(assets.id, [...ids]) : undefined,
				notExists(
					executor
						.select({ one: sql`1` })
						.from(handoverAssets)
						.innerJoin(handovers, eq(handovers.id, handoverAssets.handoverId))
						.where(
							and(
								eq(handoverAssets.assetId, assets.id),
								eq(handovers.personId, assets.custodianPersonId),
								eq(handovers.direction, 'delivery'),
								inArray(handovers.status, [...COVERING_STATES])
							)
						)
				)
			)
		)
		.orderBy(asc(assets.id));
}

export async function regulariseCustody(
	actor: SessionUser,
	filter: RegulariseFilter = {},
	deps: RegulariseDeps = {}
): Promise<RegularisationResult> {
	if (!can(actor, 'assets.manage')) {
		throw new Error(
			`The ${actor.role} role cannot regularise custody; the route should have called requirePermission first (assets.manage).`
		);
	}
	const mailer = deps.mailer === undefined ? runtimeMailer() : deps.mailer;
	const now = (deps.now ?? (() => new Date()))();

	const candidates = await uncoveredCustody(getDb(), actor.organisationId, filter);
	const byPerson = new Map<string, string[]>();
	for (const { id, personId } of candidates) {
		if (personId === null) continue;
		byPerson.set(personId, [...(byPerson.get(personId) ?? []), id]);
	}

	const result: RegularisationResult = { issued: [], skipped: [] };
	const mails: MailMessage[] = [];
	for (const [personId, ids] of byPerson) {
		// One transaction per person: a campaign over hundreds of people must not
		// hold every asset lock at once, nor lose the rest to one refusal.
		const outcome = await getDb().transaction((tx) =>
			regulariseOne(tx, actor, { personId, ids, filter }, now, deps)
		);
		if (outcome === null) continue;
		if ('reason' in outcome) result.skipped.push(outcome);
		else {
			result.issued.push(outcome.issued);
			if (outcome.mail) mails.push(outcome.mail);
		}
	}

	// After commit and not awaited: a failed send changes nothing (ADR 0006, 0035).
	for (const mail of mails) void sendQuietly(mailer, mail);
	return result;
}

async function regulariseOne(
	tx: Transaction,
	actor: SessionUser,
	target: { personId: string; ids: readonly string[]; filter: RegulariseFilter },
	now: Date,
	deps: IssueDeps
): Promise<SkippedPerson | { issued: RegularisedHandover; mail: MailMessage | null } | null> {
	const [person] = await tx
		.select({ id: people.id, fullName: people.fullName, email: people.email })
		.from(people)
		.where(and(eq(people.id, target.personId), eq(people.organisationId, actor.organisationId)))
		.limit(1);
	if (!person) return null;

	// Locked, then re-read: between the scan and the lock another operation may
	// have returned the asset or covered it, and a handover must not claim custody
	// that is gone.
	const locked = await lockOperationAssets(tx, actor.organisationId, target.ids);
	const stillUncovered = new Set(
		(await uncoveredCustody(tx, actor.organisationId, target.filter, target.ids))
			.filter((row) => row.personId === person.id)
			.map((row) => row.id)
	);
	const rows = locked.filter((row) => stillUncovered.has(row.id));
	if (rows.length === 0) return null;

	const skip = (reason: SkippedPerson['reason']): SkippedPerson => ({
		personId: person.id,
		personName: person.fullName,
		reason
	});
	const prepared = await prepareHandover(tx, actor.organisationId, 'delivery', rows);
	if (prepared === null) return skip('no_requirement');
	if (prepared === 'no_template') return skip('no_template');

	const issued = await issueHandover(
		tx,
		actor,
		{ direction: 'delivery', prepared },
		person,
		rows,
		now,
		deps
	);
	if (issued.handover.status !== 'pending') throw new Error('A regularisation is never waived.');
	await deps.afterIssue?.(tx, issued.handover);
	return {
		issued: {
			...issued.handover,
			personId: person.id,
			personName: person.fullName,
			assetCount: rows.length
		},
		mail: issued.mail
	};
}
