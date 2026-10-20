import { and, asc, desc, eq, isNull, max, sql } from 'drizzle-orm';
import { can } from '../access/permissions';
import type { SessionUser } from '../auth/guards';
import { getDb, type Executor } from '../db';
import { constraintViolation } from '../db/errors';
import { people } from '../directory/schema';
import { failure, success, type Outcome } from '../shared/outcome';
import { DEFAULT_HANDOVER_BODIES } from './handover-defaults';
import type { HandoverDirection } from './handover-template';
import {
	categories,
	handoverSettings,
	handoverTemplates,
	handoverTemplateVersions
} from './schema';

/**
 * The agreement texts a handover is signed against, and the settings around
 * them (ADR 0035, decisions 2, 4 and 7).
 *
 * Saving appends a version; nothing here updates or deletes one, short of
 * removing a whole override. The two pure rules (which template applies, how it
 * renders) live in `handover-template.ts`.
 */

export const LINK_VALID_DAYS_DEFAULT = 14;
export const LINK_VALID_DAYS_MIN = 1;
export const LINK_VALID_DAYS_MAX = 90;

export interface HandoverAgreement {
	templateId: string;
	direction: HandoverDirection;
	/** `null` for the global template of the direction. */
	categoryId: string | null;
	categoryName: string | null;
	latestVersion: number;
}

/** The global templates first (delivery, then return), then the overrides by category. */
export async function listHandoverAgreements(
	organisationId: string,
	executor: Executor = getDb()
): Promise<HandoverAgreement[]> {
	const rows = await executor
		.select({
			templateId: handoverTemplates.id,
			direction: handoverTemplates.direction,
			categoryId: handoverTemplates.categoryId,
			categoryName: categories.name,
			latestVersion: max(handoverTemplateVersions.version)
		})
		.from(handoverTemplates)
		.leftJoin(categories, eq(categories.id, handoverTemplates.categoryId))
		.innerJoin(
			handoverTemplateVersions,
			eq(handoverTemplateVersions.templateId, handoverTemplates.id)
		)
		.where(eq(handoverTemplates.organisationId, organisationId))
		.groupBy(handoverTemplates.id, categories.name)
		.orderBy(
			sql`${handoverTemplates.categoryId} is not null`,
			asc(categories.name),
			asc(handoverTemplates.direction)
		);

	return rows.map((row) => ({ ...row, latestVersion: row.latestVersion ?? 0 }));
}

export interface HandoverTemplateVersion {
	id: string;
	version: number;
	body: string;
	authorName: string | null;
	createdAt: Date;
}

/** Newest first. Empty for a template that is not this organisation's. */
export async function listHandoverTemplateVersions(
	organisationId: string,
	templateId: string,
	executor: Executor = getDb()
): Promise<HandoverTemplateVersion[]> {
	return executor
		.select({
			id: handoverTemplateVersions.id,
			version: handoverTemplateVersions.version,
			body: handoverTemplateVersions.body,
			authorName: people.fullName,
			createdAt: handoverTemplateVersions.createdAt
		})
		.from(handoverTemplateVersions)
		.innerJoin(handoverTemplates, eq(handoverTemplates.id, handoverTemplateVersions.templateId))
		.leftJoin(people, eq(people.id, handoverTemplateVersions.createdByPersonId))
		.where(
			and(
				eq(handoverTemplateVersions.templateId, templateId),
				eq(handoverTemplates.organisationId, organisationId)
			)
		)
		.orderBy(desc(handoverTemplateVersions.version));
}

export interface SaveHandoverTemplateInput {
	direction: HandoverDirection;
	categoryId: string | null;
	body: string;
}

export type SaveHandoverTemplateFailure = 'forbidden' | 'empty_body' | 'category_not_found';

/**
 * Appends a version to the template of `(direction, category)`, creating the
 * template on the first save. Creating an override is therefore the same act as
 * writing its first text.
 */
export async function saveHandoverTemplate(
	actor: SessionUser,
	input: SaveHandoverTemplateInput
): Promise<Outcome<{ templateId: string; version: number }, SaveHandoverTemplateFailure>> {
	if (!can(actor, 'assets.manage')) return failure('forbidden');
	const body = input.body.trim();
	if (body === '') return failure('empty_body');

	return getDb().transaction(async (tx) => {
		if (input.categoryId !== null) {
			// A foreign key proves the row exists, not that it is this organisation's.
			const [category] = await tx
				.select({ id: categories.id })
				.from(categories)
				.where(
					and(
						eq(categories.id, input.categoryId),
						eq(categories.organisationId, actor.organisationId)
					)
				)
				.limit(1);
			if (!category) return failure('category_not_found' as const);
		}

		await tx
			.insert(handoverTemplates)
			.values({
				organisationId: actor.organisationId,
				direction: input.direction,
				categoryId: input.categoryId
			})
			.onConflictDoNothing();

		// Locked, so two admins saving at once get versions n and n + 1 rather than
		// a unique violation on the second.
		const [template] = await tx
			.select({ id: handoverTemplates.id })
			.from(handoverTemplates)
			.where(
				and(
					eq(handoverTemplates.organisationId, actor.organisationId),
					eq(handoverTemplates.direction, input.direction),
					input.categoryId === null
						? isNull(handoverTemplates.categoryId)
						: eq(handoverTemplates.categoryId, input.categoryId)
				)
			)
			.for('update');

		const [latest] = await tx
			.select({ version: max(handoverTemplateVersions.version) })
			.from(handoverTemplateVersions)
			.where(eq(handoverTemplateVersions.templateId, template.id));
		const version = (latest?.version ?? 0) + 1;

		await tx.insert(handoverTemplateVersions).values({
			templateId: template.id,
			version,
			body,
			createdByPersonId: actor.personId
		});
		await tx
			.update(handoverTemplates)
			.set({ updatedAt: new Date() })
			.where(eq(handoverTemplates.id, template.id));

		return success({ templateId: template.id, version });
	});
}

export type RemoveHandoverOverrideFailure =
	'forbidden' | 'not_found' | 'not_an_override' | 'in_use';

/**
 * Removes a per-category override and its versions. A global template is never
 * removed: without it a direction cannot be issued at all.
 *
 * `in_use` is `restrict` speaking: once a handover points at a version (the
 * next slice), the foreign key refuses the delete and the transaction rolls
 * back whole, versions included.
 */
export async function removeHandoverOverride(
	actor: SessionUser,
	templateId: string
): Promise<Outcome<void, RemoveHandoverOverrideFailure>> {
	if (!can(actor, 'assets.manage')) return failure('forbidden');

	try {
		return await getDb().transaction(async (tx) => {
			const [template] = await tx
				.select({ id: handoverTemplates.id, categoryId: handoverTemplates.categoryId })
				.from(handoverTemplates)
				.where(
					and(
						eq(handoverTemplates.id, templateId),
						eq(handoverTemplates.organisationId, actor.organisationId)
					)
				)
				.limit(1);
			if (!template) return failure('not_found' as const);
			if (template.categoryId === null) return failure('not_an_override' as const);

			await tx
				.delete(handoverTemplateVersions)
				.where(eq(handoverTemplateVersions.templateId, template.id));
			await tx.delete(handoverTemplates).where(eq(handoverTemplates.id, template.id));
			return success(undefined);
		});
	} catch (error) {
		if (constraintViolation(error)?.code === '23503') return failure('in_use');
		throw error;
	}
}

export interface HandoverSettings {
	linkValidDays: number;
}

/** No row means the defaults. */
export async function getHandoverSettings(
	organisationId: string,
	executor: Executor = getDb()
): Promise<HandoverSettings> {
	const [row] = await executor
		.select({ linkValidDays: handoverSettings.linkValidDays })
		.from(handoverSettings)
		.where(eq(handoverSettings.organisationId, organisationId))
		.limit(1);
	return { linkValidDays: row?.linkValidDays ?? LINK_VALID_DAYS_DEFAULT };
}

export async function setHandoverLinkValidDays(
	actor: SessionUser,
	days: number
): Promise<Outcome<void, 'forbidden' | 'invalid_days'>> {
	if (!can(actor, 'assets.manage')) return failure('forbidden');
	if (!Number.isInteger(days) || days < LINK_VALID_DAYS_MIN || days > LINK_VALID_DAYS_MAX) {
		return failure('invalid_days');
	}

	await getDb()
		.insert(handoverSettings)
		.values({ organisationId: actor.organisationId, linkValidDays: days })
		.onConflictDoUpdate({
			target: handoverSettings.organisationId,
			set: { linkValidDays: days, updatedAt: new Date() }
		});
	return success(undefined);
}

export async function setCategoryRequiresHandover(
	actor: SessionUser,
	categoryId: string,
	requiresHandover: boolean
): Promise<Outcome<void, 'forbidden' | 'not_found'>> {
	if (!can(actor, 'assets.manage')) return failure('forbidden');

	const rows = await getDb()
		.update(categories)
		.set({ requiresHandover, updatedAt: new Date() })
		.where(and(eq(categories.id, categoryId), eq(categories.organisationId, actor.organisationId)))
		.returning({ id: categories.id });
	return rows.length === 0 ? failure('not_found') : success(undefined);
}

/**
 * Gives a new organisation a global text for each direction, so handovers can be
 * issued from the first day. Idempotent: an existing template is left alone.
 */
export async function ensureDefaultHandoverTemplates(
	executor: Executor,
	organisationId: string
): Promise<void> {
	for (const direction of ['delivery', 'return'] as const) {
		const [inserted] = await executor
			.insert(handoverTemplates)
			.values({ organisationId, direction, categoryId: null })
			.onConflictDoNothing()
			.returning({ id: handoverTemplates.id });
		if (!inserted) continue;

		await executor.insert(handoverTemplateVersions).values({
			templateId: inserted.id,
			version: 1,
			body: DEFAULT_HANDOVER_BODIES[direction],
			createdByPersonId: null
		});
	}
}
