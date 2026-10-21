import { and, asc, desc, eq, inArray } from 'drizzle-orm';
import type { HandoverCondition } from '#lib/domain/handover.js';
import { actorColumns, recordActivity } from '../activity';
import type { SessionUser } from '../auth/guards';
import type { Transaction } from '../db';
import { organisations } from '../directory/schema';
import type { MailMessage } from '../shared/mail';
import { runtimeOrigin } from '../shared/runtime';
import { handoverLinkMail } from './handover-mail';
import {
	renderHandoverTemplate,
	resolveHandoverTemplate,
	type HandoverDirection
} from './handover-template';
import { getHandoverSettings } from './handover-templates';
import { generateHandoverToken, hashHandoverToken } from './handover-token';
import {
	assetModels,
	assets,
	categories,
	handoverAssets,
	handoverTemplates,
	handoverTemplateVersions,
	handovers
} from './schema';

/**
 * Issuing a pending handover inside the operation that changed custody
 * (ADR 0035, decisions 2, 4, 6 and 7), shared by `deliver` and `takeBack`.
 *
 * Two halves, because the caller writes custody between them: `prepareHandover`
 * resolves everything that can refuse (the template), before anything is
 * written, and `issueHandover` writes the handover once custody is recorded.
 */

/** The deps both operations take: the mailer, the link builder and the clock. */
export interface IssueDeps {
	/** Builds the absolute link a mail points at from the plain token. */
	linkTo?: (token: string) => string;
}

export interface PendingHandover {
	status: 'pending';
	id: string;
	code: string;
	/** The plain token, shown to the technician once. Only its sha256 is stored. */
	token: string;
	link: string;
	expiresAt: Date;
}

/** A waived handover (ADR 0035, decision 8) has no link: the reason is the record. */
export type IssuedHandover = PendingHandover | { status: 'waived'; id: string; code: string };

/** One asset of the operation, as the caller locked it. */
export interface HandoverAssetRow {
	id: string;
	assetTag: string;
	name: string;
	serial: string | null;
	modelName: string;
	categoryId: string;
	requiresHandover: boolean;
	/** Set on every asset of a return, never on a delivery. */
	condition?: { condition: HandoverCondition; notes: string | null };
}

export interface PreparedHandover {
	direction: HandoverDirection;
	templateVersionId: string;
	body: string;
	organisationName: string;
	linkValidDays: number;
}

const dateFormat = new Intl.DateTimeFormat('es', { dateStyle: 'long', timeZone: 'UTC' });

/**
 * The assets of one operation with what a handover snapshots of them, and who
 * holds them now, locked `for update` in id order: two operations on
 * overlapping sets queue instead of deadlocking.
 */
export async function lockOperationAssets(
	tx: Transaction,
	organisationId: string,
	ids: readonly string[]
): Promise<(HandoverAssetRow & { custodianPersonId: string | null })[]> {
	return tx
		.select({
			id: assets.id,
			assetTag: assets.assetTag,
			name: assets.name,
			serial: assets.serial,
			custodianPersonId: assets.custodianPersonId,
			modelName: assetModels.name,
			categoryId: categories.id,
			requiresHandover: categories.requiresHandover
		})
		.from(assets)
		.innerJoin(assetModels, eq(assetModels.id, assets.assetModelId))
		.innerJoin(categories, eq(categories.id, assetModels.categoryId))
		.where(and(inArray(assets.id, [...ids]), eq(assets.organisationId, organisationId)))
		.orderBy(asc(assets.id))
		.for('update', { of: assets });
}

/**
 * `null` when no asset requires a handover, `'no_template'` when one is
 * required and the direction has no template to sign against.
 */
export async function prepareHandover(
	tx: Transaction,
	organisationId: string,
	direction: HandoverDirection,
	rows: readonly HandoverAssetRow[]
): Promise<PreparedHandover | null | 'no_template'> {
	if (!rows.some((row) => row.requiresHandover)) return null;

	const templates = await tx
		.select({
			id: handoverTemplates.id,
			direction: handoverTemplates.direction,
			categoryId: handoverTemplates.categoryId
		})
		.from(handoverTemplates)
		.where(
			and(
				eq(handoverTemplates.organisationId, organisationId),
				eq(handoverTemplates.direction, direction)
			)
		);
	const template = resolveHandoverTemplate(
		templates,
		rows.map((row) => ({ id: row.categoryId, requiresHandover: row.requiresHandover })),
		direction
	);
	if (!template) return 'no_template';

	const [version] = await tx
		.select({ id: handoverTemplateVersions.id, body: handoverTemplateVersions.body })
		.from(handoverTemplateVersions)
		.where(eq(handoverTemplateVersions.templateId, template.id))
		.orderBy(desc(handoverTemplateVersions.version))
		.limit(1);
	if (!version) return 'no_template';

	const [organisation] = await tx
		.select({ name: organisations.name })
		.from(organisations)
		.where(eq(organisations.id, organisationId))
		.limit(1);
	const settings = await getHandoverSettings(organisationId, tx);
	return {
		direction,
		templateVersionId: version.id,
		body: version.body,
		organisationName: organisation?.name ?? '',
		linkValidDays: settings.linkValidDays
	};
}

/**
 * Writes the handover listing every row, its activity entries (one per asset
 * and one on the person), and returns the mail to send after commit. The token
 * appears only in the return value.
 *
 * `prepared` is what `prepareHandover` resolved; with a `waiveReason` it is not
 * needed, because a waiver has nothing to render, sign or mail.
 */
export async function issueHandover(
	tx: Transaction,
	actor: SessionUser,
	input: {
		direction: HandoverDirection;
		prepared: PreparedHandover | null;
		waiveReason?: string | null;
	},
	person: { id: string; fullName: string; email: string },
	rows: readonly HandoverAssetRow[],
	now: Date,
	deps: IssueDeps = {}
): Promise<{ handover: IssuedHandover; mail: MailMessage | null }> {
	const { direction, prepared, waiveReason = null } = input;
	const linkTo = deps.linkTo ?? ((token: string) => `${runtimeOrigin()}/handover/${token}`);

	// The condition belongs to the direction: every asset of a return, none of a delivery.
	const conditioned = direction === 'return';
	if (rows.some((row) => (row.condition !== undefined) !== conditioned)) {
		throw new Error(`A ${direction} handover got assets with the wrong conditions.`);
	}

	const base = {
		organisationId: actor.organisationId,
		direction,
		personId: person.id,
		personNameSnapshot: person.fullName,
		recipientEmailSnapshot: person.email,
		issuedByPersonId: actor.serviceAccountId ? null : actor.personId,
		issuedByServiceAccountId: actor.serviceAccountId ?? null,
		issuedAt: now
	};

	let pending: { token: string; expiresAt: Date } | null = null;
	let handover: { id: string; code: string };
	if (waiveReason === null) {
		if (!prepared) throw new Error('A pending handover needs a prepared template.');
		const rendered = renderHandoverTemplate(prepared.body, {
			personName: person.fullName,
			organisationName: prepared.organisationName,
			date: dateFormat.format(now)
		});
		const token = generateHandoverToken();
		const expiresAt = new Date(now.getTime() + prepared.linkValidDays * 24 * 60 * 60 * 1000);
		pending = { token, expiresAt };
		[handover] = await tx
			.insert(handovers)
			.values({
				...base,
				status: 'pending',
				templateVersionId: prepared.templateVersionId,
				bodySnapshot: rendered.text,
				bodySha256: rendered.sha256,
				tokenHash: hashHandoverToken(token),
				expiresAt
			})
			.returning({ id: handovers.id, code: handovers.code });
	} else {
		// No token, no text, no template, no mail: the reason is the record.
		[handover] = await tx
			.insert(handovers)
			.values({ ...base, status: 'waived', waiveReason })
			.returning({ id: handovers.id, code: handovers.code });
	}

	const snapshots = rows.map((row) => ({
		assetId: row.id,
		assetTag: row.assetTag,
		assetName: row.name,
		serial: row.serial,
		model: row.modelName,
		...(row.condition
			? { condition: row.condition.condition, conditionNotes: row.condition.notes }
			: {})
	}));
	await tx.insert(handoverAssets).values(
		snapshots.map((snapshot) => ({
			handoverId: handover.id,
			assetId: snapshot.assetId,
			assetTagSnapshot: snapshot.assetTag,
			assetNameSnapshot: snapshot.assetName,
			serialSnapshot: snapshot.serial,
			modelSnapshot: snapshot.model,
			condition: snapshot.condition ?? null,
			conditionNotes: snapshot.conditionNotes ?? null
		}))
	);

	const payload = {
		handoverId: handover.id,
		code: handover.code,
		direction,
		personId: person.id,
		personName: person.fullName,
		assets: snapshots
	};
	const entry =
		waiveReason === null
			? { verb: 'handover.issued' as const, payload }
			: { verb: 'handover.waived' as const, payload: { ...payload, reason: waiveReason } };
	for (const target of [...rows.map((row) => ({ assetId: row.id })), { personId: person.id }]) {
		await recordActivity(tx, {
			organisationId: actor.organisationId,
			...actorColumns(actor),
			target,
			...entry
		});
	}

	if (!pending || !prepared) {
		return { handover: { status: 'waived', id: handover.id, code: handover.code }, mail: null };
	}
	const link = linkTo(pending.token);
	return {
		handover: {
			status: 'pending',
			id: handover.id,
			code: handover.code,
			token: pending.token,
			link,
			expiresAt: pending.expiresAt
		},
		mail: {
			to: person.email,
			...handoverLinkMail({
				direction,
				personName: person.fullName,
				organisationName: prepared.organisationName,
				code: handover.code,
				link,
				expiresOn: dateFormat.format(pending.expiresAt)
			})
		}
	};
}
