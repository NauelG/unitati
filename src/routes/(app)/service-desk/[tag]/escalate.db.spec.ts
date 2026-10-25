import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { getDb } from '../../../../lib/server/db';
import {
	createProjectRow,
	createTaskRow,
	createWorkspace,
	statesByGroup
} from '#lib/server/projects/testing/fixtures.js';
import { actionEvent, outcomeOf } from '#lib/server/projects/testing/action-event.js';
import { tickets } from '../../../../lib/server/service-desk/schema';
import { createQueue, createTicket } from '#lib/server/service-desk/testing/fixtures.js';
import { relatedTo } from '#lib/server/links/index.js';
import { actions } from './+page.server';
import { GET as taskSearch } from './escalate/tasks/+server';
import { GET as linkableProjects } from './escalate/linkable-projects/+server';

async function scene(status: typeof tickets.$inferInsert.status = 'in_progress') {
	const base = await createWorkspace();
	const { organisation, employee, technician } = base;
	const queue = await createQueue(organisation.id);
	const ticket = await createTicket(organisation.id, queue.id, employee.personId!, {
		status,
		priority: 'high',
		assigneePersonId: technician.personId!
	});
	const states = await statesByGroup(organisation.id);
	const project = await createProjectRow(organisation.id, { projectTag: 'PRJ-0001', name: 'Move' });
	const task = await createTaskRow(organisation.id, project.id, states.unstarted.id, {
		taskTag: 'TSK-0001',
		title: 'Book the van'
	});
	return { ...base, queue, ticket, project, task, params: { tag: ticket.ticketTag } };
}

async function ticketRow(id: string) {
	const [row] = await getDb().select().from(tickets).where(eq(tickets.id, id));
	return row;
}

const SAME = ['status', 'priority', 'queueId', 'assigneePersonId', 'updatedAt'] as const;

describe('escalating from the ticket record', () => {
	it('creates a task with the edited title, links it and leaves the ticket alone', async () => {
		const { technician, ticket, project, params } = await scene('closed');
		const before = await ticketRow(ticket.id);

		const { returned } = await outcomeOf(() =>
			actions.escalate(
				actionEvent(
					technician,
					{ kind: 'new_task', projectId: project.id, title: 'Edited title', description: 'Why' },
					params
				)
			)
		);
		expect(returned).toMatchObject({ action: 'escalate', escalated: { kind: 'task' } });

		const groups = await relatedTo(technician, { kind: 'ticket', id: ticket.id });
		const resolved = groups.find((group) => group.relation === 'resolved_in');
		expect(resolved?.items[0].ref.title).toBe('Edited title');

		const after = await ticketRow(ticket.id);
		for (const key of SAME) expect(after[key]).toEqual(before[key]);
	});

	it('links an existing task, an existing project and a new project', async () => {
		const { technician, ticket, task, project, params } = await scene();
		const before = await ticketRow(ticket.id);

		const targets: Record<string, string>[] = [
			{ kind: 'existing_task', taskId: task.id },
			{ kind: 'existing_project', projectId: project.id },
			{ kind: 'new_project', name: 'Fresh', ownerPersonId: technician.personId! }
		];
		for (const fields of targets) {
			const { returned } = await outcomeOf(() =>
				actions.escalate(actionEvent(technician, fields, params))
			);
			expect(returned).toMatchObject({ action: 'escalate' });
		}

		const groups = await relatedTo(technician, { kind: 'ticket', id: ticket.id });
		expect(groups.find((g) => g.relation === 'resolved_in')?.items).toHaveLength(1);
		expect(groups.find((g) => g.relation === 'handled_in')?.items).toHaveLength(2);

		const after = await ticketRow(ticket.id);
		for (const key of SAME) expect(after[key]).toEqual(before[key]);
	});

	it('refuses a payload that is not one of the four targets', async () => {
		const { technician, params } = await scene();

		const { returned } = await outcomeOf(() =>
			actions.escalate(actionEvent(technician, { kind: 'new_task', projectId: 'nope' }, params))
		);

		expect(returned?.data).toMatchObject({ action: 'escalate' });
	});

	it('unlinks a task after it was linked, and answers 403 to the requester', async () => {
		const { technician, employee, task, ticket, params } = await scene();
		await actions.escalate(
			actionEvent(technician, { kind: 'existing_task', taskId: task.id }, params)
		);

		const denied = await outcomeOf(() =>
			actions.unlinkTask(actionEvent(employee, { recordId: task.id }, params))
		);
		expect(denied.thrown?.status).toBe(403);
		const deniedProject = await outcomeOf(() =>
			actions.escalate(actionEvent(employee, { kind: 'existing_task', taskId: task.id }, params))
		);
		expect(deniedProject.thrown?.status).toBe(403);

		const { returned } = await outcomeOf(() =>
			actions.unlinkTask(actionEvent(technician, { recordId: task.id }, params))
		);
		expect(returned).toMatchObject({ action: 'unlinkTask' });

		expect(await relatedTo(technician, { kind: 'ticket', id: ticket.id })).toHaveLength(0);
	});
});

describe('the escalation pickers', () => {
	it('mark a task already linked as unselectable and leave archived projects out', async () => {
		const { organisation, technician, task, params } = await scene();
		await actions.escalate(
			actionEvent(technician, { kind: 'existing_task', taskId: task.id }, params)
		);
		const states = await statesByGroup(organisation.id);
		const archived = await createProjectRow(organisation.id, {
			projectTag: 'PRJ-0002',
			name: 'Old',
			archivedAt: new Date()
		});
		await createTaskRow(organisation.id, archived.id, states.unstarted.id, {
			taskTag: 'TSK-0002',
			title: 'Hidden'
		});

		type Option = { label: string; disabled: boolean };
		const ask = async (
			handler: (event: never) => Response | Promise<Response>
		): Promise<Option[]> =>
			(
				await handler({
					locals: { user: technician },
					params,
					url: new URL('http://localhost/x?q=')
				} as never)
			).json();

		const tasks = await ask(taskSearch);
		expect(tasks).toHaveLength(1);
		expect(tasks[0]).toMatchObject({ disabled: true });
		expect(tasks[0].label).toContain('Ya vinculada');
		expect((await ask(linkableProjects)).map((p) => p.label.split(' · ')[0])).toEqual(['PRJ-0001']);
	});
});
