import { asc, eq } from 'drizzle-orm';
import type { StateGroup } from '#lib/domain/status.js';
import { getDb } from '../../db';
import { createOrganisation, createViewer } from '../../assets/testing/fixtures';
import { ensureDefaultStates } from '../defaults';
import { projects, states, taskAssignees, tasks } from '../schema';

/**
 * Row builders for the projects specs. They insert straight into the tables,
 * bypassing the domain functions on purpose: a schema or scope test should not
 * depend on the domain layer agreeing with it. Organisations, people and
 * viewers come from `assets/testing/fixtures.ts`.
 *
 * **Nothing here names a state.** A spec finds a state by its group, because the
 * names are the organisation's and the catalogue is free to rename them.
 */

/** An organisation with its default states, as `provisionFirstAdmin` leaves it. */
export async function createWorkspace() {
	const organisation = await createOrganisation();
	await ensureDefaultStates(getDb(), organisation.id);

	return {
		organisation,
		admin: await createViewer(organisation.id, 'admin', 'Ada Admin'),
		technician: await createViewer(organisation.id, 'technician', 'Tom Technician'),
		employee: await createViewer(organisation.id, 'employee', 'Eva Employee')
	};
}

export async function statesByGroup(organisationId: string) {
	const rows = await getDb()
		.select()
		.from(states)
		.where(eq(states.organisationId, organisationId))
		.orderBy(asc(states.position));
	const byGroup = (group: StateGroup) => {
		const row = rows.find((state) => state.group === group);
		if (!row) throw new Error(`The organisation has no ${group} state.`);
		return row;
	};

	return {
		backlog: byGroup('backlog'),
		unstarted: byGroup('unstarted'),
		started: byGroup('started'),
		completed: byGroup('completed'),
		cancelled: byGroup('cancelled')
	};
}

export async function createStateRow(
	organisationId: string,
	name: string,
	group: StateGroup,
	position = 0
) {
	const [state] = await getDb()
		.insert(states)
		.values({ organisationId, name, group, position })
		.returning();
	return state;
}

type ProjectOverrides = Partial<typeof projects.$inferInsert>;

export async function createProjectRow(organisationId: string, overrides: ProjectOverrides = {}) {
	const [project] = await getDb()
		.insert(projects)
		.values({ organisationId, name: 'Office move', ...overrides })
		.returning();
	return project;
}

type TaskOverrides = Partial<typeof tasks.$inferInsert>;

export async function createTaskRow(
	organisationId: string,
	projectId: string,
	stateId: string,
	overrides: TaskOverrides = {}
) {
	const [task] = await getDb()
		.insert(tasks)
		.values({
			organisationId,
			projectId,
			stateId,
			title: 'Pack the boxes',
			position: '1000',
			...overrides
		})
		.returning();
	return task;
}

export async function assignRow(organisationId: string, taskId: string, personId: string) {
	await getDb().insert(taskAssignees).values({ organisationId, taskId, personId });
}
