import { and, asc, eq, sql } from 'drizzle-orm';
import { can } from '../access/permissions';
import type { SessionUser } from '../auth/guards';
import { getDb } from '../db';
import type { Executor } from '../db';
import { uniqueConstraintName } from '../db/errors';
import { failure, success, type Outcome } from '../shared/outcome';
import { timeEntries, timeEntryTypes, type TimeEntryType } from './schema';
import { isTimeTrackingEnabled } from './settings';

/**
 * The entry-type catalogue (ADR 0051): what kind of work an hour was spent on.
 * Shared by tickets and tasks, which is why it lives with time and not with
 * either of them. Managed by `time.manage`, read by anyone who logs time.
 *
 * A type in use is **archived** rather than deleted: its entries keep and show
 * it, but it is no longer offered. The default type is neither archived nor
 * deleted until another one takes its place.
 */

export const MAX_TYPE_NAME_LENGTH = 80;

export type CatalogueFailure =
	| 'forbidden'
	| 'time_tracking_disabled'
	| 'name_required'
	| 'name_too_long'
	| 'name_taken'
	| 'type_not_found'
	| 'type_archived'
	| 'default_type';

export interface TypeView {
	id: string;
	name: string;
	position: number;
	isDefault: boolean;
	archived: boolean;
	/** Entries that carry it: what decides between deleting and archiving. */
	entryCount: number;
}

/** Every type of the organisation, archived ones last, in display order. */
export async function listTypes(
	organisationId: string,
	executor: Executor = getDb()
): Promise<TypeView[]> {
	const rows = await executor
		.select({
			id: timeEntryTypes.id,
			name: timeEntryTypes.name,
			position: timeEntryTypes.position,
			isDefault: timeEntryTypes.isDefault,
			archivedAt: timeEntryTypes.archivedAt
		})
		.from(timeEntryTypes)
		.where(eq(timeEntryTypes.organisationId, organisationId))
		.orderBy(
			sql`${timeEntryTypes.archivedAt} is not null`,
			asc(timeEntryTypes.position),
			asc(timeEntryTypes.name)
		);

	const counts = await executor
		.select({ typeId: timeEntries.typeId, entryCount: sql<number>`count(*)::int` })
		.from(timeEntries)
		.where(eq(timeEntries.organisationId, organisationId))
		.groupBy(timeEntries.typeId);
	const used = new Map(counts.map((row) => [row.typeId, row.entryCount]));

	return rows.map(({ archivedAt, ...row }) => ({
		...row,
		archived: archivedAt !== null,
		entryCount: used.get(row.id) ?? 0
	}));
}

/** The types an entry may be put on: the active ones. */
export async function listOfferedTypes(
	organisationId: string,
	executor: Executor = getDb()
): Promise<{ id: string; name: string; isDefault: boolean }[]> {
	return (await listTypes(organisationId, executor))
		.filter((type) => !type.archived)
		.map(({ id, name, isDefault }) => ({ id, name, isDefault }));
}

/** The gate of every catalogue write: `time.manage`, with tracking on (ADR 0051). */
async function allowed(actor: SessionUser): Promise<CatalogueFailure | null> {
	if (!can(actor, 'time.manage')) return 'forbidden';
	if (!(await isTimeTrackingEnabled(actor.organisationId))) return 'time_tracking_disabled';
	return null;
}

function checkName(raw: string): Outcome<string, 'name_required' | 'name_too_long'> {
	const name = raw.trim();
	if (name === '') return failure('name_required');
	if (name.length > MAX_TYPE_NAME_LENGTH) return failure('name_too_long');
	return success(name);
}

/** Runs a write that may collide with the unique name, mapping the violation to its code. */
async function nameChecked<T>(write: () => Promise<Outcome<T, CatalogueFailure>>) {
	try {
		return await write();
	} catch (error) {
		if (uniqueConstraintName(error) === 'time_entry_types_org_name') return failure('name_taken');
		throw error;
	}
}

export async function createType(
	actor: SessionUser,
	rawName: string
): Promise<Outcome<TypeView, CatalogueFailure>> {
	const refused = await allowed(actor);
	if (refused) return failure(refused);
	const name = checkName(rawName);
	if (!name.ok) return failure(name.error);

	return nameChecked(() =>
		getDb().transaction(async (tx) => {
			const [{ next }] = await tx
				.select({ next: sql<number>`coalesce(max(${timeEntryTypes.position}) + 1, 0)::int` })
				.from(timeEntryTypes)
				.where(eq(timeEntryTypes.organisationId, actor.organisationId));
			// The first type of an organisation is its default: the rule is that one always is.
			const [{ active }] = await tx
				.select({ active: sql<number>`count(*)::int` })
				.from(timeEntryTypes)
				.where(
					and(
						eq(timeEntryTypes.organisationId, actor.organisationId),
						sql`${timeEntryTypes.archivedAt} is null`
					)
				);

			const [row] = await tx
				.insert(timeEntryTypes)
				.values({
					organisationId: actor.organisationId,
					name: name.value,
					position: next,
					isDefault: active === 0
				})
				.returning();
			return success(view(row));
		})
	);
}

export async function renameType(
	actor: SessionUser,
	typeId: string,
	rawName: string
): Promise<Outcome<void, CatalogueFailure>> {
	const refused = await allowed(actor);
	if (refused) return failure(refused);
	const name = checkName(rawName);
	if (!name.ok) return failure(name.error);

	return nameChecked(async () => {
		const [updated] = await getDb()
			.update(timeEntryTypes)
			.set({ name: name.value, updatedAt: new Date() })
			.where(
				and(
					eq(timeEntryTypes.id, typeId),
					eq(timeEntryTypes.organisationId, actor.organisationId),
					sql`${timeEntryTypes.archivedAt} is null`
				)
			)
			.returning({ id: timeEntryTypes.id });
		if (updated) return success(undefined);

		// Nothing matched: either it is not there, or it is archived (a name nobody is offered).
		const [existing] = await getDb()
			.select({ id: timeEntryTypes.id })
			.from(timeEntryTypes)
			.where(
				and(eq(timeEntryTypes.id, typeId), eq(timeEntryTypes.organisationId, actor.organisationId))
			)
			.limit(1);
		return failure(existing ? 'type_archived' : 'type_not_found');
	});
}

/** Moves a type one place up or down among the active ones. At either end it is a no-op. */
export async function moveType(
	actor: SessionUser,
	typeId: string,
	direction: 'up' | 'down'
): Promise<Outcome<void, CatalogueFailure>> {
	const refused = await allowed(actor);
	if (refused) return failure(refused);

	return getDb().transaction(async (tx) => {
		const active = await tx
			.select({ id: timeEntryTypes.id })
			.from(timeEntryTypes)
			.where(
				and(
					eq(timeEntryTypes.organisationId, actor.organisationId),
					sql`${timeEntryTypes.archivedAt} is null`
				)
			)
			.orderBy(asc(timeEntryTypes.position), asc(timeEntryTypes.name))
			.for('update');

		const index = active.findIndex((row) => row.id === typeId);
		if (index === -1) return failure('type_not_found');

		const target = direction === 'up' ? index - 1 : index + 1;
		const order = active.map((row) => row.id);
		if (target >= 0 && target < order.length) {
			[order[index], order[target]] = [order[target], order[index]];
		}

		// Renumbered whole, so positions stay a clean 0..n-1 whatever deletes left behind.
		for (const [position, id] of order.entries()) {
			await tx
				.update(timeEntryTypes)
				.set({ position, updatedAt: new Date() })
				.where(eq(timeEntryTypes.id, id));
		}
		return success(undefined);
	});
}

export async function setDefaultType(
	actor: SessionUser,
	typeId: string
): Promise<Outcome<void, CatalogueFailure>> {
	const refused = await allowed(actor);
	if (refused) return failure(refused);

	return getDb().transaction(async (tx) => {
		const [type] = await tx
			.select()
			.from(timeEntryTypes)
			.where(
				and(eq(timeEntryTypes.id, typeId), eq(timeEntryTypes.organisationId, actor.organisationId))
			)
			.for('update');
		if (!type) return failure('type_not_found');
		if (type.archivedAt) return failure('type_archived');

		// The old default first: the partial unique index allows one at a time.
		await tx
			.update(timeEntryTypes)
			.set({ isDefault: false, updatedAt: new Date() })
			.where(
				and(
					eq(timeEntryTypes.organisationId, actor.organisationId),
					eq(timeEntryTypes.isDefault, true)
				)
			);
		await tx
			.update(timeEntryTypes)
			.set({ isDefault: true, updatedAt: new Date() })
			.where(eq(timeEntryTypes.id, typeId));
		return success(undefined);
	});
}

/**
 * "Delete" in the catalogue: a type nobody used is removed, one in use is
 * archived, and the default is refused until another takes its place.
 */
export async function removeType(
	actor: SessionUser,
	typeId: string
): Promise<Outcome<'deleted' | 'archived', CatalogueFailure>> {
	const refused = await allowed(actor);
	if (refused) return failure(refused);

	return getDb().transaction(async (tx) => {
		const [type] = await tx
			.select()
			.from(timeEntryTypes)
			.where(
				and(eq(timeEntryTypes.id, typeId), eq(timeEntryTypes.organisationId, actor.organisationId))
			)
			.for('update');
		if (!type) return failure('type_not_found');
		if (type.isDefault && !type.archivedAt) return failure('default_type');

		const [{ used }] = await tx
			.select({ used: sql<number>`count(*)::int` })
			.from(timeEntries)
			.where(eq(timeEntries.typeId, typeId));

		if (used === 0) {
			await tx.delete(timeEntryTypes).where(eq(timeEntryTypes.id, typeId));
			return success('deleted' as const);
		}
		if (!type.archivedAt) {
			await tx
				.update(timeEntryTypes)
				.set({ archivedAt: new Date(), updatedAt: new Date() })
				.where(eq(timeEntryTypes.id, typeId));
		}
		return success('archived' as const);
	});
}

function view(row: TimeEntryType): TypeView {
	return {
		id: row.id,
		name: row.name,
		position: row.position,
		isDefault: row.isDefault,
		archived: row.archivedAt !== null,
		entryCount: 0
	};
}
