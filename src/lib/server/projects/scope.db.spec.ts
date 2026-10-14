import { describe, expect, it } from 'vitest';
import {
	createOrganisation,
	createViewer,
	createViewerWithoutPerson
} from '../assets/testing/fixtures';
import { getProject, getTask, listProjects, listTasks, projectProgress } from './index';
import {
	assignRow,
	createProjectRow,
	createTaskRow,
	createWorkspace,
	statesByGroup
} from './testing/fixtures';

/**
 * Three projects, so the scope has something to include and something to leave
 * out: one the employee is on, one they are not, and one archived they are on.
 */
async function scenario() {
	const workspace = await createWorkspace();
	const { organisation, employee } = workspace;
	const states = await statesByGroup(organisation.id);

	const mine = await createProjectRow(organisation.id, { name: 'Mine' });
	const theirs = await createProjectRow(organisation.id, { name: 'Theirs' });
	const old = await createProjectRow(organisation.id, { name: 'Old', archivedAt: new Date() });

	const assigned = await createTaskRow(organisation.id, mine.id, states.started.id, {
		title: 'Assigned to me'
	});
	const done = await createTaskRow(organisation.id, mine.id, states.completed.id, {
		title: 'Done by me'
	});
	const colleagues = await createTaskRow(organisation.id, mine.id, states.started.id, {
		title: 'Somebody else’s'
	});
	const unowned = await createTaskRow(organisation.id, mine.id, states.backlog.id, {
		title: 'Nobody’s'
	});
	const elsewhere = await createTaskRow(organisation.id, theirs.id, states.started.id, {
		title: 'In another project'
	});
	const archivedTask = await createTaskRow(organisation.id, old.id, states.started.id, {
		title: 'In an archived project'
	});

	const colleague = workspace.technician.personId!;
	await assignRow(organisation.id, assigned.id, employee.personId!);
	await assignRow(organisation.id, done.id, employee.personId!);
	await assignRow(organisation.id, archivedTask.id, employee.personId!);
	await assignRow(organisation.id, colleagues.id, colleague);
	await assignRow(organisation.id, elsewhere.id, colleague);

	return {
		...workspace,
		states,
		mine,
		theirs,
		old,
		assigned,
		done,
		colleagues,
		unowned,
		elsewhere
	};
}

describe('the project scope', () => {
	it('shows staff the whole organisation', async () => {
		const { admin, technician } = await scenario();

		for (const staff of [admin, technician]) {
			expect(await listTasks(staff)).toHaveLength(6);
			expect(await listProjects(staff)).toHaveLength(2);
			expect(await listProjects(staff, { archived: true })).toHaveLength(1);
		}
	});

	it('shows an employee only the tasks assigned to them', async () => {
		const { employee } = await scenario();

		const titles = (await listTasks(employee)).map((task) => task.title).sort();

		expect(titles).toEqual(['Assigned to me', 'Done by me', 'In an archived project']);
	});

	it('shows an employee the projects that contain one of their tasks, and no others', async () => {
		const { employee } = await scenario();

		expect((await listProjects(employee)).map((project) => project.name)).toEqual(['Mine']);
		expect((await listProjects(employee, { archived: true })).map((p) => p.name)).toEqual(['Old']);
	});

	it('answers "not found" for a task or project the employee cannot see, as for one that is missing', async () => {
		const { employee, colleagues, elsewhere, theirs, mine } = await scenario();

		expect(await getTask(employee, colleagues.taskTag)).toEqual({
			ok: false,
			error: 'task_not_found'
		});
		expect(await getTask(employee, elsewhere.taskTag)).toEqual({
			ok: false,
			error: 'task_not_found'
		});
		expect(await getProject(employee, theirs.projectTag)).toEqual({
			ok: false,
			error: 'project_not_found'
		});
		expect((await getProject(employee, mine.projectTag)).ok).toBe(true);
	});

	it('does not widen the filters: an employee asking for somebody else’s tasks gets none', async () => {
		const { employee, technician } = await scenario();

		expect(await listTasks(employee, { assignee: technician.personId! })).toEqual([]);
		expect((await listTasks(employee, { group: 'started' })).map((t) => t.title).sort()).toEqual([
			'Assigned to me',
			'In an archived project'
		]);
	});

	it('shows an employee the progress of their own tasks, not of everyone’s', async () => {
		const { employee, admin, mine } = await scenario();

		const theirs = await projectProgress(employee, mine.id);
		const everyones = await projectProgress(admin, mine.id);

		expect(theirs.ok && theirs.value.total).toBe(2);
		expect(theirs.ok && theirs.value.ratio).toBe(0.5);
		expect(everyones.ok && everyones.value.total).toBe(4);
	});

	it('shows a viewer with only assigned-view and no directory record nothing at all', async () => {
		const { organisation } = await scenario();
		const orphan = await createViewerWithoutPerson(organisation.id, 'employee');

		// Not "every unassigned task", which `person_id is null` would have matched.
		expect(await listTasks(orphan)).toEqual([]);
		expect(await listProjects(orphan)).toEqual([]);
		expect(await listProjects(orphan, { archived: true })).toEqual([]);
	});

	it('never reaches into another organisation, whatever the permission', async () => {
		const { admin } = await scenario();
		const other = await createWorkspace2();

		expect(await listTasks(other)).toEqual([]);
		expect(await listProjects(other)).toEqual([]);
		expect(await listTasks(admin)).toHaveLength(6);
	});
});

async function createWorkspace2() {
	const organisation = await createOrganisation('Other', 'other');
	return createViewer(organisation.id, 'admin', 'Other Admin');
}
