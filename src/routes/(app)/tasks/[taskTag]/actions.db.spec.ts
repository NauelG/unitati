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
import { actions } from './+page.server';

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
			() => actions.moveToProject(actionEvent(employee, { projectId: crypto.randomUUID() }, params))
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
