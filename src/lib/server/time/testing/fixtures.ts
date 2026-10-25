import { and, eq } from 'drizzle-orm';
import { getDb } from '../../db';
import { createViewer } from '../../assets/testing/fixtures';
import {
	createProjectRow,
	createTaskRow,
	createWorkspace,
	statesByGroup
} from '../../projects/testing/fixtures';
import { createQueue, createTicket } from '../../service-desk/testing/fixtures';
import { timeEntryTypes } from '../schema';
import { setTimeTracking } from '../settings';

/**
 * The scene the time specs share: an organisation with its people by role, a
 * ticket, and a task in a project. Rows go in straight, bypassing the domains
 * on purpose; tracking is switched on through `setTimeTracking`, because that
 * is what seeds the default type the rest of the scene relies on.
 */
export async function createTimeScene(options: { enabled?: boolean } = {}) {
	const { organisation, admin, technician, employee } = await createWorkspace();
	const colleague = await createViewer(organisation.id, 'technician', 'Carla Colleague');

	const queue = await createQueue(organisation.id);
	const ticket = await createTicket(organisation.id, queue.id, employee.personId!);

	const states = await statesByGroup(organisation.id);
	const project = await createProjectRow(organisation.id, { name: 'Office move' });
	const task = await createTaskRow(organisation.id, project.id, states.unstarted.id);

	if (options.enabled !== false) {
		const enabled = await setTimeTracking(admin, true);
		if (!enabled.ok) throw new Error('The scene could not switch time tracking on.');
	}

	return { organisation, admin, technician, employee, colleague, ticket, task, project, states };
}

export async function defaultTypeOf(organisationId: string) {
	const [type] = await getDb()
		.select()
		.from(timeEntryTypes)
		.where(
			and(eq(timeEntryTypes.organisationId, organisationId), eq(timeEntryTypes.isDefault, true))
		);
	return type;
}
