import { asc, eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { getDb } from '../db';
import { activity } from '../activity/schema';
import { createOrganisation, createPerson, createViewer } from '../assets/testing/fixtures';
import { ensureDefaultStates } from './defaults';
import {
	assign,
	createProject,
	createState,
	createTask,
	deleteState,
	getTask,
	listTasks,
	moveTask,
	setAssignees,
	unassign,
	updateTask
} from './index';
import { MIN_GAP } from './position';
import {
	createProjectRow,
	createTaskRow,
	createWorkspace,
	statesByGroup
} from './testing/fixtures';

type Workspace = Awaited<ReturnType<typeof createWorkspace>>;

async function historyOf(taskId: string) {
	const rows = await getDb()
		.select()
		.from(activity)
		.where(eq(activity.taskId, taskId))
		.orderBy(asc(activity.occurredAt), asc(activity.createdAt));
	return rows.map((row) => ({ verb: row.verb, payload: row.payload }));
}

async function newProject(actor: Workspace['admin']) {
	const created = await createProject(actor, { name: 'Office move' });
	if (!created.ok) throw new Error('setup');
	return created.value;
}

async function newTask(
	actor: Workspace['admin'],
	projectId: string,
	title: string,
	stateId?: string
) {
	const created = await createTask(actor, projectId, { title, stateId });
	if (!created.ok) throw new Error(`setup: ${created.error}`);
	return created.value;
}

/** A column's task titles, top to bottom, as the board would draw them. */
async function column(actor: Workspace['admin'], projectId: string, stateId: string) {
	return (await listTasks(actor, { projectId }))
		.filter((task) => task.stateId === stateId)
		.map((task) => task.title);
}

describe('createTask', () => {
	it('lands in the default state, at the end, and writes task.created', async () => {
		const { admin, organisation } = await createWorkspace();
		const { backlog } = await statesByGroup(organisation.id);
		const project = await newProject(admin);

		const first = await newTask(admin, project.id, 'First');
		await newTask(admin, project.id, 'Second');

		const found = await getTask(admin, first.taskTag);
		expect(found.ok && found.value).toMatchObject({
			title: 'First',
			stateId: backlog.id,
			stateGroup: 'backlog',
			projectTag: project.projectTag
		});
		expect(await column(admin, project.id, backlog.id)).toEqual(['First', 'Second']);
		expect(await historyOf(first.id)).toEqual([
			{ verb: 'task.created', payload: { taskTag: first.taskTag, title: 'First' } }
		]);
	});

	it('goes where it is told, when told', async () => {
		const { admin, organisation } = await createWorkspace();
		const { started } = await statesByGroup(organisation.id);
		const project = await newProject(admin);

		const task = await newTask(admin, project.id, 'Already going', started.id);

		const found = await getTask(admin, task.taskTag);
		expect(found.ok && found.value.stateId).toBe(started.id);
	});

	it('follows the catalogue: when backlog is gone it lands in unstarted', async () => {
		const { admin, organisation } = await createWorkspace();
		const { backlog, unstarted } = await statesByGroup(organisation.id);
		await deleteState(admin, backlog.id);
		const project = await newProject(admin);

		const task = await newTask(admin, project.id, 'Somewhere');

		const found = await getTask(admin, task.taskTag);
		expect(found.ok && found.value.stateId).toBe(unstarted.id);
	});

	it('fails with a typed error for an unknown project, a foreign state, or a duplicate tag', async () => {
		const { admin } = await createWorkspace();
		const project = await newProject(admin);
		const { organisation: elsewhere } = await createWorkspace2();
		const foreign = (await statesByGroup(elsewhere.id)).started;
		await createTask(admin, project.id, { title: 'A', taskTag: 'TSK-9000' });

		expect(await createTask(admin, crypto.randomUUID(), { title: 'x' })).toEqual({
			ok: false,
			error: 'project_not_found'
		});
		expect(await createTask(admin, project.id, { title: 'x', stateId: foreign.id })).toEqual({
			ok: false,
			error: 'state_not_found'
		});
		expect(await createTask(admin, project.id, { title: 'B', taskTag: 'TSK-9000' })).toEqual({
			ok: false,
			error: 'duplicate_task_tag'
		});
	});

	it('refuses the reserved tag `new`', async () => {
		const { admin } = await createWorkspace();
		const project = await newProject(admin);

		await expect(createTask(admin, project.id, { title: 'x', taskTag: 'new' })).rejects.toThrow();
	});
});

async function createWorkspace2() {
	const organisation = await createOrganisation('Other', 'other');
	await ensureDefaultStates(getDb(), organisation.id);
	return { organisation, admin: await createViewer(organisation.id, 'admin', 'Other Admin') };
}

describe('updateTask', () => {
	it('edits title, description, due date and tag; only a due date is an event', async () => {
		const { admin } = await createWorkspace();
		const project = await newProject(admin);
		const task = await newTask(admin, project.id, 'Pack');

		await updateTask(admin, task.id, { title: 'Pack boxes', description: 'All of them' });
		await updateTask(admin, task.id, { dueDate: '2026-12-01' });
		await updateTask(admin, task.id, { dueDate: '2026-12-01' });
		await updateTask(admin, task.id, { dueDate: null, taskTag: 'BOXES' });

		const found = await getTask(admin, 'BOXES');
		expect(found.ok && found.value).toMatchObject({
			title: 'Pack boxes',
			description: 'All of them',
			dueDate: null
		});
		expect((await historyOf(task.id)).slice(1)).toEqual([
			{ verb: 'task.due.changed', payload: { from: null, to: '2026-12-01' } },
			{ verb: 'task.due.changed', payload: { from: '2026-12-01', to: null } }
		]);
	});

	it('cannot move a task or carry it to another project, however it is asked', async () => {
		const { admin, organisation } = await createWorkspace();
		const { started } = await statesByGroup(organisation.id);
		const project = await newProject(admin);
		const elsewhere = await newProject(admin);
		const task = await newTask(admin, project.id, 'Pack');

		await updateTask(admin, task.id, {
			title: 'Pack',
			stateId: started.id,
			projectId: elsewhere.id,
			position: '5'
		} as never);

		const found = await getTask(admin, task.taskTag);
		expect(found.ok && found.value).toMatchObject({
			projectId: project.id,
			stateGroup: 'backlog',
			position: 1000
		});
	});

	it('fails for a task that is not there, and for a duplicate tag', async () => {
		const { admin } = await createWorkspace();
		const project = await newProject(admin);
		const one = await newTask(admin, project.id, 'One');
		const two = await newTask(admin, project.id, 'Two');

		expect(await updateTask(admin, crypto.randomUUID(), { title: 'x' })).toEqual({
			ok: false,
			error: 'task_not_found'
		});
		expect(await updateTask(admin, two.id, { taskTag: one.taskTag })).toEqual({
			ok: false,
			error: 'duplicate_task_tag'
		});
	});
});

describe('assignees', () => {
	it('assigns and unassigns, writing one entry with the name as it was', async () => {
		const { admin, organisation } = await createWorkspace();
		const ada = await createPerson(organisation.id, 'Ada Lovelace');
		const project = await newProject(admin);
		const task = await newTask(admin, project.id, 'Pack');

		await assign(admin, task.id, ada.id);
		await assign(admin, task.id, ada.id);
		await unassign(admin, task.id, ada.id);
		await unassign(admin, task.id, ada.id);

		expect((await historyOf(task.id)).slice(1)).toEqual([
			{ verb: 'task.assigned', payload: { toPersonId: ada.id, toPersonName: 'Ada Lovelace' } },
			{ verb: 'task.unassigned', payload: { fromPersonId: ada.id, fromPersonName: 'Ada Lovelace' } }
		]);
	});

	it('refuses a person from outside the organisation', async () => {
		const { admin } = await createWorkspace();
		const { organisation: other } = await createWorkspace2();
		const stranger = await createPerson(other.id, 'Alan Turing');
		const project = await newProject(admin);
		const task = await newTask(admin, project.id, 'Pack');

		expect(await assign(admin, task.id, stranger.id)).toEqual({
			ok: false,
			error: 'person_not_found'
		});
		expect(await setAssignees(admin, task.id, [stranger.id])).toEqual({
			ok: false,
			error: 'person_not_found'
		});
	});

	it('sets exactly the wanted people: entries only for who joined or left', async () => {
		const { admin, organisation } = await createWorkspace();
		const [ada, grace, alan] = await Promise.all([
			createPerson(organisation.id, 'Ada Lovelace'),
			createPerson(organisation.id, 'Grace Hopper'),
			createPerson(organisation.id, 'Alan Turing')
		]);
		const project = await newProject(admin);
		const task = await newTask(admin, project.id, 'Pack');
		await setAssignees(admin, task.id, [ada.id, grace.id]);

		await setAssignees(admin, task.id, [grace.id, alan.id, alan.id]);

		const found = await getTask(admin, task.taskTag);
		expect(found.ok && found.value.assignees.map((a) => a.fullName)).toEqual([
			'Alan Turing',
			'Grace Hopper'
		]);
		const verbs = (await historyOf(task.id))
			.slice(1)
			.map((e) => `${e.verb}:${JSON.stringify(e.payload)}`);
		expect(verbs).toHaveLength(2 + 2);
		expect(verbs.slice(2).sort()).toEqual(
			[
				`task.assigned:${JSON.stringify({ toPersonId: alan.id, toPersonName: 'Alan Turing' })}`,
				`task.unassigned:${JSON.stringify({ fromPersonId: ada.id, fromPersonName: 'Ada Lovelace' })}`
			].sort()
		);
	});

	it('does not touch the assignees when the whole change is refused', async () => {
		const { admin, organisation } = await createWorkspace();
		const ada = await createPerson(organisation.id, 'Ada Lovelace');
		const project = await newProject(admin);
		const task = await newTask(admin, project.id, 'Pack');
		await setAssignees(admin, task.id, [ada.id]);

		await setAssignees(admin, task.id, [crypto.randomUUID()]);

		const found = await getTask(admin, task.taskTag);
		expect(found.ok && found.value.assignees).toHaveLength(1);
	});
});

describe('listTasks', () => {
	it('returns a task with three assignees for each of the three', async () => {
		const { admin, organisation } = await createWorkspace();
		const people = await Promise.all(
			['Ada Lovelace', 'Grace Hopper', 'Alan Turing'].map((n) => createPerson(organisation.id, n))
		);
		const project = await newProject(admin);
		const shared = await newTask(admin, project.id, 'Shared');
		await newTask(admin, project.id, 'Nobody’s');
		await setAssignees(
			admin,
			shared.id,
			people.map((p) => p.id)
		);

		for (const person of people) {
			const mine = await listTasks(admin, { assignee: person.id });
			expect(mine.map((task) => task.title)).toEqual(['Shared']);
			expect(mine[0].assignees).toHaveLength(3);
		}
	});

	it('filters by project, by group and by text', async () => {
		const { admin, organisation } = await createWorkspace();
		const { started } = await statesByGroup(organisation.id);
		const one = await newProject(admin);
		const two = await newProject(admin);
		await newTask(admin, one.id, 'Mudanza de planta');
		await newTask(admin, one.id, 'Pedir cajas', started.id);
		await newTask(admin, two.id, 'Otra cosa');

		expect((await listTasks(admin, { projectId: one.id })).map((t) => t.title).sort()).toEqual([
			'Mudanza de planta',
			'Pedir cajas'
		]);
		expect((await listTasks(admin, { group: 'started' })).map((t) => t.title)).toEqual([
			'Pedir cajas'
		]);
		expect((await listTasks(admin, { q: 'mudanzas' })).map((t) => t.title)).toEqual([
			'Mudanza de planta'
		]);
		expect(await listTasks(admin, { q: 'impresora' })).toEqual([]);
	});

	it('is in board order: group, then the state’s position, then the task’s', async () => {
		const { admin, organisation } = await createWorkspace();
		const { backlog, started, completed } = await statesByGroup(organisation.id);
		const extra = await createState(admin, { name: 'Extra started', group: 'started' });
		if (!extra.ok) throw new Error('setup');
		const project = await newProject(admin);
		await newTask(admin, project.id, 'done', completed.id);
		await newTask(admin, project.id, 'extra', extra.value.id);
		await newTask(admin, project.id, 'going', started.id);
		await newTask(admin, project.id, 'waiting', backlog.id);

		expect((await listTasks(admin, { projectId: project.id })).map((t) => t.title)).toEqual([
			'waiting',
			'going',
			'extra',
			'done'
		]);
	});

	it('reports whether the project is archived, so a task can read as read-only', async () => {
		const { admin, organisation } = await createWorkspace();
		const { backlog } = await statesByGroup(organisation.id);
		const archived = await createProjectRow(organisation.id, { archivedAt: new Date() });
		await createTaskRow(organisation.id, archived.id, backlog.id);

		const [task] = await listTasks(admin);

		expect(task.projectArchived).toBe(true);
	});
});

describe('getTask', () => {
	it('fails with a typed error for an unknown tag', async () => {
		const { admin } = await createWorkspace();

		expect(await getTask(admin, 'TSK-0000')).toEqual({ ok: false, error: 'task_not_found' });
	});
});

describe('moveTask', () => {
	async function board() {
		const workspace = await createWorkspace();
		const { admin, organisation } = workspace;
		const states = await statesByGroup(organisation.id);
		const project = await newProject(admin);
		return { ...workspace, states, project };
	}

	it('puts a task at the end of the target column when no neighbours are named', async () => {
		const { admin, states, project } = await board();
		await newTask(admin, project.id, 'A', states.started.id);
		await newTask(admin, project.id, 'B', states.started.id);
		const mover = await newTask(admin, project.id, 'C', states.backlog.id);

		await moveTask(admin, mover.id, states.started.id);

		expect(await column(admin, project.id, states.started.id)).toEqual(['A', 'B', 'C']);
	});

	it('lands in an empty column', async () => {
		const { admin, states, project } = await board();
		const mover = await newTask(admin, project.id, 'A');

		await moveTask(admin, mover.id, states.completed.id);

		expect(await column(admin, project.id, states.completed.id)).toEqual(['A']);
	});

	it('lands between the two neighbours it is dropped between', async () => {
		const { admin, states, project } = await board();
		const a = await newTask(admin, project.id, 'A', states.started.id);
		const b = await newTask(admin, project.id, 'B', states.started.id);
		const mover = await newTask(admin, project.id, 'C', states.backlog.id);

		await moveTask(admin, mover.id, states.started.id, { after: a.id, before: b.id });

		expect(await column(admin, project.id, states.started.id)).toEqual(['A', 'C', 'B']);
	});

	it('lands at the top with only `before`, and right after a task with only `after`', async () => {
		const { admin, states, project } = await board();
		const a = await newTask(admin, project.id, 'A', states.started.id);
		await newTask(admin, project.id, 'B', states.started.id);
		const top = await newTask(admin, project.id, 'Top', states.backlog.id);
		const second = await newTask(admin, project.id, 'Second', states.backlog.id);

		await moveTask(admin, top.id, states.started.id, { before: a.id });
		await moveTask(admin, second.id, states.started.id, { after: a.id });

		expect(await column(admin, project.id, states.started.id)).toEqual(['Top', 'A', 'Second', 'B']);
	});

	it('reorders inside one column without writing any activity', async () => {
		const { admin, states, project } = await board();
		const a = await newTask(admin, project.id, 'A', states.started.id);
		const b = await newTask(admin, project.id, 'B', states.started.id);
		await newTask(admin, project.id, 'C', states.started.id);

		await moveTask(admin, a.id, states.started.id, { after: b.id });

		expect(await column(admin, project.id, states.started.id)).toEqual(['B', 'A', 'C']);
		expect((await historyOf(a.id)).map((entry) => entry.verb)).toEqual(['task.created']);
	});

	it('across states writes exactly one task.state.changed, with the names as they read', async () => {
		const { admin, states, project } = await board();
		const task = await newTask(admin, project.id, 'A', states.backlog.id);

		await moveTask(admin, task.id, states.started.id);

		expect((await historyOf(task.id)).slice(1)).toEqual([
			{
				verb: 'task.state.changed',
				payload: {
					fromStateId: states.backlog.id,
					fromStateName: states.backlog.name,
					toStateId: states.started.id,
					toStateName: states.started.name
				}
			}
		]);
	});

	it('renumbers the column when the gap between neighbours has closed', async () => {
		const { admin, organisation, states, project } = await board();
		const a = await createTaskRow(organisation.id, project.id, states.started.id, {
			title: 'A',
			position: '1'
		});
		const b = await createTaskRow(organisation.id, project.id, states.started.id, {
			title: 'B',
			position: String(1 + MIN_GAP / 10)
		});
		const mover = await newTask(admin, project.id, 'C', states.backlog.id);

		await moveTask(admin, mover.id, states.started.id, { after: a.id, before: b.id });

		expect(await column(admin, project.id, states.started.id)).toEqual(['A', 'C', 'B']);
		const positions = (await listTasks(admin, { projectId: project.id, group: 'started' })).map(
			(task) => task.position
		);
		expect(new Set(positions).size).toBe(3);
		expect(positions[1] - positions[0]).toBeGreaterThan(MIN_GAP);
		expect(positions[2] - positions[1]).toBeGreaterThan(MIN_GAP);
	});

	it('survives being dropped into the same gap again and again', async () => {
		const { admin, states, project } = await board();
		const a = await newTask(admin, project.id, 'A', states.started.id);
		const z = await newTask(admin, project.id, 'Z', states.started.id);
		const dropped: string[] = [];
		let below = z.id;

		// Straight after A each time, so the gap above the previous drop halves
		// until the column has to be renumbered, well within 45 drops.
		for (let i = 0; i < 45; i += 1) {
			const task = await newTask(admin, project.id, `m${i}`, states.backlog.id);
			await moveTask(admin, task.id, states.started.id, { after: a.id, before: below });
			dropped.push(`m${i}`);
			below = task.id;
		}

		expect(await column(admin, project.id, states.started.id)).toEqual([
			'A',
			...dropped.reverse(),
			'Z'
		]);
	});

	it('refuses neighbours that are not in the target column, or are out of order', async () => {
		const { admin, states, project } = await board();
		const a = await newTask(admin, project.id, 'A', states.started.id);
		const b = await newTask(admin, project.id, 'B', states.started.id);
		const elsewhere = await newTask(admin, project.id, 'E', states.backlog.id);
		const mover = await newTask(admin, project.id, 'M', states.backlog.id);
		const otherProject = await newProject(admin);
		const foreign = await newTask(admin, otherProject.id, 'F', states.started.id);

		const invalid = { ok: false, error: 'invalid_neighbours' };
		expect(await moveTask(admin, mover.id, states.started.id, { after: elsewhere.id })).toEqual(
			invalid
		);
		expect(await moveTask(admin, mover.id, states.started.id, { before: foreign.id })).toEqual(
			invalid
		);
		expect(await moveTask(admin, mover.id, states.started.id, { after: mover.id })).toEqual(
			invalid
		);
		expect(
			await moveTask(admin, mover.id, states.started.id, { after: b.id, before: a.id })
		).toEqual(invalid);
		expect(
			await moveTask(admin, mover.id, states.started.id, { after: a.id, before: a.id })
		).toEqual(invalid);
	});

	it('fails with a typed error for an unknown task or state', async () => {
		const { admin, states, project } = await board();
		const task = await newTask(admin, project.id, 'A');

		expect(await moveTask(admin, crypto.randomUUID(), states.started.id)).toEqual({
			ok: false,
			error: 'task_not_found'
		});
		expect(await moveTask(admin, task.id, crypto.randomUUID())).toEqual({
			ok: false,
			error: 'state_not_found'
		});
	});

	it('is the only thing that changes state or position: a rename of the state does not', async () => {
		const { admin, states, project } = await board();
		const task = await newTask(admin, project.id, 'A', states.started.id);
		const before = await getTask(admin, task.taskTag);

		await updateTask(admin, task.id, { title: 'B' });

		const after = await getTask(admin, task.taskTag);
		expect(before.ok && after.ok && after.value.position).toBe(before.ok && before.value.position);
		expect(after.ok && after.value.stateId).toBe(states.started.id);
	});
});
