import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import {
	assignRow,
	createProjectRow,
	createTaskRow,
	createWorkspace,
	statesByGroup
} from '#lib/server/projects/testing/fixtures.js';
import { createViewer } from '#lib/server/assets/testing/fixtures.js';
import { getTask, listTasks } from '#lib/server/projects/index.js';
import { actionEvent, outcomeOf } from '#lib/server/projects/testing/action-event.js';
import { listActivity } from '#lib/server/activity/index.js';
import { linkTicketToTask, relatedTo } from '#lib/server/links/index.js';
import { createQueue, createTicket } from '#lib/server/service-desk/testing/fixtures.js';
import { getDb } from '#lib/server/db/index.js';
import { projectMembers, projects } from '#lib/server/projects/schema.js';
import { actions, load } from './+page.server';

async function setup() {
	const workspace = await createWorkspace();
	const project = await createProjectRow(workspace.organisation.id);
	const states = await statesByGroup(workspace.organisation.id);
	const task = await createTaskRow(workspace.organisation.id, project.id, states.unstarted.id);
	await assignRow(workspace.organisation.id, task.id, workspace.employee.personId!);
	return { ...workspace, project, states, task, params: { taskTag: task.taskTag } };
}

describe('writing to a task record', () => {
	it('answers 403 to every write from the assigned employee', async () => {
		const { employee, states, params } = await setup();

		for (const run of [
			() => actions.update(actionEvent(employee, { title: 'Nope' }, params)),
			() => actions.changeState(actionEvent(employee, { stateId: states.completed.id }, params)),
			() => actions.setAssignees(actionEvent(employee, { personIds: [] }, params)),
			() =>
				actions.moveToProject(actionEvent(employee, { projectId: crypto.randomUUID() }, params)),
			() => actions.unlinkTicket(actionEvent(employee, { recordId: crypto.randomUUID() }, params))
		]) {
			expect((await outcomeOf(run)).thrown?.status).toBe(403);
		}
	});

	it('moves the task to the chosen state', async () => {
		const { technician, states, params } = await setup();

		const { returned } = await outcomeOf(() =>
			actions.changeState(actionEvent(technician, { stateId: states.completed.id }, params))
		);

		const task = await getTask(technician, params.taskTag);
		expect(returned).toMatchObject({ action: 'changeState' });
		expect(task.ok && task.value.stateGroup).toBe('completed');
	});

	it('moves the task to another project and refuses the one it is in', async () => {
		const { technician, organisation, params } = await setup();
		const other = await createProjectRow(organisation.id, { name: 'Warehouse' });

		const moved = await outcomeOf(() =>
			actions.moveToProject(actionEvent(technician, { projectId: other.id }, params))
		);
		const task = await getTask(technician, params.taskTag);
		expect(moved.returned).toMatchObject({ action: 'moveToProject' });
		expect(task.ok && task.value.projectId).toBe(other.id);

		const same = await outcomeOf(() =>
			actions.moveToProject(actionEvent(technician, { projectId: other.id }, params))
		);
		expect(same.returned?.status).toBe(400);
	});

	it('refuses a state that is not in the catalogue', async () => {
		const { technician, params } = await setup();

		const { returned } = await outcomeOf(() =>
			actions.changeState(actionEvent(technician, { stateId: crypto.randomUUID() }, params))
		);

		expect(returned?.status).toBe(400);
	});

	it('assigns three people and each finds the task among theirs', async () => {
		const { technician, organisation, params, task } = await setup();
		const people = await Promise.all(
			['Ana One', 'Bea Two', 'Cai Three'].map((name) =>
				createViewer(organisation.id, 'employee', name)
			)
		);

		const { returned } = await outcomeOf(() =>
			actions.setAssignees(
				actionEvent(technician, { personIds: people.map((p) => p.personId!) }, params)
			)
		);

		expect(returned).toMatchObject({ action: 'setAssignees' });
		for (const person of people) {
			const mine = await listTasks(technician, { assignee: person.personId! });
			expect(mine.map((t) => t.id)).toContain(task.id);
		}
	});

	it('edits title and description, and refuses a blank title', async () => {
		const { technician, params } = await setup();

		const ok = await outcomeOf(() =>
			actions.update(
				actionEvent(technician, { title: 'Renamed', description: 'Why', dueDate: '' }, params)
			)
		);
		expect(ok.returned).toMatchObject({ action: 'update' });
		const task = await getTask(technician, params.taskTag);
		expect(task.ok && task.value).toMatchObject({ title: 'Renamed', description: 'Why' });

		const blank = await outcomeOf(() =>
			actions.update(actionEvent(technician, { title: ' ', description: '', dueDate: '' }, params))
		);
		expect(blank.returned?.status).toBe(400);
	});

	it('leaves the other fields alone when a post carries a single one', async () => {
		const { technician, params } = await setup();
		await outcomeOf(() =>
			actions.update(
				actionEvent(technician, { title: 'Keep me', description: 'Keep this too' }, params)
			)
		);

		const { returned } = await outcomeOf(() =>
			actions.update(actionEvent(technician, { dueDate: '2026-12-24' }, params))
		);

		const task = await getTask(technician, params.taskTag);
		expect(returned).toMatchObject({ action: 'update', taskTag: params.taskTag });
		expect(task.ok && task.value).toMatchObject({
			title: 'Keep me',
			description: 'Keep this too',
			dueDate: '2026-12-24'
		});

		await outcomeOf(() => actions.update(actionEvent(technician, { dueDate: '' }, params)));
		const cleared = await getTask(technician, params.taskTag);
		expect(cleared.ok && cleared.value).toMatchObject({ title: 'Keep me', dueDate: null });
	});

	it('renames the code and answers with the new one', async () => {
		const { technician, params } = await setup();

		const { returned } = await outcomeOf(() =>
			actions.update(actionEvent(technician, { taskTag: 'TSK-RENAMED' }, params))
		);

		expect(returned).toMatchObject({ action: 'update', taskTag: 'TSK-RENAMED' });
		const renamed = await getTask(technician, 'TSK-RENAMED');
		expect(renamed.ok).toBe(true);
	});

	it('refuses a duplicate or reserved code with an error on the code field', async () => {
		const { technician, organisation, project, states, params } = await setup();
		const other = await createTaskRow(organisation.id, project.id, states.unstarted.id);

		const duplicate = await outcomeOf(() =>
			actions.update(actionEvent(technician, { taskTag: other.taskTag }, params))
		);
		const reserved = await outcomeOf(() =>
			actions.update(actionEvent(technician, { taskTag: 'new' }, params))
		);

		for (const { returned } of [duplicate, reserved]) {
			expect(returned?.status).toBe(400);
			expect(returned?.data).toMatchObject({ action: 'update', field: 'taskTag' });
		}
	});

	it('refuses a description over the rich text limit', async () => {
		const { technician, params } = await setup();

		const { returned } = await outcomeOf(() =>
			actions.update(actionEvent(technician, { description: 'x'.repeat(20_001) }, params))
		);

		expect(returned?.status).toBe(400);
		expect(returned?.data).toMatchObject({ field: 'description' });
	});

	it('refuses writes on a task whose project is archived', async () => {
		const { technician, project, states, params } = await setup();
		const { archiveProject } = await import('#lib/server/projects/index.js');
		await archiveProject(technician, project.id);

		const { returned } = await outcomeOf(() =>
			actions.changeState(actionEvent(technician, { stateId: states.completed.id }, params))
		);

		expect(returned?.status).toBe(400);
	});
});

describe('unlinking a ticket from a task record', () => {
	async function linked() {
		const base = await setup();
		const queue = await createQueue(base.organisation.id);
		const ticket = await createTicket(base.organisation.id, queue.id, base.employee.personId!, {
			subject: 'Moving my desk'
		});
		await linkTicketToTask(base.technician, { ticketId: ticket.id, taskId: base.task.id });
		return { ...base, queue, ticket };
	}

	it('removes the link and writes the entry on the ticket, not on the task', async () => {
		const { technician, organisation, task, ticket, params } = await linked();

		const { returned } = await outcomeOf(() =>
			actions.unlinkTicket(actionEvent(technician, { recordId: ticket.id }, params))
		);

		expect(returned).toMatchObject({ action: 'unlinkTicket' });
		expect(await relatedTo(technician, { kind: 'task', id: task.id })).toEqual([]);
		const onTicket = await listActivity({
			organisationId: organisation.id,
			target: { ticketId: ticket.id }
		});
		expect(onTicket.map((entry) => entry.verb)).toContain('link.task.removed');
		const onTask = await listActivity({
			organisationId: organisation.id,
			target: { taskId: task.id }
		});
		expect(onTask.map((entry) => entry.verb)).not.toContain('link.task.removed');
	});

	it('works on a task of an archived project', async () => {
		const { technician, project, task, ticket, params } = await linked();
		const { archiveProject } = await import('#lib/server/projects/index.js');
		await archiveProject(technician, project.id);

		const { returned } = await outcomeOf(() =>
			actions.unlinkTicket(actionEvent(technician, { recordId: ticket.id }, params))
		);

		expect(returned).toMatchObject({ action: 'unlinkTicket' });
		expect(await relatedTo(technician, { kind: 'task', id: task.id })).toEqual([]);
	});

	it('shows the assigned employee only their own tickets', async () => {
		const { employee, technician, organisation, queue, task, ticket } = await linked();
		const colleague = await createViewer(organisation.id, 'employee', 'Colleague');
		const theirs = await createTicket(organisation.id, queue.id, colleague.personId!, {
			subject: 'Not yours'
		});
		await linkTicketToTask(technician, { ticketId: theirs.id, taskId: task.id });

		const groups = await relatedTo(employee, { kind: 'task', id: task.id });

		expect(groups.flatMap((group) => group.items.map((item) => item.ref.id))).toEqual([ticket.id]);
	});
});

describe('a task of a members-only project', () => {
	async function closedSetup() {
		const base = await setup();
		const { organisation, project, technician } = base;
		const member = await createViewer(organisation.id, 'technician', 'Mia Member');
		const outsider = await createViewer(organisation.id, 'technician', 'Otto Outsider');
		await getDb()
			.update(projects)
			.set({ visibility: 'members' })
			.where(eq(projects.id, project.id));
		await getDb()
			.insert(projectMembers)
			.values(
				[technician, member].map((viewer) => ({
					projectId: project.id,
					personId: viewer.personId!,
					organisationId: organisation.id
				}))
			);
		return { ...base, member, outsider };
	}

	it('refuses to assign a non-member with a message that points at membership', async () => {
		const { technician, outsider, params } = await closedSetup();

		const { returned } = await outcomeOf(() =>
			actions.setAssignees(actionEvent(technician, { personIds: [outsider.personId!] }, params))
		);

		expect(returned?.status).toBe(400);
		expect(returned?.data).toMatchObject({
			action: 'setAssignees',
			message: expect.stringContaining('miembro')
		});
	});

	it('offers only the members in the assignee picker', async () => {
		const { technician, member, outsider, params } = await closedSetup();

		const data = (await load({
			locals: { user: technician },
			params
		} as never)) as { people: { id: string }[] };

		const ids = data.people.map((person) => person.id);
		expect(ids).toContain(member.personId);
		expect(ids).not.toContain(outsider.personId);
	});

	it('answers 404 to a technician who is not a member', async () => {
		const { outsider, params } = await closedSetup();

		const { thrown } = await outcomeOf(() => load({ locals: { user: outsider }, params } as never));

		expect(thrown?.status).toBe(404);
	});
});
