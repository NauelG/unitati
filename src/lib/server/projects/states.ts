import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import type { SessionUser } from '../auth/guards';
import { getDb, type Database, type Transaction } from '../db';
import { constraintViolation, uniqueConstraintName } from '../db/errors';
import { failure, success, type Outcome } from '../shared/outcome';
import { requireManage } from './scope';
import { states, tasks, type State } from './schema';
import {
	createStateInput,
	updateStateInput,
	type CreateStateInput,
	type UpdateStateInput
} from './validation';

/**
 * The state catalogue: the board columns an organisation has chosen.
 *
 * Names, order and count belong to the organisation. The **group** belongs to
 * the product and is fixed when a state is created: `updateStateInput` has no
 * `group`, and no function here writes the column after the insert. Changing a
 * state's group would rewrite what every past move into it meant; to change
 * group, create another state.
 *
 * Board order is (group, position). The `state_group` enum is declared in board
 * order, so `order by "group"` is the group ordinal and `completed` can never
 * sit left of `backlog`.
 */

export type CreateStateFailure = 'duplicate_state_name';
export type RenameStateFailure = CreateStateFailure | 'state_not_found';
export type DeleteStateFailure = 'state_not_found' | 'state_in_use' | 'last_open_state';

/** Where a new task can land: the groups before work is done. */
const OPEN_GROUPS = ['backlog', 'unstarted', 'started'] as const;

export async function listStates(viewer: SessionUser): Promise<State[]> {
	return getDb()
		.select()
		.from(states)
		.where(eq(states.organisationId, viewer.organisationId))
		.orderBy(asc(states.group), asc(states.position), asc(states.name));
}

export type StateWithTaskCount = State & { taskCount: number };

/**
 * `listStates` plus how many tasks sit in each state, for the catalogue screen:
 * it says what a delete would be refused for, and how many tasks stand in the way.
 */
export async function listStatesWithTaskCount(viewer: SessionUser): Promise<StateWithTaskCount[]> {
	const rows = await getDb()
		.select({ state: states, taskCount: sql<number>`count(${tasks.id})::int` })
		.from(states)
		.leftJoin(tasks, eq(tasks.stateId, states.id))
		.where(eq(states.organisationId, viewer.organisationId))
		.groupBy(states.id)
		.orderBy(asc(states.group), asc(states.position), asc(states.name));
	return rows.map(({ state, taskCount }) => ({ ...state, taskCount }));
}

/**
 * Where a task with no stated column lands: the lowest `position` in `backlog`,
 * else `unstarted`, else `started`. `null` only for an organisation with none of
 * the three, which `deleteState` refuses to produce.
 */
export async function defaultTaskState(
	db: Database | Transaction,
	organisationId: string
): Promise<State | null> {
	const [state] = await db
		.select()
		.from(states)
		.where(and(eq(states.organisationId, organisationId), inArray(states.group, OPEN_GROUPS)))
		.orderBy(asc(states.group), asc(states.position), asc(states.name))
		.limit(1);
	return state ?? null;
}

export async function createState(
	actor: SessionUser,
	input: CreateStateInput
): Promise<Outcome<{ id: string }, CreateStateFailure>> {
	requireManage(actor);
	const values = createStateInput.parse(input);

	try {
		return await getDb().transaction(async (tx) => {
			const [last] = await tx
				.select({ position: sql<number>`coalesce(max(${states.position}), -1)::int` })
				.from(states)
				.where(
					and(eq(states.organisationId, actor.organisationId), eq(states.group, values.group))
				);

			const [row] = await tx
				.insert(states)
				.values({
					organisationId: actor.organisationId,
					name: values.name,
					group: values.group,
					position: (last?.position ?? -1) + 1
				})
				.returning({ id: states.id });
			return success({ id: row.id });
		});
	} catch (error) {
		if (uniqueConstraintName(error) === 'states_org_name') return failure('duplicate_state_name');
		throw error;
	}
}

export async function renameState(
	actor: SessionUser,
	stateId: string,
	input: UpdateStateInput
): Promise<Outcome<void, RenameStateFailure>> {
	requireManage(actor);
	const values = updateStateInput.parse(input);

	try {
		const updated = await getDb()
			.update(states)
			.set({ name: values.name, updatedAt: new Date() })
			.where(and(eq(states.id, stateId), eq(states.organisationId, actor.organisationId)))
			.returning({ id: states.id });
		return updated.length === 0 ? failure('state_not_found') : success(undefined);
	} catch (error) {
		if (uniqueConstraintName(error) === 'states_org_name') return failure('duplicate_state_name');
		throw error;
	}
}

/**
 * Moves a state to `toIndex` among the states of **its own group** (0 is the
 * left-most; past the end clamps). A state cannot leave its group — that is the
 * rule, not a limitation — so there is no argument that could say otherwise.
 */
export async function reorderState(
	actor: SessionUser,
	stateId: string,
	toIndex: number
): Promise<Outcome<void, 'state_not_found'>> {
	requireManage(actor);

	return getDb().transaction(async (tx) => {
		const [state] = await tx
			.select()
			.from(states)
			.where(and(eq(states.id, stateId), eq(states.organisationId, actor.organisationId)));
		if (!state) return failure('state_not_found' as const);

		const siblings = await tx
			.select({ id: states.id })
			.from(states)
			.where(and(eq(states.organisationId, actor.organisationId), eq(states.group, state.group)))
			.orderBy(asc(states.position), asc(states.name))
			.for('update');

		const ids = siblings.map((sibling) => sibling.id).filter((id) => id !== stateId);
		ids.splice(Math.max(0, Math.min(toIndex, ids.length)), 0, stateId);

		for (const [position, id] of ids.entries()) {
			await tx.update(states).set({ position, updatedAt: new Date() }).where(eq(states.id, id));
		}

		return success(undefined);
	});
}

/**
 * Refused while any task sits in the state (the foreign key is `restrict`, and
 * the refusal is surfaced as a typed error rather than a 500), and refused when
 * it would leave no state in `backlog`, `unstarted` or `started` — a new task
 * needs somewhere to land.
 */
export async function deleteState(
	actor: SessionUser,
	stateId: string
): Promise<Outcome<void, DeleteStateFailure>> {
	requireManage(actor);

	try {
		return await getDb().transaction(async (tx) => {
			const open = await tx
				.select({ id: states.id })
				.from(states)
				.where(
					and(eq(states.organisationId, actor.organisationId), inArray(states.group, OPEN_GROUPS))
				)
				.for('update');

			const [state] = await tx
				.select({ id: states.id })
				.from(states)
				.where(and(eq(states.id, stateId), eq(states.organisationId, actor.organisationId)));
			if (!state) return failure('state_not_found' as const);

			if (open.length === 1 && open[0].id === stateId) return failure('last_open_state' as const);

			const [occupant] = await tx
				.select({ id: tasks.id })
				.from(tasks)
				.where(eq(tasks.stateId, stateId))
				.limit(1);
			if (occupant) return failure('state_in_use' as const);

			await tx.delete(states).where(eq(states.id, stateId));
			return success(undefined);
		});
	} catch (error) {
		// A task arrived between the check and the delete: the constraint is the
		// authority, the query above is only the polite way of asking first.
		if (constraintViolation(error)?.code === '23503') return failure('state_in_use');
		throw error;
	}
}
