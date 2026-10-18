import { describe, expect, it } from 'vitest';
import { recordActivity } from '../activity';
import { getDb } from '../db';
import {
	createProjectRow,
	createTaskRow,
	createWorkspace,
	statesByGroup
} from '../projects/testing/fixtures';
import { createQueue, createTicket } from '../service-desk/testing/fixtures';
import { linkTicketToProject, linkTicketToTask, projectTimeline, taskTimeline } from './index';

/**
 * The timeline of a task and of a project: their own events from `activity`
 * merged with the tickets linked to them (ADR 0009). The routes and the API both
 * read it through these two functions.
 */

async function scene() {
	const base = await createWorkspace();
	const { organisation, technician, employee } = base;
	const states = await statesByGroup(organisation.id);
	const project = await createProjectRow(organisation.id);
	const task = await createTaskRow(organisation.id, project.id, states.started.id);
	const queue = await createQueue(organisation.id);
	const ticket = await createTicket(organisation.id, queue.id, employee.personId!, {});

	await getDb().transaction(async (tx) => {
		await recordActivity(tx, {
			organisationId: organisation.id,
			actorPersonId: technician.personId,
			target: { taskId: task.id },
			verb: 'task.created',
			payload: { taskTag: task.taskTag, title: task.title }
		});
		await recordActivity(tx, {
			organisationId: organisation.id,
			actorPersonId: technician.personId,
			target: { projectId: project.id },
			verb: 'project.created',
			payload: { projectTag: project.projectTag, name: project.name }
		});
	});

	return { ...base, project, task, ticket };
}

describe('taskTimeline', () => {
	it('merges the task’s events with the tickets linked to it, newest first', async () => {
		const { technician, task, ticket } = await scene();
		await linkTicketToTask(technician, { ticketId: ticket.id, taskId: task.id });

		const items = await taskTimeline(technician, task.id);

		expect(items.map((item) => item.kind)).toEqual(['ticket', 'activity']);
	});

	it('shows only the events of that task', async () => {
		const { technician, task } = await scene();
		const other = await createProjectRow(technician.organisationId);
		const states = await statesByGroup(technician.organisationId);
		await createTaskRow(technician.organisationId, other.id, states.started.id);

		const items = await taskTimeline(technician, task.id);

		expect(items).toHaveLength(1);
	});
});

describe('projectTimeline', () => {
	it('merges the project’s events with the tickets linked to the project itself, not through a task', async () => {
		const { technician, project, task, ticket } = await scene();
		await linkTicketToProject(technician, { ticketId: ticket.id, projectId: project.id });
		const viaTask = await createTicket(
			technician.organisationId,
			ticket.queueId,
			technician.personId!,
			{}
		);
		await linkTicketToTask(technician, { ticketId: viaTask.id, taskId: task.id });

		const items = await projectTimeline(technician, project.id);

		expect(items.map((item) => item.kind).sort()).toEqual(['activity', 'ticket']);
		expect(items.filter((item) => item.kind === 'ticket').map((item) => item.id)).toEqual([
			ticket.id
		]);
	});
});
