import { and, eq } from 'drizzle-orm';
import { getDb } from '../db';
import { uniqueConstraintName } from '../db/errors';
import type { SessionUser } from '../auth/guards';
import { failure, success, type Outcome } from '../shared/outcome';
import type { WriteOptions } from '../shared/write-options';
import { actorColumns, recordActivity } from '../activity';
import { locationPaths } from './locations';
import { departments, locations, people } from './schema';
import type { PersonInput, PersonUpdateInput } from './validation';

/**
 * The people directory's writes (#229).
 *
 * Whoever calls these has already been allowed to (`people.edit`); scoping to
 * the actor's organisation is this module's job. A person is a directory record,
 * not a credential: nothing here creates or touches a user (#230).
 */

export type PersonCreateFailure = 'duplicate_email' | 'department_not_found' | 'location_not_found';
export type PersonUpdateFailure =
	'not_found' | 'duplicate_email' | 'department_not_found' | 'email_locked';
export type PersonDeactivateFailure = 'not_found' | 'already_inactive' | 'self';
export type PersonReactivateFailure = 'not_found' | 'already_active';

export async function createPerson(
	actor: SessionUser,
	input: PersonInput,
	options: WriteOptions = {}
): Promise<Outcome<{ id: string }, PersonCreateFailure>> {
	const { organisationId } = actor;
	const imported = options.via === 'import';

	try {
		return await (options.executor ?? getDb()).transaction(async (tx) => {
			if (input.departmentId !== null) {
				const [found] = await tx
					.select({ id: departments.id })
					.from(departments)
					.where(
						and(
							eq(departments.id, input.departmentId),
							eq(departments.organisationId, organisationId)
						)
					)
					.limit(1);
				if (!found) return failure('department_not_found');
			}
			if (input.locationId !== null) {
				const [found] = await tx
					.select({ id: locations.id })
					.from(locations)
					.where(
						and(eq(locations.id, input.locationId), eq(locations.organisationId, organisationId))
					)
					.limit(1);
				if (!found) return failure('location_not_found');
			}

			const [row] = await tx
				.insert(people)
				.values({
					organisationId,
					fullName: input.fullName,
					email: input.email,
					departmentId: input.departmentId,
					locationId: input.locationId
				})
				.returning({ id: people.id });

			await recordActivity(tx, {
				organisationId,
				...actorColumns(actor),
				target: { personId: row.id },
				verb: 'person.created',
				payload: {
					fullName: input.fullName,
					email: input.email,
					...(imported ? { via: 'import' as const } : {})
				}
			});
			// An import places the person as it creates them, so the location's history
			// starts here; a manual create records only the creation, as it always did.
			if (imported && input.locationId !== null) {
				const path = (await locationPaths(organisationId, [input.locationId], tx)).get(
					input.locationId
				);
				await recordActivity(tx, {
					organisationId,
					...actorColumns(actor),
					target: { personId: row.id },
					verb: 'person.location.changed',
					payload: {
						from: null,
						to: { id: input.locationId, path: path ?? '' },
						reason: 'imported'
					}
				});
			}
			return success({ id: row.id });
		});
	} catch (error) {
		if (uniqueConstraintName(error) !== null) return failure('duplicate_email');
		throw error;
	}
}

export async function updatePerson(
	actor: SessionUser,
	personId: string,
	input: PersonUpdateInput
): Promise<Outcome<void, PersonUpdateFailure>> {
	const { organisationId } = actor;

	try {
		return await getDb().transaction(async (tx) => {
			const [current] = await tx
				.select({
					fullName: people.fullName,
					email: people.email,
					departmentId: people.departmentId,
					userId: people.userId,
					departmentName: departments.name
				})
				.from(people)
				.leftJoin(departments, eq(people.departmentId, departments.id))
				.where(and(eq(people.id, personId), eq(people.organisationId, organisationId)))
				.limit(1);
			if (!current) return failure('not_found');

			const changes: Partial<typeof people.$inferInsert> = {};
			if (input.fullName !== undefined && input.fullName !== current.fullName) {
				changes.fullName = input.fullName;
			}
			if (input.email !== undefined && input.email !== current.email) {
				// The address is also the sign-in; #230 changes both together.
				if (current.userId !== null) return failure('email_locked');
				changes.email = input.email;
			}

			let nextDepartment: { id: string; name: string } | null | undefined;
			if (input.departmentId !== undefined && input.departmentId !== current.departmentId) {
				if (input.departmentId === null) {
					nextDepartment = null;
				} else {
					const [found] = await tx
						.select({ id: departments.id, name: departments.name })
						.from(departments)
						.where(
							and(
								eq(departments.id, input.departmentId),
								eq(departments.organisationId, organisationId)
							)
						)
						.limit(1);
					if (!found) return failure('department_not_found');
					nextDepartment = found;
				}
				changes.departmentId = nextDepartment?.id ?? null;
			}

			// Nothing changes, so nothing is written: `updatedAt` keeps meaning "last edited".
			if (Object.keys(changes).length === 0) return success(undefined);

			await tx
				.update(people)
				.set({ ...changes, updatedAt: new Date() })
				.where(eq(people.id, personId));

			if (nextDepartment !== undefined) {
				await recordActivity(tx, {
					organisationId,
					...actorColumns(actor),
					target: { personId },
					verb: 'person.department.changed',
					payload: {
						fromDepartmentId: current.departmentId,
						fromDepartmentName: current.departmentName,
						toDepartmentId: nextDepartment?.id ?? null,
						toDepartmentName: nextDepartment?.name ?? null
					}
				});
			}
			return success(undefined);
		});
	} catch (error) {
		if (uniqueConstraintName(error) !== null) return failure('duplicate_email');
		throw error;
	}
}

export async function deactivatePerson(
	actor: SessionUser,
	personId: string
): Promise<Outcome<void, PersonDeactivateFailure>> {
	return setActive(actor, personId, false) as Promise<Outcome<void, PersonDeactivateFailure>>;
}

export async function reactivatePerson(
	actor: SessionUser,
	personId: string
): Promise<Outcome<void, PersonReactivateFailure>> {
	return setActive(actor, personId, true) as Promise<Outcome<void, PersonReactivateFailure>>;
}

async function setActive(
	actor: SessionUser,
	personId: string,
	active: boolean
): Promise<Outcome<void, 'not_found' | 'already_inactive' | 'already_active' | 'self'>> {
	const { organisationId } = actor;
	if (!active && actor.personId === personId) return failure('self');

	return getDb().transaction(async (tx) => {
		// The flip is conditional so two admins racing cannot both record it.
		const flipped = await tx
			.update(people)
			.set({ active, updatedAt: new Date() })
			.where(
				and(
					eq(people.id, personId),
					eq(people.organisationId, organisationId),
					eq(people.active, !active)
				)
			)
			.returning({ id: people.id });

		if (flipped.length === 0) {
			const [exists] = await tx
				.select({ id: people.id })
				.from(people)
				.where(and(eq(people.id, personId), eq(people.organisationId, organisationId)))
				.limit(1);
			if (!exists) return failure('not_found');
			return failure(active ? 'already_active' : 'already_inactive');
		}

		await recordActivity(tx, {
			organisationId,
			...actorColumns(actor),
			target: { personId },
			verb: active ? 'person.reactivated' : 'person.deactivated',
			payload: {}
		});
		return success(undefined);
	});
}
