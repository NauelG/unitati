import { and, asc, eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { activity } from '../activity/schema';
import { createOrganisation, createPerson } from '../assets/testing/fixtures';
import { getDb } from '../db';
import {
	archiveProject,
	assign,
	createProject,
	createTask,
	getTask,
	moveTask,
	moveTaskToProject,
	updateProject,
	updateTask
} from './index';
import { reparentTask } from './reparent';
import { lockProjects, lockTask } from './writes';
import { projects, tasks } from './schema';
import { createProjectRow, createWorkspace, statesByGroup } from './testing/fixtures';

type Workspace = Awaited<ReturnType<typeof createWorkspace>>;

async function newProject(actor: Workspace['admin'], name: string) {
	const created = await createProject(actor, { name });
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

async function historyOf(taskId: string) {
	const rows = await getDb()
		.select()
		.from(activity)
		.where(eq(activity.taskId, taskId))
		.orderBy(asc(activity.occurredAt), asc(activity.createdAt));
	return rows.map((row) => ({ verb: row.verb, payload: row.payload }));
}

async function titlesIn(projectTag: string) {
	const rows = await getDb()
		.select({ title: tasks.title })
		.from(tasks)
		.innerJoin(projects, eq(tasks.projectId, projects.id))
		.where(eq(projects.projectTag, projectTag))
		.orderBy(asc(tasks.position));
	return rows.map((row) => row.title);
}

describe('moveTaskToProject', () => {
	it('keeps the task as it was, puts it at the end of its column and writes one entry', async () => {
		const { admin, organisation } = await createWorkspace();
		const { started } = await statesByGroup(organisation.id);
		const ada = await createPerson(organisation.id, 'Ada Lovelace');
		const from = await newProject(admin, 'Office move');
		const to = await newProject(admin, 'Warehouse');
		await newTask(admin, to.id, 'Already there', started.id);
		const task = await newTask(admin, from.id, 'Pack', started.id);
		await updateTask(admin, task.id, { dueDate: '2026-12-01' });
		await assign(admin, task.id, ada.id);
		const before = await historyOf(task.id);

		expect(await moveTaskToProject(admin, task.id, to.id)).toEqual({ ok: true, value: undefined });

		const found = await getTask(admin, task.taskTag);
		expect(found.ok && found.value).toMatchObject({
			id: task.id,
			taskTag: task.taskTag,
			title: 'Pack',
			projectId: to.id,
			projectTag: to.projectTag,
			stateId: started.id,
			dueDate: '2026-12-01',
			assignees: [{ personId: ada.id, fullName: 'Ada Lovelace' }]
		});
		expect(await titlesIn(to.projectTag)).toEqual(['Already there', 'Pack']);
		expect(await titlesIn(from.projectTag)).toEqual([]);

		const after = await historyOf(task.id);
		expect(after.slice(0, before.length)).toEqual(before);
		expect(after.slice(before.length)).toEqual([
			{
				verb: 'task.project.changed',
				payload: {
					fromProjectId: from.id,
					fromProjectTag: from.projectTag,
					fromProjectName: 'Office move',
					toProjectId: to.id,
					toProjectTag: to.projectTag,
					toProjectName: 'Warehouse'
				}
			}
		]);
	});

	it('leaves the entry as it read at the time when a project is renamed afterwards', async () => {
		const { admin } = await createWorkspace();
		const from = await newProject(admin, 'Office move');
		const to = await newProject(admin, 'Warehouse');
		const task = await newTask(admin, from.id, 'Pack');
		await moveTaskToProject(admin, task.id, to.id);

		await updateProject(admin, from.id, { name: 'Renamed' });

		const entry = (await historyOf(task.id)).at(-1);
		expect(entry?.payload).toMatchObject({ fromProjectName: 'Office move' });
	});

	it('can move back', async () => {
		const { admin } = await createWorkspace();
		const from = await newProject(admin, 'Office move');
		const to = await newProject(admin, 'Warehouse');
		const task = await newTask(admin, from.id, 'Pack');

		await moveTaskToProject(admin, task.id, to.id);
		expect(await moveTaskToProject(admin, task.id, from.id)).toEqual({
			ok: true,
			value: undefined
		});

		const found = await getTask(admin, task.taskTag);
		expect(found.ok && found.value.projectId).toBe(from.id);
	});

	it.each([
		['the target is archived', 'to'],
		['the source is archived', 'from']
	] as const)('fails with project_archived when %s, writing nothing', async (_label, which) => {
		const { admin } = await createWorkspace();
		const from = await newProject(admin, 'Office move');
		const to = await newProject(admin, 'Warehouse');
		const task = await newTask(admin, from.id, 'Pack');
		const before = await historyOf(task.id);
		await archiveProject(admin, (which === 'to' ? to : from).id);

		expect(await moveTaskToProject(admin, task.id, to.id)).toEqual({
			ok: false,
			error: 'project_archived'
		});

		const found = await getTask(admin, task.taskTag);
		expect(found.ok && found.value.projectId).toBe(from.id);
		expect(await historyOf(task.id)).toEqual(before);
	});

	it('fails with same_project when the target is where the task already is', async () => {
		const { admin } = await createWorkspace();
		const from = await newProject(admin, 'Office move');
		const task = await newTask(admin, from.id, 'Pack');
		const before = await historyOf(task.id);

		expect(await moveTaskToProject(admin, task.id, from.id)).toEqual({
			ok: false,
			error: 'same_project'
		});
		expect(await historyOf(task.id)).toEqual(before);
	});

	it('fails with project_not_found for an unknown or foreign target', async () => {
		const { admin } = await createWorkspace();
		const foreign = await createProjectRow((await createOrganisation('Other', 'other')).id);
		const from = await newProject(admin, 'Office move');
		const task = await newTask(admin, from.id, 'Pack');

		for (const target of [crypto.randomUUID(), foreign.id]) {
			expect(await moveTaskToProject(admin, task.id, target)).toEqual({
				ok: false,
				error: 'project_not_found'
			});
		}
		const found = await getTask(admin, task.taskTag);
		expect(found.ok && found.value.projectId).toBe(from.id);
		expect(await historyOf(task.id)).toHaveLength(1);
	});

	it('fails with task_not_found for an unknown task', async () => {
		const { admin } = await createWorkspace();
		const to = await newProject(admin, 'Warehouse');

		expect(await moveTaskToProject(admin, crypto.randomUUID(), to.id)).toEqual({
			ok: false,
			error: 'task_not_found'
		});
	});

	it('is refused for a role without projects.manage', async () => {
		const { admin, employee } = await createWorkspace();
		const from = await newProject(admin, 'Office move');
		const to = await newProject(admin, 'Warehouse');
		const task = await newTask(admin, from.id, 'Pack');

		await expect(moveTaskToProject(employee, task.id, to.id)).rejects.toThrow();
	});
});

describe('reparentTask', () => {
	it('moves two tasks inside one transaction while the locks are held', async () => {
		const { admin } = await createWorkspace();
		const from = await newProject(admin, 'Office move');
		const to = await newProject(admin, 'Warehouse');
		const first = await newTask(admin, from.id, 'First');
		const second = await newTask(admin, from.id, 'Second');

		await getDb().transaction(async (tx) => {
			const locked = await lockProjects(tx, admin, [from.id, to.id]);
			if (!locked.ok) throw new Error('setup');
			const target = locked.value.find((project) => project.id === to.id)!;
			for (const id of [first.id, second.id]) {
				const [task] = await tx.select().from(tasks).where(eq(tasks.id, id));
				await reparentTask(tx, admin, task, target);
			}
		});

		expect(await titlesIn(to.projectTag)).toEqual(['First', 'Second']);
		expect(await titlesIn(from.projectTag)).toEqual([]);
		expect(await historyOf(first.id)).toHaveLength(2);
		expect(await historyOf(second.id)).toHaveLength(2);
	});
});

describe('moveTaskToProject under concurrency', () => {
	it('lets A→B and B→A run at the same time without a deadlock', async () => {
		const { admin } = await createWorkspace();
		const a = await newProject(admin, 'Project A');
		const b = await newProject(admin, 'Project B');

		for (let round = 0; round < 10; round++) {
			const inA = await newTask(admin, a.id, `A${round}`);
			const inB = await newTask(admin, b.id, `B${round}`);

			const outcomes = await Promise.all([
				moveTaskToProject(admin, inA.id, b.id),
				moveTaskToProject(admin, inB.id, a.id)
			]);

			expect(outcomes).toEqual([
				{ ok: true, value: undefined },
				{ ok: true, value: undefined }
			]);
		}
	});

	it('ends a moveTask racing a move to another project with the task in the new project', async () => {
		const { admin, organisation } = await createWorkspace();
		const { started, completed } = await statesByGroup(organisation.id);
		const a = await newProject(admin, 'Project A');
		const b = await newProject(admin, 'Project B');

		for (let round = 0; round < 10; round++) {
			const task = await newTask(admin, a.id, `T${round}`, started.id);
			await newTask(admin, b.id, `Resident${round}`, completed.id);

			const [moved, reparented] = await Promise.all([
				moveTask(admin, task.id, completed.id),
				moveTaskToProject(admin, task.id, b.id)
			]);

			expect(reparented).toEqual({ ok: true, value: undefined });
			// moveTask retries against the task's new project instead of writing to the old one.
			expect(moved).toEqual({ ok: true, value: undefined });

			const [row] = await getDb().select().from(tasks).where(eq(tasks.id, task.id));
			expect(row.projectId).toBe(b.id);
			expect(row.stateId).toBe(completed.id);
			const column = await getDb()
				.select({ position: tasks.position })
				.from(tasks)
				.where(and(eq(tasks.projectId, b.id), eq(tasks.stateId, completed.id)));
			const positions = column.map((entry) => Number(entry.position));
			expect(new Set(positions).size).toBe(positions.length);
		}
	});

	it('makes lockTask follow a task that moved while it waited for the old project', async () => {
		const { admin } = await createWorkspace();
		const a = await newProject(admin, 'Project A');
		const b = await newProject(admin, 'Project B');
		const task = await newTask(admin, a.id, 'Pack');

		let release!: () => void;
		const gate = new Promise<void>((resolve) => (release = resolve));
		let locked!: () => void;
		const holding = new Promise<void>((resolve) => (locked = resolve));

		// A move that has locked both projects and not yet committed.
		const mover = getDb().transaction(async (tx) => {
			const rows = await lockProjects(tx, admin, [a.id, b.id]);
			if (!rows.ok) throw new Error('setup');
			const [row] = await tx.select().from(tasks).where(eq(tasks.id, task.id));
			await reparentTask(
				tx,
				admin,
				row,
				rows.value.find((project) => project.id === b.id)!
			);
			locked();
			await gate;
		});
		await holding;

		// Reads "the task is in A", then queues behind the mover for A's lock.
		const waiting = getDb().transaction((tx) => lockTask(tx, admin, task.id));
		await new Promise((resolve) => setTimeout(resolve, 100));
		release();
		await mover;

		const outcome = await waiting;
		expect(outcome.ok && outcome.value.project.id).toBe(b.id);
	});
});
