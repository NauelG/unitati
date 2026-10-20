import { and, asc, desc, eq, inArray, isNull } from 'drizzle-orm';
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
 * listing all of them, with the rendered agreement and a single-use token.
 */

export interface DeliverDeps {
	mailer?: Mailer | null;
	/** Builds the absolute link a mail points at from the plain token. */
	linkTo?: (token: string) => string;
	now?: () => Date;
}

export type DeliverFailure =
	| 'no_assets'
	| 'asset_not_found'
	| 'person_not_found'
	| 'already_in_custody'
	| 'no_delivery_template';

export interface DeliveredHandover {
	id: string;
	code: string;
	/** The plain token, shown to the technician once. Only its sha256 is stored. */
	token: string;
	link: string;
	expiresAt: Date;
}

const dateFormat = new Intl.DateTimeFormat('es', { dateStyle: 'long', timeZone: 'UTC' });

export async function deliver(
	actor: SessionUser,
	personId: string,
	assetIds: readonly string[],
	deps: DeliverDeps = {}
): Promise<Outcome<{ handover: DeliveredHandover | null }, DeliverFailure>> {
	const mailer = deps.mailer === undefined ? runtimeMailer() : deps.mailer;
	const linkTo = deps.linkTo ?? ((token: string) => `${runtimeOrigin()}/handover/${token}`);
	const now = (deps.now ?? (() => new Date()))();

	const ids = [...new Set(assetIds)];
	if (ids.length === 0) return failure('no_assets');

	const outcome = await getDb().transaction(async (tx) => {
		const [person] = await tx
			.select({ id: people.id, fullName: people.fullName, email: people.email })
			.from(people)
			.where(and(eq(people.id, personId), eq(people.organisationId, actor.organisationId)))
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

		// Resolved before anything is written: a refusal must leave no custody behind.
		let issuing: {
			templateVersionId: string;
			body: string;
			organisationName: string;
			linkValidDays: number;
		} | null = null;
		if (required) {
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

		if (!issuing) return success({ handover: null, mail: null });

		const rendered = renderHandoverTemplate(issuing.body, {
			personName: person.fullName,
			organisationName: issuing.organisationName,
			date: dateFormat.format(now)
		});
		const token = generateHandoverToken();
		const expiresAt = new Date(now.getTime() + issuing.linkValidDays * 24 * 60 * 60 * 1000);

		const [handover] = await tx
			.insert(handovers)
			.values({
				organisationId: actor.organisationId,
				direction: 'delivery',
				status: 'pending',
				personId: person.id,
				personNameSnapshot: person.fullName,
				recipientEmailSnapshot: person.email,
				templateVersionId: issuing.templateVersionId,
				bodySnapshot: rendered.text,
				bodySha256: rendered.sha256,
				tokenHash: hashHandoverToken(token),
				expiresAt,
				issuedByPersonId: actor.serviceAccountId ? null : actor.personId,
				issuedByServiceAccountId: actor.serviceAccountId ?? null,
				issuedAt: now
			})
			.returning({ id: handovers.id, code: handovers.code });

		const snapshots = rows.map((row) => ({
			assetId: row.id,
			assetTag: row.assetTag,
			assetName: row.name,
			serial: row.serial,
			model: row.modelName
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
		for (const target of [...ids.map((assetId) => ({ assetId })), { personId: person.id }]) {
			await recordActivity(tx, {
				organisationId: actor.organisationId,
				...actorColumns(actor),
				target,
				verb: 'handover.issued',
				payload
			});
		}

		const link = linkTo(token);
		return success({
			handover: { id: handover.id, code: handover.code, token, link, expiresAt },
			mail: {
				to: person.email,
				...handoverLinkMail({
					personName: person.fullName,
					organisationName: issuing.organisationName,
					code: handover.code,
					link,
					expiresOn: dateFormat.format(expiresAt)
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
