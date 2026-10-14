import { describe, expect, it } from 'vitest';
import { assignRow } from '#lib/server/projects/testing/fixtures.js';
import {
	createProjectRow,
	createTaskRow,
	createWorkspace,
	statesByGroup
} from '#lib/server/projects/testing/fixtures.js';
import { getProject, listTasks } from '#lib/server/projects/index.js';
import { actionEvent, outcomeOf } from '#lib/server/projects/testing/action-event.js';
import { actions } from './+page.server';

async function setup() {
	const workspace = await createWorkspace();
	const project = await createProjectRow(workspace.organisation.id);
	return { ...workspace, project, params: { tag: project.projectTag } };
}

describe('writing to a project record', () => {
	it('answers 403 to every write from a viewer who may only read assigned work', async () => {
		const { employee, params } = await setup();

		for (const run of [
			() => actions.update(actionEvent(employee, { name: 'Nope' }, params)),
			() => actions.archive(actionEvent(employee, {}, params)),
			() => actions.unarchive(actionEvent(employee, {}, params)),
			() => actions.createTask(actionEvent(employee, { title: 'Nope' }, params))
		]) {
			expect((await outcomeOf(run)).thrown?.status).toBe(403);
		}
	});

	it('sends an anonymous visitor to sign in instead of writing', async () => {
		const { params } = await setup();

		const { thrown } = await outcomeOf(() => actions.archive(actionEvent(null, {}, params)));

		expect(thrown?.status).toBe(303);
	});

	it('archives and restores, keeping the project and its tasks reachable', async () => {
		const { technician, project, organisation, params } = await setup();
		const states = await statesByGroup(organisation.id);
		await createTaskRow(organisation.id, project.id, states.unstarted.id);

		await actions.archive(actionEvent(technician, {}, params));
		const archived = await getProject(technician, project.projectTag);
		expect(archived.ok && archived.value.archivedAt).toBeTruthy();
		expect(await listTasks(technician, { projectId: project.id })).toHaveLength(1);

		await actions.unarchive(actionEvent(technician, {}, params));
		const restored = await getProject(technician, project.projectTag);
		expect(restored.ok && restored.value.archivedAt).toBeNull();
	});

	it('creates a task in the default state from a title alone', async () => {
		const { technician, project, params } = await setup();

		const { returned } = await outcomeOf(() =>
			actions.createTask(actionEvent(technician, { title: 'Pack the boxes' }, params))
		);

		const [task] = await listTasks(technician, { projectId: project.id });
		expect(task).toMatchObject({ title: 'Pack the boxes', stateGroup: 'backlog' });
		expect(returned).toMatchObject({ action: 'createTask' });
	});

	it('refuses a blank task title and creates nothing', async () => {
		const { technician, project, params } = await setup();

		const { returned } = await outcomeOf(() =>
			actions.createTask(actionEvent(technician, { title: ' ' }, params))
		);

		expect(returned?.status).toBe(400);
		expect(await listTasks(technician, { projectId: project.id })).toEqual([]);
	});

	it('refuses to add a task to an archived project', async () => {
		const { technician, project, params } = await setup();
		await actions.archive(actionEvent(technician, {}, params));

		const { returned } = await outcomeOf(() =>
			actions.createTask(actionEvent(technician, { title: 'Too late' }, params))
		);

		expect(returned?.status).toBe(400);
		expect(await listTasks(technician, { projectId: project.id })).toEqual([]);
	});

	it('edits the project and keeps the tag unique', async () => {
		const { technician, organisation, project, params } = await setup();
		await createProjectRow(organisation.id, { projectTag: 'TAKEN' });

		const ok = await outcomeOf(() =>
			actions.update(
				actionEvent(
					technician,
					{ name: 'Renamed', description: '', ownerPersonId: '', dueDate: '' },
					params
				)
			)
		);
		expect(ok.returned).toMatchObject({ action: 'update' });
		const renamed = await getProject(technician, project.projectTag);
		expect(renamed.ok && renamed.value.name).toBe('Renamed');

		const clash = await outcomeOf(() =>
			actions.update(
				actionEvent(
					technician,
					{ name: 'Renamed', projectTag: 'TAKEN', ownerPersonId: '', dueDate: '' },
					params
				)
			)
		);
		expect(clash.returned?.status).toBe(400);
		expect(clash.returned?.data).toMatchObject({ field: 'projectTag' });
	});

	it('still refuses writes to an employee who has a task in the project', async () => {
		const { employee, params, project, organisation } = await setup();
		const states = await statesByGroup(organisation.id);
		const task = await createTaskRow(organisation.id, project.id, states.unstarted.id);
		await assignRow(organisation.id, task.id, employee.personId!);

		expect(
			(await outcomeOf(() => actions.archive(actionEvent(employee, {}, params)))).thrown?.status
		).toBe(403);
	});
});
