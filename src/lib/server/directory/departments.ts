import { and, asc, eq, notExists, sql } from 'drizzle-orm';
import { getDb, type Executor } from '../db';
import { uniqueConstraintName } from '../db/errors';
import type { SessionUser } from '../auth/guards';
import { failure, success, type Outcome } from '../shared/outcome';
import type { WriteOptions } from '../shared/write-options';
import { departments, people } from './schema';
import type { DepartmentInput } from './validation';

/**
 * The departments catalogue.
 *
 * Unlike a location, a department in use is not protected by the database:
 * `people.department_id` is `on delete set null`, so the foreign key would
 * silently orphan everybody in it. The refusal is therefore ours, and it is
 * decided inside the `DELETE` itself so a person assigned a moment before
 * cannot slip through a check-then-delete gap.
 */

export type DepartmentEntry = { id: string; name: string; peopleCount: number };

export type DepartmentCreateFailure = 'duplicate_name';
export type DepartmentRenameFailure = 'not_found' | 'duplicate_name';
export type DepartmentDeleteFailure = 'not_found' | { kind: 'in_use'; people: number };

/** Every department of the organisation by name, with how many people sit in it. */
export async function listDepartments(
	organisationId: string,
	executor: Executor = getDb()
): Promise<DepartmentEntry[]> {
	return executor
		.select({
			id: departments.id,
			name: departments.name,
			peopleCount: sql<number>`count(${people.id})::int`
		})
		.from(departments)
		.leftJoin(people, eq(people.departmentId, departments.id))
		.where(eq(departments.organisationId, organisationId))
		.groupBy(departments.id, departments.name)
		.orderBy(asc(departments.name));
}

export async function createDepartment(
	actor: SessionUser,
	input: DepartmentInput,
	options: WriteOptions = {}
): Promise<Outcome<{ id: string }, DepartmentCreateFailure>> {
	try {
		return await (options.executor ?? getDb()).transaction(async (tx) => {
			const [row] = await tx
				.insert(departments)
				.values({ name: input.name, organisationId: actor.organisationId })
				.returning({ id: departments.id });
			return success(row);
		});
	} catch (error) {
		if (uniqueConstraintName(error) !== null) return failure('duplicate_name');
		throw error;
	}
}

export async function renameDepartment(
	actor: SessionUser,
	id: string,
	input: DepartmentInput
): Promise<Outcome<void, DepartmentRenameFailure>> {
	try {
		const scope = and(eq(departments.id, id), eq(departments.organisationId, actor.organisationId));
		const [current] = await getDb()
			.select({ name: departments.name })
			.from(departments)
			.where(scope)
			.limit(1);
		if (!current) return failure('not_found');
		// Nothing changes, so nothing is written: `updatedAt` keeps meaning "last edited".
		if (current.name === input.name) return success(undefined);

		const rows = await getDb()
			.update(departments)
			.set({ name: input.name, updatedAt: new Date() })
			.where(scope)
			.returning({ id: departments.id });
		return rows.length === 0 ? failure('not_found') : success(undefined);
	} catch (error) {
		if (uniqueConstraintName(error) !== null) return failure('duplicate_name');
		throw error;
	}
}

export async function deleteDepartment(
	actor: SessionUser,
	id: string
): Promise<Outcome<void, DepartmentDeleteFailure>> {
	const scope = and(eq(departments.id, id), eq(departments.organisationId, actor.organisationId));

	const deleted = await getDb()
		.delete(departments)
		.where(
			and(
				scope,
				notExists(
					getDb()
						.select({ one: sql`1` })
						.from(people)
						.where(eq(people.departmentId, departments.id))
				)
			)
		)
		.returning({ id: departments.id });
	if (deleted.length > 0) return success(undefined);

	// Nothing was deleted: either there is no such department here, or people are in it.
	const [row] = await getDb()
		.select({ count: sql<number>`count(${people.id})::int` })
		.from(departments)
		.leftJoin(people, eq(people.departmentId, departments.id))
		.where(scope)
		.groupBy(departments.id);
	if (!row) return failure('not_found');
	return failure({ kind: 'in_use', people: row.count });
}
