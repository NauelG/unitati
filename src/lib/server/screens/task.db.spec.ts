import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { createOrganisation, createViewer } from '../assets/testing/fixtures';
import { getDb } from '../db';
import { linkTicketToTask } from '../links';
import { archiveProject } from '../projects';
import { projectMembers, projects, tasks } from '../projects/schema';
import {
	assignRow,
	createMilestoneRow,
	createProjectRow,
	createTaskRow,
	createWorkspace,
	statesByGroup
} from '../projects/testing/fixtures';
import { createQueue, createTicket } from '../service-desk/testing/fixtures';
import { logTime, setTimeTracking } from '../time';
import { taskScreen } from './task';

async function setup() {
	const workspace = await createWorkspace();
	const project = await createProjectRow(workspace.organisation.id);
	const states = await statesByGroup(workspace.organisation.id);
	const task = await createTaskRow(workspace.organisation.id, project.id, states.unstarted.id);
	await assignRow(workspace.organisation.id, task.id, workspace.employee.personId!);
	const unrelated = await createViewer(workspace.organisation.id, 'employee', 'Una Unrelated');
	return { ...workspace, project, states, task, unrelated };
}

async function screenOf(viewer: Parameters<typeof taskScreen>[0], tag: string) {
	const outcome = await taskScreen(viewer, tag);
	if (!outcome.ok) throw new Error(`expected a screen, got ${outcome.error}`);
	return outcome.value;
}

const NO_ACTS = {
	edit: false,
	changeState: false,
	assign: false,
	setMilestone: false,
	setParent: false,
	addSubtask: false,
	moveToProject: false,
	comment: false,
	attach: false,
	unlinkTicket: false
};

describe('the task screen, per role', () => {
	it('lets an administrator do everything and loads every picker', async () => {
		const { admin, task, project } = await setup();

		const screen = await screenOf(admin, task.taskTag);

		expect(screen.may).toEqual({
			edit: true,
			changeState: true,
			assign: true,
			setMilestone: true,
			setParent: true,
			addSubtask: true,
			moveToProject: true,
			comment: true,
			attach: true,
			unlinkTicket: true
		});
		expect(screen.choices.states.length).toBeGreaterThan(0);
		expect(screen.choices.people.map((person) => person.id)).toContain(admin.personId);
		expect(screen.choices.projects.map((entry) => entry.id)).not.toContain(project.id);
	});

	it('lets a technician do everything too', async () => {
		const { technician, task } = await setup();

		const screen = await screenOf(technician, task.taskTag);

		expect(screen.may).toMatchObject({ edit: true, assign: true, unlinkTicket: true });
	});

	it('gives the assigned employee a read-only screen with empty pickers', async () => {
		const { employee, task } = await setup();

		const screen = await screenOf(employee, task.taskTag);

		expect(screen.may).toEqual(NO_ACTS);
		expect(screen.choices).toEqual({
			states: [],
			people: [],
			projects: [],
			milestones: [],
			parents: []
		});
		expect(screen.task.taskTag).toBe(task.taskTag);
	});

	it('answers not_found to an employee the task is not assigned to', async () => {
		const { unrelated, task } = await setup();

		expect(await taskScreen(unrelated, task.taskTag)).toEqual({ ok: false, error: 'not_found' });
	});

	it('answers not_found to a task that does not exist', async () => {
		const { admin } = await setup();

		expect(await taskScreen(admin, 'TSK-9999')).toEqual({ ok: false, error: 'not_found' });
	});

	it('answers not_found to a task of another organisation', async () => {
		const { task } = await setup();
		const elsewhere = await createOrganisation('Other', 'other');
		const other = await createViewer(elsewhere.id, 'admin', 'Olga Other');

		expect(await taskScreen(other, task.taskTag)).toEqual({ ok: false, error: 'not_found' });
	});
});

describe('the task screen, on an archived project', () => {
	it('closes every act but unlinking a ticket and loads no picker', async () => {
		const { technician, project, task } = await setup();
		await archiveProject(technician, project.id);

		const screen = await screenOf(technician, task.taskTag);

		expect(screen.may).toEqual({ ...NO_ACTS, unlinkTicket: true });
		expect(screen.choices).toEqual({
			states: [],
			people: [],
			projects: [],
			milestones: [],
			parents: []
		});
	});
});

describe('the task screen, on a members-only project', () => {
	async function closedSetup() {
		const base = await setup();
		const member = await createViewer(base.organisation.id, 'technician', 'Mia Member');
		const outsider = await createViewer(base.organisation.id, 'technician', 'Otto Outsider');
		await getDb()
			.update(projects)
			.set({ visibility: 'members' })
			.where(eq(projects.id, base.project.id));
		await getDb()
			.insert(projectMembers)
			.values(
				[base.technician, member].map((viewer) => ({
					projectId: base.project.id,
					personId: viewer.personId!,
					organisationId: base.organisation.id
				}))
			);
		return { ...base, member, outsider };
	}

	it('offers only the members in the assignee picker', async () => {
		const { technician, member, outsider, task } = await closedSetup();

		const screen = await screenOf(technician, task.taskTag);

		const ids = screen.choices.people.map((person) => person.id);
		expect(ids).toContain(member.personId);
		expect(ids).not.toContain(outsider.personId);
	});

	it('answers not_found to a technician who is not a member', async () => {
		const { outsider, task } = await closedSetup();

		expect(await taskScreen(outsider, task.taskTag)).toEqual({ ok: false, error: 'not_found' });
	});
});

describe('the task screen rail', () => {
	it('shows the assigned employee only the tickets they raised', async () => {
		const { employee, technician, organisation, task } = await setup();
		const queue = await createQueue(organisation.id);
		const mine = await createTicket(organisation.id, queue.id, employee.personId!, {
			subject: 'Moving my desk'
		});
		const colleague = await createViewer(organisation.id, 'employee', 'Colleague');
		const theirs = await createTicket(organisation.id, queue.id, colleague.personId!, {
			subject: 'Not yours'
		});
		await linkTicketToTask(technician, { ticketId: mine.id, taskId: task.id });
		await linkTicketToTask(technician, { ticketId: theirs.id, taskId: task.id });

		const { rail } = await screenOf(employee, task.taskTag);
		const { related, timeline } = await rail;

		expect(related.flatMap((group) => group.items.map((item) => item.ref.id))).toEqual([mine.id]);
		expect(Array.isArray(timeline)).toBe(true);
	});
});

describe('the task screen, milestones', () => {
	it("offers the milestones of the task's own project to whoever may set one", async () => {
		const { technician, project, organisation, task } = await setup();
		const other = await createProjectRow(organisation.id, { name: 'Elsewhere' });
		await createMilestoneRow(organisation.id, project.id, { name: 'Pilot' });
		await createMilestoneRow(organisation.id, other.id, { name: 'Foreign' });

		const screen = await screenOf(technician, task.taskTag);

		expect(screen.choices.milestones.map((entry) => entry.name)).toEqual(['Pilot']);
	});
});

describe('the task screen, subtasks (ADR 0055)', () => {
	it('lists a parent’s subtasks, offers adding one, and shows time with subtasks', async () => {
		const { technician, admin, project, organisation, states, task } = await setup();
		const child = await createTaskRow(organisation.id, project.id, states.started.id, {
			title: 'Child',
			parentTaskId: task.id,
			dueDate: '2026-12-01'
		});
		await setTimeTracking(admin, true);
		const clock = { now: new Date('2026-10-25T12:00:00Z') };
		const when = { workDate: '2026-10-20' };
		await logTime(technician, { taskId: task.id }, { minutes: 30, ...when }, clock);
		await logTime(technician, { taskId: child.id }, { minutes: 60, ...when }, clock);

		const screen = await screenOf(technician, task.taskTag);

		expect(screen.subtasks).toEqual([
			{
				taskTag: child.taskTag,
				title: 'Child',
				stateName: states.started.name,
				stateGroup: 'started',
				assignees: [],
				dueDate: '2026-12-01'
			}
		]);
		expect(screen.may).toMatchObject({ addSubtask: true, setParent: false });
		expect(screen.time?.totalMinutes).toBe(30);
		expect(screen.timeWithSubtasks).toBe(90);
	});

	it('gives a subtask its parent’s due date, no Add subtask, and the eligible parents', async () => {
		const { technician, project, organisation, states, task } = await setup();
		await getDb().update(tasks).set({ dueDate: '2026-11-15' }).where(eq(tasks.id, task.id));
		const child = await createTaskRow(organisation.id, project.id, states.unstarted.id, {
			title: 'Child',
			parentTaskId: task.id
		});
		const other = await createTaskRow(organisation.id, project.id, states.unstarted.id, {
			title: 'Other'
		});
		await createTaskRow(organisation.id, project.id, states.completed.id, { title: 'Closed' });
		await createTaskRow(organisation.id, project.id, states.unstarted.id, {
			title: 'Sibling',
			parentTaskId: other.id
		});

		const screen = await screenOf(technician, child.taskTag);

		expect(screen.parentDueDate).toBe('2026-11-15');
		expect(screen.may).toMatchObject({ addSubtask: false, setParent: true });
		expect(screen.choices.parents.map((entry) => entry.title).sort()).toEqual([
			'Other',
			'Pack the boxes'
		]);
		expect(screen.timeWithSubtasks).toBeNull();
	});

	it('offers no Add subtask on a closed task, which admits no open subtask', async () => {
		const { technician, states, task } = await setup();
		await getDb().update(tasks).set({ stateId: states.completed.id }).where(eq(tasks.id, task.id));

		const screen = await screenOf(technician, task.taskTag);

		expect(screen.may).toMatchObject({ addSubtask: false, setParent: true });
	});
});
