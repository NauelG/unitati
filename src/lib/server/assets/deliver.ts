import { and, asc, desc, eq, inArray, isNull } from 'drizzle-orm';
import { can } from '../access/permissions';
import { actorColumns, recordActivity } from '../activity';
import type { SessionUser } from '../auth/guards';
import { getDb, type Executor } from '../db';
import { organisations, people } from '../directory/schema';
import { sendQuietly, type Mailer } from '../shared/mail';
import { failure, success, type Outcome } from '../shared/outcome';
import { runtimeMailer, runtimeOrigin } from '../shared/runtime';
import { recordCustodyAssigned } from './custody';
import { handoverLinkMail } from './handover-mail';
import { renderHandoverTemplate, resolveHandoverTemplate } from './handover-template';
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
 * Delivering assets to a person: the operation a technician performs (ADR 0035).
 *
 * Custody is recorded at once, for every asset, or for none. When any asset's
 * category requires a handover, the same transaction also issues a pending one
 * listing all of them, with the rendered agreement and a single-use token; or,
 * when the actor waives it, a `waived` one with the reason and nothing to sign.
 */

export interface DeliverDeps {
	mailer?: Mailer | null;
	/** Builds the absolute link a mail points at from the plain token. */
	linkTo?: (token: string) => string;
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

export type DeliveredHandover =
	| {
			status: 'pending';
			id: string;
			code: string;
			/** The plain token, shown to the technician once. Only its sha256 is stored. */
			token: string;
			link: string;
			expiresAt: Date;
	  }
	| { status: 'waived'; id: string; code: string };

const dateFormat = new Intl.DateTimeFormat('es', { dateStyle: 'long', timeZone: 'UTC' });

export async function deliver(
	actor: SessionUser,
	request: DeliverRequest,
	deps: DeliverDeps = {}
): Promise<Outcome<{ handover: DeliveredHandover | null }, DeliverFailure>> {
	const mailer = deps.mailer === undefined ? runtimeMailer() : deps.mailer;
	const linkTo = deps.linkTo ?? ((token: string) => `${runtimeOrigin()}/handover/${token}`);
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

		// Locked in id order, so two deliveries of overlapping sets queue instead of deadlocking.
		const rows = await tx
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
			.where(and(inArray(assets.id, ids), eq(assets.organisationId, actor.organisationId)))
			.orderBy(asc(assets.id))
			.for('update', { of: assets });

		if (rows.length !== ids.length) return failure('asset_not_found' as const);
		if (rows.some((row) => row.custodianPersonId !== null)) {
			return failure('already_in_custody' as const);
		}

		const required = rows.some((row) => row.requiresHandover);
		// A waiver of nothing would be a record that means nothing.
		if (waiveReason !== null && !required) return failure('waive_not_required' as const);

		// Resolved before anything is written: a refusal must leave no custody behind.
		// A waiver has nothing to render, so it needs no template.
		let issuing: {
			templateVersionId: string;
			body: string;
			organisationName: string;
			linkValidDays: number;
		} | null = null;
		if (required && waiveReason === null) {
			const templates = await tx
				.select({
					id: handoverTemplates.id,
					direction: handoverTemplates.direction,
					categoryId: handoverTemplates.categoryId
				})
				.from(handoverTemplates)
				.where(
					and(
						eq(handoverTemplates.organisationId, actor.organisationId),
						eq(handoverTemplates.direction, 'delivery')
					)
				);
			const template = resolveHandoverTemplate(
				templates,
				rows.map((row) => ({ id: row.categoryId, requiresHandover: row.requiresHandover })),
				'delivery'
			);
			if (!template) return failure('no_delivery_template' as const);

			const [version] = await tx
				.select({ id: handoverTemplateVersions.id, body: handoverTemplateVersions.body })
				.from(handoverTemplateVersions)
				.where(eq(handoverTemplateVersions.templateId, template.id))
				.orderBy(desc(handoverTemplateVersions.version))
				.limit(1);
			if (!version) return failure('no_delivery_template' as const);

			const [organisation] = await tx
				.select({ name: organisations.name })
				.from(organisations)
				.where(eq(organisations.id, actor.organisationId))
				.limit(1);
			const settings = await getHandoverSettings(actor.organisationId, tx);
			issuing = {
				templateVersionId: version.id,
				body: version.body,
				organisationName: organisation?.name ?? '',
				linkValidDays: settings.linkValidDays
			};
		}

		for (const row of rows) await recordCustodyAssigned(tx, actor, row.id, person);

		if (!required) return success({ handover: null, mail: null });

		const handoverBase = {
			organisationId: actor.organisationId,
			direction: 'delivery' as const,
			personId: person.id,
			personNameSnapshot: person.fullName,
			recipientEmailSnapshot: person.email,
			issuedByPersonId: actor.serviceAccountId ? null : actor.personId,
			issuedByServiceAccountId: actor.serviceAccountId ?? null,
			issuedAt: now
		};

		let pending: { token: string; expiresAt: Date; organisationName: string } | null = null;
		let handover: { id: string; code: string };
		if (issuing) {
			const rendered = renderHandoverTemplate(issuing.body, {
				personName: person.fullName,
				organisationName: issuing.organisationName,
				date: dateFormat.format(now)
			});
			const token = generateHandoverToken();
			const expiresAt = new Date(now.getTime() + issuing.linkValidDays * 24 * 60 * 60 * 1000);
			pending = { token, expiresAt, organisationName: issuing.organisationName };
			[handover] = await tx
				.insert(handovers)
				.values({
					...handoverBase,
					status: 'pending',
					templateVersionId: issuing.templateVersionId,
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
				.values({ ...handoverBase, status: 'waived', waiveReason })
				.returning({ id: handovers.id, code: handovers.code });
		}

		const snapshots = rows.map((asset) => ({
			assetId: asset.id,
			assetTag: asset.assetTag,
			assetName: asset.name,
			serial: asset.serial,
			model: asset.modelName
		}));
		await tx.insert(handoverAssets).values(
			snapshots.map((snapshot) => ({
				handoverId: handover.id,
				assetId: snapshot.assetId,
				assetTagSnapshot: snapshot.assetTag,
				assetNameSnapshot: snapshot.assetName,
				serialSnapshot: snapshot.serial,
				modelSnapshot: snapshot.model
			}))
		);

		const payload = {
			handoverId: handover.id,
			code: handover.code,
			personId: person.id,
			personName: person.fullName,
			assets: snapshots
		};
		const entry =
			waiveReason === null
				? { verb: 'handover.issued' as const, payload }
				: { verb: 'handover.waived' as const, payload: { ...payload, reason: waiveReason } };
		for (const target of [...ids.map((assetId) => ({ assetId })), { personId: person.id }]) {
			await recordActivity(tx, {
				organisationId: actor.organisationId,
				...actorColumns(actor),
				target,
				...entry
			});
		}

		if (!pending) {
			return success({
				handover: { status: 'waived' as const, id: handover.id, code: handover.code },
				mail: null
			});
		}

		const link = linkTo(pending.token);
		return success({
			handover: {
				status: 'pending' as const,
				id: handover.id,
				code: handover.code,
				token: pending.token,
				link,
				expiresAt: pending.expiresAt
			},
			mail: {
				to: person.email,
				...handoverLinkMail({
					personName: person.fullName,
					organisationName: pending.organisationName,
					code: handover.code,
					link,
					expiresOn: dateFormat.format(pending.expiresAt)
				})
			}
		});
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

/** The assets nobody holds, for the delivery picker. Bounded: a picker is not a report. */
export async function listDeliverableAssets(
	organisationId: string,
	executor: Executor = getDb()
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
		.where(and(eq(assets.organisationId, organisationId), isNull(assets.custodianPersonId)))
		.orderBy(asc(assets.assetTag))
		.limit(500);
}
