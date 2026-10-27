import { asc, eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { activity } from '../activity/schema';
import { createViewer } from '../assets/testing/fixtures';
import { constraintViolation } from '../db/errors';
import { getDb } from '../db';
import {
	archiveProject,
	createMilestone,
	createTask,
	deleteMilestone,
	listMilestones,
	listTasks,
	projectProgress,
	setTaskMilestone,
	updateMilestone
} from './index';
import { milestones, tasks } from './schema';
import {
	assignRow,
	createMilestoneRow,
	createProjectRow,
	createTaskRow,
	createWorkspace,
	statesByGroup
} from './testing/fixtures';

async function setup() {
	const workspace = await createWorkspace();
	const project = await createProjectRow(workspace.organisation.id);
	const states = await statesByGroup(workspace.organisation.id);
	return { ...workspace, project, states };
}

async function entries(where: { projectId: string } | { taskId: string }) {
	const column = 'projectId' in where ? activity.projectId : activity.taskId;
	const value = 'projectId' in where ? where.projectId : where.taskId;
	const rows = await getDb()
		.select()
		.from(activity)
		.where(eq(column, value))
		.orderBy(asc(activity.occurredAt), asc(activity.createdAt));
	return rows.map((row) => ({ verb: row.verb, payload: row.payload }));
}

const range = { startDate: '2026-11-01', targetDate: '2026-11-30' };

describe('writing milestones', () => {
	it('lets a technician create, update and delete one, and refuses an employee each time', async () => {
		const { technician, employee, project } = await setup();

		const created = await createMilestone(technician, project.id, { name: ' Pilot ', ...range });
		expect(created.ok).toBe(true);
		if (!created.ok) return;

		const updated = await updateMilestone(technician, project.id, created.value.id, {
			name: 'Go-live'
		});
		expect(updated.ok).toBe(true);
		const listed = await listMilestones(technician, project.id);
		expect(listed.ok && listed.value.map((m) => m.name)).toEqual(['Go-live']);

		await expect(createMilestone(employee, project.id, { name: 'X', ...range })).rejects.toThrow(
			/cannot manage projects/
		);
		await expect(
			updateMilestone(employee, project.id, created.value.id, { name: 'X' })
		).rejects.toThrow(/cannot manage projects/);
		await expect(deleteMilestone(employee, project.id, created.value.id)).rejects.toThrow(
			/cannot manage projects/
		);

		expect((await deleteMilestone(technician, project.id, created.value.id)).ok).toBe(true);
		const after = await listMilestones(technician, project.id);
		expect(after.ok && after.value).toEqual([]);
	});

	it('refuses start after target in the domain and in the database', async () => {
		const { technician, organisation, project } = await setup();
		const bad = { startDate: '2026-12-01', targetDate: '2026-11-01' };

		expect(await createMilestone(technician, project.id, { name: 'X', ...bad })).toEqual({
			ok: false,
			error: 'invalid_dates'
		});

		const existing = await createMilestoneRow(organisation.id, project.id);
		// Only the start is sent: it is checked against the stored target.
		expect(
			await updateMilestone(technician, project.id, existing.id, { startDate: '2026-12-15' })
		).toEqual({
			ok: false,
			error: 'invalid_dates'
		});

		const insert = getDb()
			.insert(milestones)
			.values({ organisationId: organisation.id, projectId: project.id, name: 'X', ...bad });
		await expect(insert).rejects.toSatisfy(
			(error) => constraintViolation(error)?.constraint === 'milestones_dates_ordered'
		);
	});

	it('names which field is invalid', async () => {
		const { technician, project } = await setup();

		expect(await createMilestone(technician, project.id, { name: '  ', ...range })).toEqual({
			ok: false,
			error: 'invalid_name'
		});
		expect(
			await createMilestone(technician, project.id, {
				name: 'X',
				description: 'x'.repeat(20_001),
				...range
			})
		).toEqual({ ok: false, error: 'invalid_description' });
		expect(
			await createMilestone(technician, project.id, { name: 'X', ...range, startDate: 'soon' })
		).toEqual({ ok: false, error: 'invalid_dates' });
	});

	it('is not found for a project or milestone that is not there', async () => {
		const { technician, project } = await setup();
		const nobody = crypto.randomUUID();

		expect(await createMilestone(technician, nobody, { name: 'X', ...range })).toEqual({
			ok: false,
			error: 'project_not_found'
		});
		expect(await updateMilestone(technician, project.id, nobody, { name: 'X' })).toEqual({
			ok: false,
			error: 'milestone_not_found'
		});
		expect(await deleteMilestone(technician, project.id, nobody)).toEqual({
			ok: false,
			error: 'milestone_not_found'
		});
		expect(project.id).toBeTruthy();
	});

	it('does not update or delete a milestone through a project it is not in', async () => {
		const { technician, organisation, project } = await setup();
		const other = await createProjectRow(organisation.id, { name: 'Elsewhere' });
		const foreign = await createMilestoneRow(organisation.id, other.id, { name: 'Theirs' });

		const missing = { ok: false, error: 'milestone_not_found' };
		expect(await updateMilestone(technician, project.id, foreign.id, { name: 'X' })).toEqual(
			missing
		);
		expect(await deleteMilestone(technician, project.id, foreign.id)).toEqual(missing);

		const listed = await listMilestones(technician, other.id);
		expect(listed.ok && listed.value.map((m) => m.name)).toEqual(['Theirs']);
		expect(await entries({ projectId: other.id })).toEqual([]);
	});

	it('refuses every write on an archived project', async () => {
		const { technician, organisation, project, states } = await setup();
		const milestone = await createMilestoneRow(organisation.id, project.id);
		const task = await createTaskRow(organisation.id, project.id, states.unstarted.id);
		await archiveProject(technician, project.id);

		const archived = { ok: false, error: 'project_archived' };
		expect(await createMilestone(technician, project.id, { name: 'X', ...range })).toEqual(
			archived
		);
		expect(await updateMilestone(technician, project.id, milestone.id, { name: 'X' })).toEqual(
			archived
		);
		expect(await deleteMilestone(technician, project.id, milestone.id)).toEqual(archived);
		expect(await setTaskMilestone(technician, task.id, milestone.id)).toEqual(archived);
	});
});

describe('assigning a task to a milestone', () => {
	it('refuses a milestone of another project, in the domain and in the database', async () => {
		const { technician, organisation, project, states } = await setup();
		const other = await createProjectRow(organisation.id, { name: 'Elsewhere' });
		const foreign = await createMilestoneRow(organisation.id, other.id);
		const task = await createTaskRow(organisation.id, project.id, states.unstarted.id);

		expect(await setTaskMilestone(technician, task.id, foreign.id)).toEqual({
			ok: false,
			error: 'milestone_not_found'
		});
		expect(await setTaskMilestone(technician, task.id, crypto.randomUUID())).toEqual({
			ok: false,
			error: 'milestone_not_found'
		});

		await expect(
			getDb().update(tasks).set({ milestoneId: foreign.id }).where(eq(tasks.id, task.id))
		).rejects.toSatisfy(
			(error) => constraintViolation(error)?.constraint === 'tasks_milestone_same_project_fk'
		);
	});

	it('sets, clears and records the change with the names as they read', async () => {
		const { technician, organisation, project, states } = await setup();
		const milestone = await createMilestoneRow(organisation.id, project.id, { name: 'Pilot' });
		const task = await createTaskRow(organisation.id, project.id, states.unstarted.id);

		expect((await setTaskMilestone(technician, task.id, milestone.id)).ok).toBe(true);
		expect((await setTaskMilestone(technician, task.id, null)).ok).toBe(true);

		expect(await entries({ taskId: task.id })).toEqual([
			{
				verb: 'task.milestone.changed',
				payload: { from: null, to: { id: milestone.id, name: 'Pilot' } }
			},
			{
				verb: 'task.milestone.changed',
				payload: { from: { id: milestone.id, name: 'Pilot' }, to: null }
			}
		]);
	});

	it('records nothing when the value does not change', async () => {
		const { technician, organisation, project, states } = await setup();
		const milestone = await createMilestoneRow(organisation.id, project.id);
		const task = await createTaskRow(organisation.id, project.id, states.unstarted.id, {
			milestoneId: milestone.id
		});

		expect((await setTaskMilestone(technician, task.id, milestone.id)).ok).toBe(true);
		expect((await setTaskMilestone(technician, task.id, null)).ok).toBe(true);
		expect((await setTaskMilestone(technician, task.id, null)).ok).toBe(true);

		expect(await entries({ taskId: task.id })).toHaveLength(1);
	});

	it("stores the milestone a task is created in, and refuses another project's", async () => {
		const { technician, organisation, project } = await setup();
		const other = await createProjectRow(organisation.id, { name: 'Elsewhere' });
		const mine = await createMilestoneRow(organisation.id, project.id);
		const foreign = await createMilestoneRow(organisation.id, other.id);

		const created = await createTask(technician, project.id, { title: 'In', milestoneId: mine.id });
		expect(created.ok).toBe(true);
		const [stored] = await listTasks(technician, { projectId: project.id });
		expect(stored).toMatchObject({ milestoneId: mine.id, milestoneName: 'Pilot' });
		// Born there: `task.created` covers it.
		expect((await entries({ taskId: stored.id })).map((e) => e.verb)).toEqual(['task.created']);

		expect(
			await createTask(technician, project.id, { title: 'Out', milestoneId: foreign.id })
		).toEqual({ ok: false, error: 'milestone_not_found' });
	});
});

describe('deleting a milestone', () => {
	it('detaches its tasks and deletes none, recording only the milestone', async () => {
		const { technician, organisation, project, states } = await setup();
		const milestone = await createMilestoneRow(organisation.id, project.id, { name: 'Pilot' });
		const task = await createTaskRow(organisation.id, project.id, states.unstarted.id, {
			milestoneId: milestone.id
		});

		expect((await deleteMilestone(technician, project.id, milestone.id)).ok).toBe(true);

		const [row] = await getDb().select().from(tasks).where(eq(tasks.id, task.id));
		expect(row).toMatchObject({ milestoneId: null, projectId: project.id });
		expect(await entries({ taskId: task.id })).toEqual([]);
		expect(await entries({ projectId: project.id })).toEqual([
			{ verb: 'project.milestone.deleted', payload: { name: 'Pilot' } }
		]);
	});
});

describe('the milestone entries', () => {
	it('records creation and a change with only the changed fields', async () => {
		const { technician, project } = await setup();
		const created = await createMilestone(technician, project.id, { name: 'Pilot', ...range });
		if (!created.ok) throw new Error('setup');
		const id = created.value.id;

		await updateMilestone(technician, project.id, id, {
			targetDate: '2026-12-15',
			name: 'Pilot 2'
		});

		expect(await entries({ projectId: project.id })).toEqual([
			{ verb: 'project.milestone.created', payload: { milestoneId: id, name: 'Pilot', ...range } },
			{
				verb: 'project.milestone.changed',
				payload: {
					milestoneId: id,
					name: 'Pilot 2',
					from: { name: 'Pilot', targetDate: '2026-11-30' },
					to: { name: 'Pilot 2', targetDate: '2026-12-15' }
				}
			}
		]);
	});

	it('records nothing for a description-only edit or an edit that changes nothing', async () => {
		const { technician, project } = await setup();
		const created = await createMilestone(technician, project.id, { name: 'Pilot', ...range });
		if (!created.ok) throw new Error('setup');
		const id = created.value.id;

		await updateMilestone(technician, project.id, id, { description: 'Why it matters' });
		await updateMilestone(technician, project.id, id, { name: 'Pilot', ...range });
		await updateMilestone(technician, project.id, id, {});

		expect((await entries({ projectId: project.id })).map((e) => e.verb)).toEqual([
			'project.milestone.created'
		]);
		const listed = await listMilestones(technician, project.id);
		expect(listed.ok && listed.value[0].description).toBe('Why it matters');
	});
});

describe('listMilestones', () => {
	it('keeps the fixed order whatever the insertion order', async () => {
		const { technician, organisation, project } = await setup();
		const make = (name: string, startDate: string, targetDate: string) =>
			createMilestoneRow(organisation.id, project.id, { name, startDate, targetDate });
		await make('b late', '2026-12-01', '2026-12-31');
		await make('z same dates', '2026-11-01', '2026-11-30');
		await make('a same dates', '2026-11-01', '2026-11-30');
		await make('shorter', '2026-11-01', '2026-11-15');

		const listed = await listMilestones(technician, project.id);

		expect(listed.ok && listed.value.map((m) => m.name)).toEqual([
			'shorter',
			'a same dates',
			'z same dates',
			'b late'
		]);
	});

	it('derives status and progress from the tasks, with a fixed clock', async () => {
		const { technician, organisation, project, states } = await setup();
		const milestone = await createMilestoneRow(organisation.id, project.id, {
			startDate: '2026-11-10',
			targetDate: '2026-11-20'
		});
		const make = (stateId: string) =>
			createTaskRow(organisation.id, project.id, stateId, { milestoneId: milestone.id });
		const first = await make(states.completed.id);
		await make(states.started.id);
		await make(states.cancelled.id);

		const at = async (day: string) => {
			const listed = await listMilestones(technician, project.id, {
				now: new Date(`${day}T12:00:00Z`)
			});
			if (!listed.ok) throw new Error('setup');
			return listed.value[0];
		};

		const active = await at('2026-11-15');
		expect(active.status).toBe('active');
		expect(active.progress).toMatchObject({ total: 3, ratio: 0.5 });
		expect((await at('2026-11-21')).status).toBe('overdue');
		expect((await at('2026-11-09')).status).toBe('upcoming');

		await getDb()
			.update(tasks)
			.set({ stateId: states.completed.id })
			.where(eq(tasks.milestoneId, milestone.id));
		expect((await at('2026-12-31')).status).toBe('completed');

		// Reopening a task is the whole "un-achieving": no write to the milestone.
		await getDb().update(tasks).set({ stateId: states.started.id }).where(eq(tasks.id, first.id));
		expect((await at('2026-12-31')).status).toBe('overdue');
	});

	it('counts only the tasks an employee may see, as projectProgress does', async () => {
		const { employee, organisation, project, states } = await setup();
		const milestone = await createMilestoneRow(organisation.id, project.id);
		const mine = await createTaskRow(organisation.id, project.id, states.completed.id, {
			milestoneId: milestone.id
		});
		await createTaskRow(organisation.id, project.id, states.started.id, {
			milestoneId: milestone.id
		});
		await assignRow(organisation.id, mine.id, employee.personId!);

		const listed = await listMilestones(employee, project.id);
		const progress = await projectProgress(employee, project.id);

		if (!listed.ok || !progress.ok) throw new Error('setup');
		expect(listed.value[0].progress).toMatchObject({ total: 1, ratio: 1 });
		expect(listed.value[0].progress.total).toBe(progress.value.total);
		expect(listed.value[0].status).toBe('completed');
	});

	it('is not found for a members-only project the viewer cannot see', async () => {
		const { organisation, technician } = await setup();
		const hidden = await createProjectRow(organisation.id, { visibility: 'members' });
		const outsider = await createViewer(organisation.id, 'technician', 'Otto Outsider');
		await createMilestoneRow(organisation.id, hidden.id);

		expect(await listMilestones(outsider, hidden.id)).toEqual({
			ok: false,
			error: 'project_not_found'
		});
		expect(technician).toBeTruthy();
	});
});

describe('filtering tasks by milestone', () => {
	it("returns a milestone's tasks, or with `none` the ones without a milestone", async () => {
		const { technician, organisation, project, states } = await setup();
		const milestone = await createMilestoneRow(organisation.id, project.id);
		const inside = await createTaskRow(organisation.id, project.id, states.unstarted.id, {
			title: 'inside',
			milestoneId: milestone.id
		});
		const outside = await createTaskRow(organisation.id, project.id, states.unstarted.id, {
			title: 'outside'
		});

		const ids = async (milestoneFilter: string) =>
			(await listTasks(technician, { projectId: project.id, milestone: milestoneFilter })).map(
				(task) => task.id
			);

		expect(await ids(milestone.id)).toEqual([inside.id]);
		expect(await ids('none')).toEqual([outside.id]);
		expect(await ids(crypto.randomUUID())).toEqual([]);
	});
});
