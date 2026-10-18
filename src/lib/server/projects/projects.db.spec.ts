import { asc, eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { getDb } from '../db';
import { activity } from '../activity/schema';
import { createOrganisation, createPerson, createViewer } from '../assets/testing/fixtures';
import {
	archiveProject,
	createProject,
	createTask,
	getProject,
	listProjects,
	moveTask,
	projectProgress,
	unarchiveProject,
	updateProject,
	updateTask
} from './index';
import { assignRow, createTaskRow, statesByGroup, createWorkspace } from './testing/fixtures';

async function historyOf(projectId: string) {
	const rows = await getDb()
		.select()
		.from(activity)
		.where(eq(activity.projectId, projectId))
		.orderBy(asc(activity.occurredAt), asc(activity.createdAt));
	return rows.map((row) => ({ verb: row.verb, payload: row.payload }));
}

async function newProject(
	actor: Awaited<ReturnType<typeof createWorkspace>>['admin'],
	input: Parameters<typeof createProject>[1] = { name: 'Office move' }
) {
	const created = await createProject(actor, input);
	if (!created.ok) throw new Error(`setup: ${created.error}`);
	return created.value;
}

describe('createProject', () => {
	it('creates the project with a PRJ-#### tag and writes project.created', async () => {
		const { admin } = await createWorkspace();

		const project = await newProject(admin, { name: '  Office move ', description: 'Floor 2' });

		expect(project.projectTag).toMatch(/^PRJ-\d{4,}$/);
		expect(await historyOf(project.id)).toEqual([
			{ verb: 'project.created', payload: { projectTag: project.projectTag, name: 'Office move' } }
		]);
		const found = await getProject(admin, project.projectTag);
		expect(found.ok && found.value).toMatchObject({ name: 'Office move', description: 'Floor 2' });
	});

	it('accepts an owner and a due date, and refuses an owner from another organisation', async () => {
		const { admin, organisation } = await createWorkspace();
		const owner = await createPerson(organisation.id, 'Grace Hopper');
		const stranger = await createPerson((await createWorkspace2()).id, 'Alan Turing');

		const created = await newProject(admin, {
			name: 'Migration',
			ownerPersonId: owner.id,
			dueDate: '2026-12-01'
		});
		const refused = await createProject(admin, { name: 'Other', ownerPersonId: stranger.id });

		const found = await getProject(admin, created.projectTag);
		expect(found.ok && found.value).toMatchObject({
			ownerName: 'Grace Hopper',
			dueDate: '2026-12-01'
		});
		expect(refused).toEqual({ ok: false, error: 'owner_not_found' });
	});

	it('takes an explicit tag, and refuses a duplicate with a typed failure', async () => {
		const { admin } = await createWorkspace();
		await newProject(admin, { name: 'First', projectTag: 'PRJ-9000' });

		const again = await createProject(admin, { name: 'Second', projectTag: 'PRJ-9000' });

		expect(again).toEqual({ ok: false, error: 'duplicate_project_tag' });
	});

	it('refuses the reserved tag `new` before it reaches the database', async () => {
		const { admin } = await createWorkspace();

		await expect(createProject(admin, { name: 'x', projectTag: 'new' })).rejects.toThrow();
	});

	it('is a manager’s write: an employee cannot call it', async () => {
		const { employee } = await createWorkspace();

		await expect(createProject(employee, { name: 'x' })).rejects.toThrow(/cannot manage projects/);
	});
});

const createWorkspace2 = () => createOrganisation('Other', 'other');

describe('updateProject', () => {
	it('records the owner change with names as they were, and a due date change', async () => {
		const { admin, organisation } = await createWorkspace();
		const ada = await createPerson(organisation.id, 'Ada Lovelace');
		const grace = await createPerson(organisation.id, 'Grace Hopper');
		const project = await newProject(admin, { name: 'Migration', ownerPersonId: ada.id });

		const updated = await updateProject(admin, project.id, {
			ownerPersonId: grace.id,
			dueDate: '2026-12-01'
		});

		expect(updated.ok).toBe(true);
		const [, ...changes] = await historyOf(project.id);
		expect(changes).toEqual([
			{
				verb: 'project.owner.changed',
				payload: {
					fromPersonId: ada.id,
					fromPersonName: 'Ada Lovelace',
					toPersonId: grace.id,
					toPersonName: 'Grace Hopper'
				}
			},
			{ verb: 'project.due.changed', payload: { from: null, to: '2026-12-01' } }
		]);
	});

	it('lets the owner be cleared, and records it', async () => {
		const { admin, organisation } = await createWorkspace();
		const ada = await createPerson(organisation.id, 'Ada Lovelace');
		const project = await newProject(admin, { name: 'Migration', ownerPersonId: ada.id });

		await updateProject(admin, project.id, { ownerPersonId: null });

		const history = await historyOf(project.id);
		expect(history.at(-1)).toEqual({
			verb: 'project.owner.changed',
			payload: {
				fromPersonId: ada.id,
				fromPersonName: 'Ada Lovelace',
				toPersonId: null,
				toPersonName: null
			}
		});
	});

	it('writes nothing for a rename, a description edit, or a change to what it already is', async () => {
		const { admin } = await createWorkspace();
		const project = await newProject(admin, { name: 'Migration', dueDate: '2026-12-01' });

		await updateProject(admin, project.id, {
			name: 'Migración',
			description: 'Servers',
			dueDate: '2026-12-01',
			ownerPersonId: null
		});

		expect(await historyOf(project.id)).toHaveLength(1);
		const found = await getProject(admin, project.projectTag);
		expect(found.ok && found.value.name).toBe('Migración');
	});

	it('edits the tag, and refuses one that is taken', async () => {
		const { admin } = await createWorkspace();
		const first = await newProject(admin, { name: 'First' });
		const second = await newProject(admin, { name: 'Second' });

		const renamed = await updateProject(admin, first.id, { projectTag: 'ALPHA' });
		const taken = await updateProject(admin, second.id, { projectTag: 'ALPHA' });

		expect(renamed.ok).toBe(true);
		expect(taken).toEqual({ ok: false, error: 'duplicate_project_tag' });
		expect((await getProject(admin, 'ALPHA')).ok).toBe(true);
	});

	it('refuses an owner who is not in the organisation, and a project that is not there', async () => {
		const { admin } = await createWorkspace();
		const project = await newProject(admin);
		const stranger = await createPerson((await createWorkspace2()).id, 'Alan Turing');

		expect(await updateProject(admin, project.id, { ownerPersonId: stranger.id })).toEqual({
			ok: false,
			error: 'owner_not_found'
		});
		expect(await updateProject(admin, crypto.randomUUID(), { name: 'x' })).toEqual({
			ok: false,
			error: 'project_not_found'
		});
	});
});

describe('archiving', () => {
	it('records project.archived and project.unarchived, once each', async () => {
		const { admin } = await createWorkspace();
		const project = await newProject(admin);

		await archiveProject(admin, project.id);
		await archiveProject(admin, project.id);
		await unarchiveProject(admin, project.id);
		await unarchiveProject(admin, project.id);

		expect((await historyOf(project.id)).map((entry) => entry.verb)).toEqual([
			'project.created',
			'project.archived',
			'project.unarchived'
		]);
	});

	it('makes every write on the project fail until it is unarchived', async () => {
		const { admin, organisation } = await createWorkspace();
		const { started } = await statesByGroup(organisation.id);
		const project = await newProject(admin);
		const task = await createTask(admin, project.id, { title: 'Pack' });
		if (!task.ok) throw new Error('setup');
		await archiveProject(admin, project.id);

		const refused = {
			update: await updateProject(admin, project.id, { name: 'x' }),
			create: await createTask(admin, project.id, { title: 'More' }),
			edit: await updateTask(admin, task.value.id, { title: 'y' }),
			move: await moveTask(admin, task.value.id, started.id)
		};

		for (const outcome of Object.values(refused)) {
			expect(outcome).toEqual({ ok: false, error: 'project_archived' });
		}

		await unarchiveProject(admin, project.id);

		expect((await updateProject(admin, project.id, { name: 'x' })).ok).toBe(true);
		expect((await createTask(admin, project.id, { title: 'More' })).ok).toBe(true);
		expect((await updateTask(admin, task.value.id, { title: 'y' })).ok).toBe(true);
		expect((await moveTask(admin, task.value.id, started.id)).ok).toBe(true);
	});

	it('refuses a project that does not exist', async () => {
		const { admin } = await createWorkspace();

		expect(await archiveProject(admin, crypto.randomUUID())).toEqual({
			ok: false,
			error: 'project_not_found'
		});
		expect(await unarchiveProject(admin, crypto.randomUUID())).toEqual({
			ok: false,
			error: 'project_not_found'
		});
	});
});

describe('listProjects', () => {
	it('lists the active ones by default, and the archived ones on request', async () => {
		const { admin } = await createWorkspace();
		const live = await newProject(admin, { name: 'Live' });
		const old = await newProject(admin, { name: 'Old' });
		await archiveProject(admin, old.id);

		const active = await listProjects(admin);
		const archived = await listProjects(admin, { archived: true });

		expect(active.map((p) => p.id)).toEqual([live.id]);
		expect(archived.map((p) => p.id)).toEqual([old.id]);
		expect(archived[0].archivedAt).toBeInstanceOf(Date);
	});

	it('orders by due date, projects with none last', async () => {
		const { admin } = await createWorkspace();
		await newProject(admin, { name: 'Undated' });
		await newProject(admin, { name: 'Later', dueDate: '2027-01-01' });
		await newProject(admin, { name: 'Sooner', dueDate: '2026-11-01' });

		const names = (await listProjects(admin)).map((project) => project.name);

		expect(names).toEqual(['Sooner', 'Later', 'Undated']);
	});

	it('filters by text, stemmed and unaccented', async () => {
		const { admin } = await createWorkspace();
		await newProject(admin, { name: 'Migración de servidores' });
		await newProject(admin, { name: 'Office move', description: 'Mudanza de planta' });

		expect((await listProjects(admin, { q: 'migracion' })).map((p) => p.name)).toEqual([
			'Migración de servidores'
		]);
		expect((await listProjects(admin, { q: 'mudanzas' })).map((p) => p.name)).toEqual([
			'Office move'
		]);
		expect(await listProjects(admin, { q: 'impresora' })).toEqual([]);
	});

	it('does not show one organisation the projects of another', async () => {
		const mine = await createWorkspace();
		await newProject(mine.admin);

		const other = await createOrganisation('Other', 'other');
		const outsider = await createViewer(other.id, 'admin', 'Other Admin');

		expect(await listProjects(outsider)).toEqual([]);
	});
});

describe('listProjects, paged', () => {
	it('returns one page with totals, in the same order as the unpaged list', async () => {
		const { admin } = await createWorkspace();
		for (const name of ['A', 'B', 'C', 'D', 'E']) await newProject(admin, { name });

		const all = (await listProjects(admin)).map((p) => p.id);
		const first = await listProjects(admin, {}, { page: 1, perPage: 2 });
		const last = await listProjects(admin, {}, { page: 3, perPage: 2 });

		expect(first.rows.map((p) => p.id)).toEqual(all.slice(0, 2));
		expect(last.rows.map((p) => p.id)).toEqual(all.slice(4));
		expect(first).toMatchObject({ page: 1, perPage: 2, total: 5, pageCount: 3 });
	});

	it('counts only what the filter and the viewer’s scope let through', async () => {
		const { admin, employee, organisation } = await createWorkspace();
		const { backlog } = await statesByGroup(organisation.id);
		const mine = await newProject(admin, { name: 'Mine' });
		await newProject(admin, { name: 'Hidden one' });
		await newProject(admin, { name: 'Hidden two' });
		const old = await newProject(admin, { name: 'Old' });
		await archiveProject(admin, old.id);
		const task = await createTaskRow(organisation.id, mine.id, backlog.id);
		await assignRow(organisation.id, task.id, employee.personId!);

		const seen = await listProjects(employee, {}, { perPage: 10 });
		const archived = await listProjects(admin, { archived: true }, { perPage: 10 });

		expect(seen.total).toBe(1);
		expect(seen.rows.map((p) => p.name)).toEqual(['Mine']);
		expect(archived.total).toBe(1);
	});
});

describe('getProject', () => {
	it('fails with a typed error for an unknown tag', async () => {
		const { admin } = await createWorkspace();

		expect(await getProject(admin, 'PRJ-0000')).toEqual({ ok: false, error: 'project_not_found' });
	});
});

describe('projectProgress', () => {
	it('counts tasks per group and divides completed by everything not cancelled', async () => {
		const { admin, organisation } = await createWorkspace();
		const { unstarted, started, completed, cancelled } = await statesByGroup(organisation.id);
		const project = await newProject(admin);
		const place = async (title: string, stateId: string) => {
			const created = await createTask(admin, project.id, { title, stateId });
			if (!created.ok) throw new Error('setup');
		};
		await place('one', completed.id);
		await place('two', completed.id);
		await place('three', started.id);
		await place('four', unstarted.id);
		await place('five', cancelled.id);

		const progress = await projectProgress(admin, project.id);

		expect(progress.ok && progress.value).toEqual({
			counts: { backlog: 0, unstarted: 1, started: 1, completed: 2, cancelled: 1 },
			total: 5,
			ratio: 0.5
		});
	});

	it('is 0, not NaN, for a project with nothing to count', async () => {
		const { admin, organisation } = await createWorkspace();
		const { cancelled } = await statesByGroup(organisation.id);
		const project = await newProject(admin);
		const empty = await projectProgress(admin, project.id);
		await createTask(admin, project.id, { title: 'Dropped', stateId: cancelled.id });
		const onlyCancelled = await projectProgress(admin, project.id);

		expect(empty.ok && empty.value.ratio).toBe(0);
		expect(onlyCancelled.ok && onlyCancelled.value.ratio).toBe(0);
	});

	it('fails for a project the viewer cannot see', async () => {
		const { admin } = await createWorkspace();

		expect(await projectProgress(admin, crypto.randomUUID())).toEqual({
			ok: false,
			error: 'project_not_found'
		});
	});
});
