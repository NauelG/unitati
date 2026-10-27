import { readFileSync } from 'node:fs';
import { sql } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { getDb } from '../db';
import { refusalFrom } from '../db/testing/refusal';
import { createOrganisation, createPerson } from '../assets/testing/fixtures';
import { activity } from '../activity/schema';
import { ensureDefaultStates } from './defaults';
import { states } from './schema';
import {
	assignRow,
	createProjectRow,
	createStateRow,
	createTaskRow,
	createWorkspace,
	statesByGroup
} from './testing/fixtures';

const number = (tag: string) => Number(tag.replace(/^[A-Z]+-/, ''));

describe('the projects and tasks tables', () => {
	it('generate PRJ-#### and TSK-#### tags from their own sequences', async () => {
		const { organisation } = await createWorkspace();
		const { backlog } = await statesByGroup(organisation.id);

		const first = await createProjectRow(organisation.id);
		const second = await createProjectRow(organisation.id);
		const task = await createTaskRow(organisation.id, first.id, backlog.id);
		const next = await createTaskRow(organisation.id, first.id, backlog.id);

		expect(first.projectTag).toMatch(/^PRJ-\d{4,}$/);
		expect(number(second.projectTag)).toBe(number(first.projectTag) + 1);
		expect(task.taskTag).toMatch(/^TSK-\d{4,}$/);
		expect(number(next.taskTag)).toBe(number(task.taskTag) + 1);
	});

	it('refuse a duplicate tag inside one organisation', async () => {
		const { organisation } = await createWorkspace();
		const { backlog } = await statesByGroup(organisation.id);
		const project = await createProjectRow(organisation.id, { projectTag: 'PRJ-9000' });
		await createTaskRow(organisation.id, project.id, backlog.id, { taskTag: 'TSK-9000' });

		expect(
			await refusalFrom(createProjectRow(organisation.id, { projectTag: 'PRJ-9000' }))
		).toEqual({ code: '23505', constraint: 'projects_org_tag' });
		expect(
			await refusalFrom(
				createTaskRow(organisation.id, project.id, backlog.id, { taskTag: 'TSK-9000' })
			)
		).toEqual({ code: '23505', constraint: 'tasks_org_tag' });
	});

	it('carry no phase', async () => {
		const columns = await getDb().execute<{ table_name: string; column_name: string }>(
			sql`select table_name, column_name from information_schema.columns
				where table_name in ('projects', 'tasks')`
		);
		const names = [...columns].map((row) => row.column_name);

		expect(names).toContain('state_id');
		expect(names).not.toContain('phase');
	});

	it('refuse a parent task of another project, and a task that is its own parent', async () => {
		const { organisation } = await createWorkspace();
		const { backlog } = await statesByGroup(organisation.id);
		const here = await createProjectRow(organisation.id);
		const there = await createProjectRow(organisation.id);
		const parent = await createTaskRow(organisation.id, here.id, backlog.id);
		const task = await createTaskRow(organisation.id, there.id, backlog.id);

		expect(
			await refusalFrom(
				getDb().execute(sql`update tasks set parent_task_id = ${parent.id} where id = ${task.id}`)
			)
		).toEqual({ code: '23503', constraint: 'tasks_parent_same_project_fk' });
		expect(
			await refusalFrom(
				getDb().execute(sql`update tasks set parent_task_id = id where id = ${task.id}`)
			)
		).toEqual({ code: '23514', constraint: 'tasks_parent_not_self' });
	});

	it('detach the subtasks of a deleted task, and keep their project', async () => {
		const { organisation } = await createWorkspace();
		const { backlog } = await statesByGroup(organisation.id);
		const project = await createProjectRow(organisation.id);
		const parent = await createTaskRow(organisation.id, project.id, backlog.id);
		const child = await createTaskRow(organisation.id, project.id, backlog.id, {
			parentTaskId: parent.id
		});

		await getDb().execute(sql`delete from tasks where id = ${parent.id}`);

		const [row] = await getDb().execute<{ project_id: string; parent_task_id: string | null }>(
			sql`select project_id, parent_task_id from tasks where id = ${child.id}`
		);
		expect(row).toEqual({ project_id: project.id, parent_task_id: null });
	});

	it('let a family change project in one statement, and no other way', async () => {
		const { organisation } = await createWorkspace();
		const { backlog } = await statesByGroup(organisation.id);
		const from = await createProjectRow(organisation.id);
		const to = await createProjectRow(organisation.id);
		const parent = await createTaskRow(organisation.id, from.id, backlog.id);
		const child = await createTaskRow(organisation.id, from.id, backlog.id, {
			parentTaskId: parent.id
		});

		expect(
			await refusalFrom(
				getDb().execute(sql`update tasks set project_id = ${to.id} where id = ${parent.id}`)
			)
		).toEqual({ code: '23503', constraint: 'tasks_parent_same_project_fk' });

		await getDb().execute(
			sql`update tasks set project_id = ${to.id} where id in (${parent.id}, ${child.id})`
		);
		const rows = await getDb().execute<{ project_id: string }>(
			sql`select project_id from tasks where id in (${parent.id}, ${child.id})`
		);
		expect([...rows].map((row) => row.project_id)).toEqual([to.id, to.id]);
	});

	it('refuse a task with no project, and no state', async () => {
		const { organisation } = await createWorkspace();
		const project = await createProjectRow(organisation.id);
		const { backlog } = await statesByGroup(organisation.id);

		const noState = await refusalFrom(
			getDb().execute(
				sql`insert into tasks (organisation_id, project_id, title, position)
					values (${organisation.id}, ${project.id}, 'x', 1)`
			)
		);
		const noProject = await refusalFrom(
			getDb().execute(
				sql`insert into tasks (organisation_id, state_id, title, position)
					values (${organisation.id}, ${backlog.id}, 'x', 1)`
			)
		);

		expect(noState?.code).toBe('23502');
		expect(noProject?.code).toBe('23502');
	});

	it('do not let a state with tasks in it be deleted', async () => {
		const { organisation } = await createWorkspace();
		const { backlog } = await statesByGroup(organisation.id);
		const project = await createProjectRow(organisation.id);
		await createTaskRow(organisation.id, project.id, backlog.id);

		const refusal = await refusalFrom(
			getDb().execute(sql`delete from states where id = ${backlog.id}`)
		);

		expect(refusal?.code).toBe('23503');
		const [still] = await getDb()
			.select()
			.from(states)
			.where(sql`${states.id} = ${backlog.id}`);
		expect(still).toBeDefined();
	});

	it('take a task out with its project, and its assignees and history with it', async () => {
		const { organisation } = await createWorkspace();
		const { backlog } = await statesByGroup(organisation.id);
		const person = await createPerson(organisation.id, 'Grace Hopper');
		const project = await createProjectRow(organisation.id);
		const task = await createTaskRow(organisation.id, project.id, backlog.id);
		await assignRow(organisation.id, task.id, person.id);
		await getDb()
			.insert(activity)
			.values({
				organisationId: organisation.id,
				taskId: task.id,
				verb: 'task.created',
				payload: { taskTag: task.taskTag, title: task.title }
			});

		await getDb().execute(sql`delete from projects where id = ${project.id}`);

		const [{ count }] = await getDb().execute<{ count: number }>(
			sql`select (select count(*) from tasks)::int
				+ (select count(*) from task_assignees)::int
				+ (select count(*) from activity)::int as count`
		);
		expect(count).toBe(0);
	});

	it('refuse a second row for the same person on one task', async () => {
		const { organisation } = await createWorkspace();
		const { backlog } = await statesByGroup(organisation.id);
		const person = await createPerson(organisation.id, 'Grace Hopper');
		const project = await createProjectRow(organisation.id);
		const task = await createTaskRow(organisation.id, project.id, backlog.id);
		await assignRow(organisation.id, task.id, person.id);

		const refusal = await refusalFrom(assignRow(organisation.id, task.id, person.id));

		expect(refusal?.code).toBe('23505');
	});
});

describe('activity foreign keys', () => {
	it('refuse history about a project or task that does not exist', async () => {
		const { organisation } = await createWorkspace();
		const missing = crypto.randomUUID();
		const entry = {
			organisationId: organisation.id,
			verb: 'project.archived' as const,
			payload: {}
		};

		const project = await refusalFrom(
			getDb()
				.insert(activity)
				.values({ ...entry, projectId: missing })
		);
		const task = await refusalFrom(
			getDb()
				.insert(activity)
				.values({ ...entry, verb: 'task.assigned', payload: {}, taskId: missing })
		);

		expect(project?.code).toBe('23503');
		expect(task?.code).toBe('23503');
	});
});

describe('Spanish search', () => {
	it('stems and unaccents project and task prose alike', async () => {
		const { organisation } = await createWorkspace();
		const { backlog } = await statesByGroup(organisation.id);
		const project = await createProjectRow(organisation.id, {
			name: 'Migración',
			description: 'Servidores del centro de datos'
		});
		await createTaskRow(organisation.id, project.id, backlog.id, { title: 'Mudanza' });

		const hits = async (table: 'projects' | 'tasks', term: string) =>
			(
				await getDb().execute(
					sql`select 1 from ${sql.raw(table)}
						where search @@ plainto_tsquery('spanish', immutable_unaccent(${term}))`
				)
			).length;

		expect(await hits('projects', 'migracion')).toBe(1);
		expect(await hits('projects', 'servidor')).toBe(1);
		expect(await hits('tasks', 'mudanzas')).toBe(1);
		expect(await hits('tasks', 'impresora')).toBe(0);
	});
});

describe('default states', () => {
	const groupsOf = async (organisationId: string) =>
		(
			await getDb()
				.select()
				.from(states)
				.where(sql`${states.organisationId} = ${organisationId}`)
		)
			.map((state) => state.group)
			.sort();

	const FIVE = ['backlog', 'cancelled', 'completed', 'started', 'unstarted'];

	it('are five, one per group, all at position 0', async () => {
		const organisation = await createOrganisation();

		await ensureDefaultStates(getDb(), organisation.id);

		expect(await groupsOf(organisation.id)).toEqual(FIVE);
		const rows = await getDb().select().from(states);
		expect(rows.every((state) => state.position === 0)).toBe(true);
	});

	it('are inserted once: a second call, or a renamed catalogue, adds nothing', async () => {
		const organisation = await createOrganisation();
		await ensureDefaultStates(getDb(), organisation.id);
		await getDb()
			.update(states)
			.set({ name: 'Renamed' })
			.where(sql`${states.group} = 'backlog'`);

		await ensureDefaultStates(getDb(), organisation.id);

		expect(await groupsOf(organisation.id)).toEqual(FIVE);
	});

	it('are not forced on an organisation that already built its own', async () => {
		const organisation = await createOrganisation();
		await createStateRow(organisation.id, 'Mine', 'backlog');

		await ensureDefaultStates(getDb(), organisation.id);

		expect(await groupsOf(organisation.id)).toEqual(['backlog']);
	});

	describe('the migration', () => {
		// The backfill is the last statement of the migration. It runs here against
		// organisations that exist without states, which is exactly a deployed instance.
		const backfill = readFileSync('drizzle/0004_projects.sql', 'utf8')
			.split('--> statement-breakpoint')
			.at(-1)!;

		it('gives every organisation without states the five, and nobody else anything', async () => {
			const bare = await createOrganisation('Bare', 'bare');
			const custom = await createOrganisation('Custom', 'custom');
			await createStateRow(custom.id, 'Mine', 'started');

			await getDb().execute(sql.raw(backfill));

			expect(await groupsOf(bare.id)).toEqual(FIVE);
			expect(await groupsOf(custom.id)).toEqual(['started']);
		});

		it('is idempotent', async () => {
			const bare = await createOrganisation('Bare', 'bare');

			await getDb().execute(sql.raw(backfill));
			await getDb().execute(sql.raw(backfill));

			expect(await groupsOf(bare.id)).toEqual(FIVE);
		});
	});
});
