import { and, asc, eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { activity } from '../activity/schema';
import { taskTimeline } from '../links';
import { createPerson } from '../assets/testing/fixtures';
import { getDb } from '../db';
import {
	addProjectMember,
	archiveProject,
	createProject,
	createTask,
	getTask,
	listMilestones,
	listTasks,
	moveTask,
	moveTaskToProject,
	projectProgress,
	setTaskMilestone,
	setTaskParent,
	subtasksOf
} from './index';
import { reparentTask } from './reparent';
import { taskAssignees, tasks } from './schema';
import {
	assignRow,
	createMilestoneRow,
	createProjectRow,
	createWorkspace,
	statesByGroup
} from './testing/fixtures';
import { lockProjects } from './writes';

/** Subtasks (ADR 0055): one level under a task, in the same project. */

async function setup() {
	const workspace = await createWorkspace();
	const project = await createProjectRow(workspace.organisation.id);
	const states = await statesByGroup(workspace.organisation.id);
	return { ...workspace, project, states };
}

type Scene = Awaited<ReturnType<typeof setup>>;

async function open(
	scene: Scene,
	title: string,
	extra: { parentTaskId?: string; stateId?: string; milestoneId?: string; projectId?: string } = {}
) {
	const { projectId = scene.project.id, ...values } = extra;
	const created = await createTask(scene.admin, projectId, { title, ...values });
	if (!created.ok) throw new Error(`setup: ${JSON.stringify(created.error)}`);
	return created.value;
}

async function rowOf(taskId: string) {
	const [row] = await getDb().select().from(tasks).where(eq(tasks.id, taskId));
	return row;
}

async function historyOf(taskId: string) {
	const rows = await getDb()
		.select()
		.from(activity)
		.where(eq(activity.taskId, taskId))
		.orderBy(asc(activity.occurredAt), asc(activity.createdAt));
	return rows.map((row) => ({ verb: row.verb, payload: row.payload }));
}

const ok = { ok: true, value: undefined };

describe('creating a subtask', () => {
	it('takes the next code, the parent’s project and milestone, and nothing else', async () => {
		const scene = await setup();
		const milestone = await createMilestoneRow(scene.organisation.id, scene.project.id);
		const parent = await open(scene, 'Migrate the mail server', {
			milestoneId: milestone.id,
			stateId: scene.states.started.id
		});
		await assignRow(scene.organisation.id, parent.id, scene.technician.personId!);

		const child = await open(scene, 'Export mailboxes', { parentTaskId: parent.id });

		expect(Number(child.taskTag.slice(4))).toBe(Number(parent.taskTag.slice(4)) + 1);
		const row = await rowOf(child.id);
		expect(row).toMatchObject({
			projectId: scene.project.id,
			parentTaskId: parent.id,
			milestoneId: milestone.id,
			dueDate: null,
			stateId: scene.states.backlog.id
		});
		expect(
			await getDb().select().from(taskAssignees).where(eq(taskAssignees.taskId, child.id))
		).toEqual([]);
		expect(await historyOf(child.id)).toEqual([
			{
				verb: 'task.created',
				payload: {
					taskTag: child.taskTag,
					title: 'Export mailboxes',
					parent: {
						taskId: parent.id,
						taskTag: parent.taskTag,
						title: 'Migrate the mail server'
					}
				}
			}
		]);
	});

	it('refuses a parent of another project, a subtask as parent, and an open task under a closed parent', async () => {
		const scene = await setup();
		const elsewhere = await createProjectRow(scene.organisation.id);
		const foreign = await open(scene, 'Foreign', { projectId: elsewhere.id });
		const parent = await open(scene, 'Parent');
		const child = await open(scene, 'Child', { parentTaskId: parent.id });
		const done = await open(scene, 'Done', { stateId: scene.states.completed.id });

		const attempt = (parentTaskId: string, stateId?: string) =>
			createTask(scene.admin, scene.project.id, { title: 'New', parentTaskId, stateId });

		expect(await attempt(foreign.id)).toEqual({ ok: false, error: 'parent_not_found' });
		expect(await attempt(child.id)).toEqual({ ok: false, error: 'parent_is_subtask' });
		expect(await attempt(done.id)).toEqual({ ok: false, error: 'parent_closed' });
		// A closed task under a closed parent breaks no rule.
		expect((await attempt(done.id, scene.states.cancelled.id)).ok).toBe(true);
	});
});

describe('setTaskParent', () => {
	it('nests, records the change on the child only, and leaves the milestone alone', async () => {
		const scene = await setup();
		const milestone = await createMilestoneRow(scene.organisation.id, scene.project.id);
		const parent = await open(scene, 'Parent', { milestoneId: milestone.id });
		const task = await open(scene, 'Task');

		expect(await setTaskParent(scene.admin, task.id, parent.id)).toEqual(ok);

		expect(await rowOf(task.id)).toMatchObject({ parentTaskId: parent.id, milestoneId: null });
		expect((await historyOf(task.id)).at(-1)).toEqual({
			verb: 'task.parent.changed',
			payload: { from: null, to: { taskId: parent.id, taskTag: parent.taskTag, title: 'Parent' } }
		});
		expect((await historyOf(parent.id)).map((entry) => entry.verb)).toEqual(['task.created']);
	});

	it('moves a subtask to another parent and promotes it, with snapshots', async () => {
		const scene = await setup();
		const first = await open(scene, 'First');
		const second = await open(scene, 'Second');
		const task = await open(scene, 'Task', { parentTaskId: first.id });

		expect(await setTaskParent(scene.admin, task.id, second.id)).toEqual(ok);
		expect(await setTaskParent(scene.admin, task.id, null)).toEqual(ok);

		expect((await historyOf(task.id)).slice(1)).toEqual([
			{
				verb: 'task.parent.changed',
				payload: {
					from: { taskId: first.id, taskTag: first.taskTag, title: 'First' },
					to: { taskId: second.id, taskTag: second.taskTag, title: 'Second' }
				}
			},
			{
				verb: 'task.parent.changed',
				payload: {
					from: { taskId: second.id, taskTag: second.taskTag, title: 'Second' },
					to: null
				}
			}
		]);
		expect((await rowOf(task.id)).parentTaskId).toBeNull();
	});

	it('records nothing when the parent does not change', async () => {
		const scene = await setup();
		const parent = await open(scene, 'Parent');
		const task = await open(scene, 'Task', { parentTaskId: parent.id });
		const loose = await open(scene, 'Loose');

		expect(await setTaskParent(scene.admin, task.id, parent.id)).toEqual(ok);
		expect(await setTaskParent(scene.admin, loose.id, null)).toEqual(ok);

		expect(await historyOf(task.id)).toHaveLength(1);
		expect(await historyOf(loose.id)).toHaveLength(1);
	});

	it('returns each refusal', async () => {
		const scene = await setup();
		const elsewhere = await createProjectRow(scene.organisation.id);
		const foreign = await open(scene, 'Foreign', { projectId: elsewhere.id });
		const parent = await open(scene, 'Parent');
		const child = await open(scene, 'Child', { parentTaskId: parent.id });
		const task = await open(scene, 'Task');
		const closed = await open(scene, 'Closed', { stateId: scene.states.completed.id });

		const refused = (error: string) => ({ ok: false, error });

		expect(await setTaskParent(scene.admin, crypto.randomUUID(), parent.id)).toEqual(
			refused('task_not_found')
		);
		expect(await setTaskParent(scene.admin, task.id, crypto.randomUUID())).toEqual(
			refused('parent_not_found')
		);
		expect(await setTaskParent(scene.admin, task.id, foreign.id)).toEqual(
			refused('parent_not_found')
		);
		expect(await setTaskParent(scene.admin, task.id, task.id)).toEqual(refused('same_task'));
		expect(await setTaskParent(scene.admin, task.id, child.id)).toEqual(
			refused('parent_is_subtask')
		);
		expect(await setTaskParent(scene.admin, parent.id, task.id)).toEqual(
			refused('task_has_subtasks')
		);
		expect(await setTaskParent(scene.admin, task.id, closed.id)).toEqual(refused('parent_closed'));

		await archiveProject(scene.admin, scene.project.id);
		expect(await setTaskParent(scene.admin, task.id, parent.id)).toEqual(
			refused('project_archived')
		);
	});

	it('refuses a parent outside the actor’s scope as not found', async () => {
		const scene = await setup();
		const hidden = await createProject(scene.admin, { name: 'Hidden', visibility: 'members' });
		if (!hidden.ok) throw new Error('setup');
		const parent = await open(scene, 'Parent', { projectId: hidden.value.id });
		const task = await open(scene, 'Task', { projectId: hidden.value.id });

		expect(await setTaskParent(scene.technician, task.id, parent.id)).toEqual({
			ok: false,
			error: 'task_not_found'
		});
	});

	it('never builds a second level under concurrent writes', async () => {
		const scene = await setup();
		for (let round = 0; round < 5; round++) {
			const a = await open(scene, 'A');
			const b = await open(scene, 'B');
			const c = await open(scene, 'C');

			const outcomes = await Promise.all([
				setTaskParent(scene.admin, a.id, b.id),
				setTaskParent(scene.admin, b.id, c.id)
			]);

			expect(outcomes.filter((outcome) => outcome.ok)).toHaveLength(1);
			const rows = await getDb()
				.select({ id: tasks.id, parentTaskId: tasks.parentTaskId })
				.from(tasks)
				.where(eq(tasks.projectId, scene.project.id));
			const parentOf = new Map(rows.map((row) => [row.id, row.parentTaskId]));
			for (const row of rows) {
				if (row.parentTaskId !== null) expect(parentOf.get(row.parentTaskId)).toBeNull();
			}
		}
	});
});

describe('moveTask and a family', () => {
	it('refuses closing a parent over an open child, backlog included, for both closed groups', async () => {
		const scene = await setup();
		const parent = await open(scene, 'Parent', { stateId: scene.states.started.id });
		const child = await open(scene, 'Child', { parentTaskId: parent.id });

		for (const closed of [scene.states.completed, scene.states.cancelled]) {
			expect(await moveTask(scene.admin, parent.id, closed.id)).toEqual({
				ok: false,
				error: {
					kind: 'open_subtasks',
					subtasks: [{ taskTag: child.taskTag, title: 'Child' }]
				}
			});
		}
		expect((await rowOf(parent.id)).stateId).toBe(scene.states.started.id);

		// Reordering, or another open state, is not concerned.
		expect(await moveTask(scene.admin, parent.id, scene.states.started.id)).toEqual(ok);
		expect(await moveTask(scene.admin, parent.id, scene.states.unstarted.id)).toEqual(ok);
	});

	it('closes the parent once every child is closed, and keeps a reopened child out', async () => {
		const scene = await setup();
		const parent = await open(scene, 'Parent');
		const first = await open(scene, 'First', { parentTaskId: parent.id });
		const second = await open(scene, 'Second', { parentTaskId: parent.id });

		expect(await moveTask(scene.admin, first.id, scene.states.completed.id)).toEqual(ok);
		expect(await moveTask(scene.admin, second.id, scene.states.cancelled.id)).toEqual(ok);
		expect(await moveTask(scene.admin, parent.id, scene.states.completed.id)).toEqual(ok);

		expect(await moveTask(scene.admin, first.id, scene.states.started.id)).toEqual({
			ok: false,
			error: 'parent_closed'
		});
		expect(await moveTask(scene.admin, first.id, scene.states.backlog.id)).toEqual({
			ok: false,
			error: 'parent_closed'
		});
		// From one closed state to another is not a reopening.
		expect(await moveTask(scene.admin, first.id, scene.states.cancelled.id)).toEqual(ok);
		// Nor is moving the closed parent between closed states.
		expect(await moveTask(scene.admin, parent.id, scene.states.cancelled.id)).toEqual(ok);

		// Reopen the parent first, then the child.
		expect(await moveTask(scene.admin, parent.id, scene.states.started.id)).toEqual(ok);
		expect(await moveTask(scene.admin, first.id, scene.states.started.id)).toEqual(ok);
	});

	it('refuses creating or nesting an open task under a closed parent', async () => {
		const scene = await setup();
		const parent = await open(scene, 'Parent', { stateId: scene.states.completed.id });
		const task = await open(scene, 'Task');

		expect(
			await createTask(scene.admin, scene.project.id, { title: 'X', parentTaskId: parent.id })
		).toEqual({ ok: false, error: 'parent_closed' });
		expect(await setTaskParent(scene.admin, task.id, parent.id)).toEqual({
			ok: false,
			error: 'parent_closed'
		});
	});
});

describe('moveTaskToProject and a family', () => {
	it('detaches a subtask first, then moves it alone', async () => {
		const scene = await setup();
		const target = await createProjectRow(scene.organisation.id, { name: 'Target' });
		const parent = await open(scene, 'Parent');
		const child = await open(scene, 'Child', { parentTaskId: parent.id });

		expect(await moveTaskToProject(scene.admin, child.id, target.id)).toEqual(ok);

		expect(await rowOf(child.id)).toMatchObject({ projectId: target.id, parentTaskId: null });
		expect((await rowOf(parent.id)).projectId).toBe(scene.project.id);
		expect((await historyOf(child.id)).slice(1).map((entry) => entry.verb)).toEqual([
			'task.parent.changed',
			'task.project.changed'
		]);
		expect((await historyOf(child.id))[1].payload).toEqual({
			from: { taskId: parent.id, taskTag: parent.taskTag, title: 'Parent' },
			to: null
		});
	});

	it('moves a parent with every child, clearing milestones, with history on each', async () => {
		const scene = await setup();
		const target = await createProjectRow(scene.organisation.id, { name: 'Target' });
		const milestone = await createMilestoneRow(scene.organisation.id, scene.project.id);
		const parent = await open(scene, 'Parent', { milestoneId: milestone.id });
		const first = await open(scene, 'First', { parentTaskId: parent.id });
		const second = await open(scene, 'Second', {
			parentTaskId: parent.id,
			stateId: scene.states.started.id
		});
		expect(await setTaskMilestone(scene.admin, second.id, null)).toEqual(ok);

		expect(await moveTaskToProject(scene.admin, parent.id, target.id)).toEqual(ok);

		for (const id of [parent.id, first.id, second.id]) {
			expect(await rowOf(id)).toMatchObject({ projectId: target.id, milestoneId: null });
		}
		expect((await rowOf(first.id)).parentTaskId).toBe(parent.id);
		expect((await rowOf(second.id)).parentTaskId).toBe(parent.id);
		for (const id of [parent.id, first.id]) {
			expect((await historyOf(id)).slice(-2).map((entry) => entry.verb)).toEqual([
				'task.project.changed',
				'task.milestone.changed'
			]);
		}
		expect((await historyOf(second.id)).at(-1)?.verb).toBe('task.project.changed');
		expect(
			(await listTasks(scene.admin, { projectId: target.id })).map((task) => task.title)
		).toEqual(['Parent', 'First', 'Second']);
	});

	it('refuses the whole family when an assignee of any child is not a member', async () => {
		const scene = await setup();
		const target = await createProject(scene.admin, { name: 'Private', visibility: 'members' });
		if (!target.ok) throw new Error('setup');
		const outsider = await createPerson(scene.organisation.id, 'Olga Outsider');
		const parent = await open(scene, 'Parent');
		const child = await open(scene, 'Child', { parentTaskId: parent.id });
		await assignRow(scene.organisation.id, child.id, outsider.id);

		expect(await moveTaskToProject(scene.admin, parent.id, target.value.id)).toEqual({
			ok: false,
			error: {
				kind: 'assignees_not_members',
				people: [{ personId: outsider.id, fullName: 'Olga Outsider' }]
			}
		});
		expect((await rowOf(parent.id)).projectId).toBe(scene.project.id);
		expect((await rowOf(child.id)).projectId).toBe(scene.project.id);

		expect(await addProjectMember(scene.admin, target.value.id, outsider.id)).toMatchObject({
			ok: true
		});
		expect(await moveTaskToProject(scene.admin, parent.id, target.value.id)).toEqual(ok);
	});

	it('keeps families intact when a merge reparents every top-level task', async () => {
		const scene = await setup();
		const target = await createProjectRow(scene.organisation.id, { name: 'Target' });
		const parent = await open(scene, 'Parent');
		await open(scene, 'Child', { parentTaskId: parent.id });
		await open(scene, 'Loose');

		await getDb().transaction(async (tx) => {
			const locked = await lockProjects(tx, scene.admin, [scene.project.id, target.id]);
			const into = locked.find((project) => project.id === target.id)!;
			const topLevel = await tx
				.select()
				.from(tasks)
				.where(
					and(
						eq(tasks.projectId, scene.project.id),
						eq(tasks.organisationId, scene.organisation.id)
					)
				)
				.orderBy(asc(tasks.position));
			for (const task of topLevel.filter((row) => row.parentTaskId === null)) {
				await reparentTask(tx, scene.admin, task, into);
			}
		});

		const moved = await listTasks(scene.admin, { projectId: target.id });
		expect(moved.map((task) => [task.title, task.parent?.title ?? null])).toEqual([
			['Parent', null],
			['Child', 'Parent'],
			['Loose', null]
		]);
		expect(await listTasks(scene.admin, { projectId: scene.project.id })).toEqual([]);
	});

	it('refuses to move a subtask on its own inside a merge', async () => {
		const scene = await setup();
		const target = await createProjectRow(scene.organisation.id);
		const parent = await open(scene, 'Parent');
		const child = await open(scene, 'Child', { parentTaskId: parent.id });

		await expect(
			getDb().transaction(async (tx) => {
				const locked = await lockProjects(tx, scene.admin, [scene.project.id, target.id]);
				await reparentTask(
					tx,
					scene.admin,
					await rowOf(child.id),
					locked.find((project) => project.id === target.id)!
				);
			})
		).rejects.toThrow(/subtask/);
	});
});

describe('reading a family', () => {
	it('gives the parent and the counts, excluding cancelled children from them', async () => {
		const scene = await setup();
		const parent = await open(scene, 'Parent');
		const child = await open(scene, 'Done', {
			parentTaskId: parent.id,
			stateId: scene.states.completed.id
		});
		await open(scene, 'Open', { parentTaskId: parent.id });
		await open(scene, 'Dropped', { parentTaskId: parent.id, stateId: scene.states.cancelled.id });

		const read = await getTask(scene.technician, parent.taskTag);
		expect(read.ok && read.value.subtasks).toEqual({ total: 2, completed: 1, restricted: 0 });
		expect(read.ok && read.value.parent).toBeNull();

		const sub = await getTask(scene.technician, child.taskTag);
		expect(sub.ok && sub.value.parent).toEqual({ taskTag: parent.taskTag, title: 'Parent' });
		expect(sub.ok && sub.value.subtasks).toEqual({ total: 0, completed: 0, restricted: 0 });

		expect((await subtasksOf(scene.technician, parent.id)).map((task) => task.title)).toEqual([
			'Open',
			'Done',
			'Dropped'
		]);
		expect((await listTasks(scene.technician, { parentTaskId: parent.id })).length).toBe(3);
	});

	it('shows an employee only what they are assigned to', async () => {
		const scene = await setup();
		const parent = await open(scene, 'Parent');
		const mine = await open(scene, 'Mine', { parentTaskId: parent.id });
		const theirs = await open(scene, 'Theirs', { parentTaskId: parent.id });
		const employee = scene.employee;

		// Assigned only to a child: no parent, and the parent itself is not found.
		await assignRow(scene.organisation.id, mine.id, employee.personId!);
		const child = await getTask(employee, mine.taskTag);
		expect(child.ok && child.value.parent).toBeNull();
		expect(await getTask(employee, parent.taskTag)).toEqual({
			ok: false,
			error: 'task_not_found'
		});

		// Assigned to the parent too: the visible child, and the other as a count.
		await assignRow(scene.organisation.id, parent.id, employee.personId!);
		const read = await getTask(employee, parent.taskTag);
		expect(read.ok && read.value.subtasks).toEqual({ total: 1, completed: 0, restricted: 1 });
		expect((await subtasksOf(employee, parent.id)).map((task) => task.title)).toEqual(['Mine']);
		expect(await getTask(employee, theirs.taskTag)).toEqual({
			ok: false,
			error: 'task_not_found'
		});
	});

	it('counts parents and children alike in project and milestone progress', async () => {
		const scene = await setup();
		const milestone = await createMilestoneRow(scene.organisation.id, scene.project.id);
		const parent = await open(scene, 'Parent', { milestoneId: milestone.id });
		const child = await open(scene, 'Child', { parentTaskId: parent.id });
		await moveTask(scene.admin, child.id, scene.states.completed.id);

		const progress = await projectProgress(scene.technician, scene.project.id);
		expect(progress.ok && progress.value.counts).toMatchObject({ backlog: 1, completed: 1 });
		expect(progress.ok && progress.value.total).toBe(2);

		const listed = await listMilestones(scene.technician, scene.project.id);
		expect(listed.ok && listed.value[0].progress).toMatchObject({
			counts: { backlog: 1, completed: 1 },
			total: 2,
			ratio: 0.5
		});
	});
});

describe('a subtask’s history, read by someone who cannot see its parent', () => {
	it('names the parent as restricted, and in full once the parent is visible', async () => {
		const scene = await setup();
		const parent = await open(scene, 'Confidential parent');
		const child = await open(scene, 'Child', { parentTaskId: parent.id });
		const loose = await open(scene, 'Loose');
		expect(await setTaskParent(scene.admin, loose.id, parent.id)).toEqual(ok);
		await assignRow(scene.organisation.id, child.id, scene.employee.personId!);
		await assignRow(scene.organisation.id, loose.id, scene.employee.personId!);

		const payloads = async (taskId: string) =>
			(await taskTimeline(scene.employee, taskId)).flatMap((item) =>
				item.kind === 'activity' ? [item.entry.payload] : []
			);
		const restricted = { taskId: '', taskTag: '', title: '' };

		expect(await payloads(child.id)).toContainEqual(
			expect.objectContaining({ parent: restricted })
		);
		expect(await payloads(loose.id)).toContainEqual({ from: null, to: restricted });
		expect(JSON.stringify(await payloads(child.id))).not.toContain('Confidential');

		await assignRow(scene.organisation.id, parent.id, scene.employee.personId!);
		expect(await payloads(loose.id)).toContainEqual({
			from: null,
			to: { taskId: parent.id, taskTag: parent.taskTag, title: 'Confidential parent' }
		});
	});
});
