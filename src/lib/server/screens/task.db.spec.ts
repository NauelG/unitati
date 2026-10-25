import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { createOrganisation, createViewer } from '../assets/testing/fixtures';
import { getDb } from '../db';
import { linkTicketToTask } from '../links';
import { archiveProject } from '../projects';
import { projectMembers, projects } from '../projects/schema';
import {
	assignRow,
	createProjectRow,
	createTaskRow,
	createWorkspace,
	statesByGroup
} from '../projects/testing/fixtures';
import { createQueue, createTicket } from '../service-desk/testing/fixtures';
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
		expect(screen.choices).toEqual({ states: [], people: [], projects: [] });
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
		expect(screen.choices).toEqual({ states: [], people: [], projects: [] });
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
