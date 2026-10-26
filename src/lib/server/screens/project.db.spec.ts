import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { createOrganisation, createViewer } from '../assets/testing/fixtures';
import { getDb } from '../db';
import { linkTicketToProject, linkTicketToTask } from '../links';
import { archiveProject } from '../projects';
import { projectMembers, projects } from '../projects/schema';
import {
	assignRow,
	createProjectRow,
	createTaskRow,
	createWorkspace,
	statesByGroup
} from '../projects/testing/fixtures';
import { changeTicketStatus } from '../service-desk';
import { createQueue, createTicket } from '../service-desk/testing/fixtures';
import { projectScreen } from './project';

async function setup(overrides: Parameters<typeof createProjectRow>[1] = {}) {
	const workspace = await createWorkspace();
	const project = await createProjectRow(workspace.organisation.id, overrides);
	const unrelated = await createViewer(workspace.organisation.id, 'employee', 'Una Unrelated');
	return { ...workspace, project, unrelated };
}

async function screenOf(viewer: Parameters<typeof projectScreen>[0], tag: string) {
	const outcome = await projectScreen(viewer, tag);
	if (!outcome.ok) throw new Error(`expected a screen, got ${outcome.error}`);
	return outcome.value;
}

const NO_ACTS = {
	edit: false,
	createTask: false,
	moveTask: false,
	comment: false,
	attach: false,
	documentPage: false,
	editMembers: false,
	archive: false,
	unarchive: false,
	undocumentPage: false,
	unlinkTicket: false,
	// Time tracking is off in this scene: nothing to follow into `/time` (see `time.db.spec.ts`).
	openTimeReport: false
};

describe('the project screen, per role', () => {
	it('lets an administrator do everything a live project allows', async () => {
		const { admin, project } = await setup();

		const screen = await screenOf(admin, project.projectTag);

		expect(screen.may).toEqual({
			...NO_ACTS,
			edit: true,
			createTask: true,
			moveTask: true,
			comment: true,
			attach: true,
			documentPage: true,
			editMembers: true,
			archive: true,
			undocumentPage: true,
			unlinkTicket: true
		});
		expect(screen.scope).toBe('all');
		expect(screen.choices.people.map((person) => person.id)).toContain(admin.personId);
		expect(screen.states).toHaveLength(5);
	});

	it('lets a technician do the same on a project they can see', async () => {
		const { technician, project } = await setup();

		const screen = await screenOf(technician, project.projectTag);

		expect(screen.may).toMatchObject({ edit: true, archive: true, unlinkTicket: true });
		expect(screen.may.unarchive).toBe(false);
	});

	it('gives the assigned employee a read-only screen with their own cards only', async () => {
		const { employee, project, organisation } = await setup();
		const states = await statesByGroup(organisation.id);
		const mine = await createTaskRow(organisation.id, project.id, states.started.id, {
			taskTag: 'M-1'
		});
		await createTaskRow(organisation.id, project.id, states.started.id, { taskTag: 'M-2' });
		await assignRow(organisation.id, mine.id, employee.personId!);

		const screen = await screenOf(employee, project.projectTag);

		expect(screen.may).toEqual(NO_ACTS);
		expect(screen.scope).toBe('assigned');
		expect(screen.choices).toEqual({ people: [], memberCandidates: [] });
		expect(screen.tasks.map((task) => task.id)).toEqual([mine.id]);
		expect(screen.states).toHaveLength(5);
	});

	it('answers not_found to an employee with no task in the project', async () => {
		const { unrelated, project } = await setup();

		expect(await projectScreen(unrelated, project.projectTag)).toEqual({
			ok: false,
			error: 'not_found'
		});
	});

	it('answers not_found to a project that does not exist or lives in another organisation', async () => {
		const { admin, project } = await setup();
		const elsewhere = await createOrganisation('Other', 'other');
		const other = await createViewer(elsewhere.id, 'admin', 'Olga Other');

		expect(await projectScreen(admin, 'NOPE')).toEqual({ ok: false, error: 'not_found' });
		expect(await projectScreen(other, project.projectTag)).toEqual({
			ok: false,
			error: 'not_found'
		});
	});
});

describe('the project screen, on an archived project', () => {
	it('keeps unarchiving, undocumenting and unlinking, and closes the writable acts', async () => {
		const { technician, project } = await setup();
		await archiveProject(technician, project.id);

		const screen = await screenOf(technician, project.projectTag);

		expect(screen.may).toEqual({
			...NO_ACTS,
			unarchive: true,
			undocumentPage: true,
			unlinkTicket: true
		});
		expect(screen.choices).toEqual({ people: [], memberCandidates: [] });
	});
});

describe('the project screen, on a members-only project', () => {
	async function closedSetup() {
		const owner = await createWorkspace();
		const project = await createProjectRow(owner.organisation.id, { visibility: 'members' });
		const member = await createViewer(owner.organisation.id, 'technician', 'Mia Member');
		const candidate = await createViewer(owner.organisation.id, 'technician', 'Cleo Candidate');
		await getDb()
			.insert(projectMembers)
			.values(
				[owner.technician, member].map((viewer) => ({
					projectId: project.id,
					personId: viewer.personId!,
					organisationId: owner.organisation.id
				}))
			);
		return { ...owner, project, member, candidate };
	}

	it('answers not_found to a technician who is not a member', async () => {
		const { candidate, project } = await closedSetup();

		expect(await projectScreen(candidate, project.projectTag)).toEqual({
			ok: false,
			error: 'not_found'
		});
	});

	it('lets an administrator edit the members and offers those who are not on the list', async () => {
		const { admin, member, candidate, project } = await closedSetup();

		const screen = await screenOf(admin, project.projectTag);

		expect(screen.may.editMembers).toBe(true);
		const offered = screen.choices.memberCandidates.map((person) => person.id);
		expect(offered).toContain(candidate.personId);
		expect(offered).not.toContain(member.personId);
	});

	it('refuses a member who is not the owner the membership, and offers no candidates', async () => {
		const { member, project } = await closedSetup();

		const screen = await screenOf(member, project.projectTag);

		expect(screen.may.editMembers).toBe(false);
		expect(screen.may.edit).toBe(true);
		expect(screen.choices.memberCandidates).toEqual([]);
	});

	it('lets the owner edit the members', async () => {
		const { member, project } = await closedSetup();
		await getDb()
			.update(projects)
			.set({ ownerPersonId: member.personId })
			.where(eq(projects.id, project.id));

		const screen = await screenOf(member, project.projectTag);

		expect(screen.may.editMembers).toBe(true);
	});
});

describe('the tickets behind a project screen', () => {
	async function scene() {
		const base = await setup();
		const { organisation, employee, project } = base;
		const queue = await createQueue(organisation.id);
		const states = await statesByGroup(organisation.id);
		const task = await createTaskRow(organisation.id, project.id, states.started.id);
		const make = (subject: string) =>
			createTicket(organisation.id, queue.id, employee.personId!, { subject });
		return { ...base, task, make };
	}

	it('counts open tickets once, direct plus via tasks, leaving resolved and closed out', async () => {
		const { technician, project, task, make } = await scene();
		const both = await make('Reaches the task twice');
		const direct = await make('Direct');
		const done = await make('Done');
		await linkTicketToTask(technician, { ticketId: both.id, taskId: task.id });
		await linkTicketToProject(technician, { ticketId: both.id, projectId: project.id });
		await linkTicketToProject(technician, { ticketId: direct.id, projectId: project.id });
		await linkTicketToProject(technician, { ticketId: done.id, projectId: project.id });
		await changeTicketStatus(technician, done.ticketTag, 'in_progress');
		await changeTicketStatus(technician, done.ticketTag, 'resolved');

		const screen = await screenOf(technician, project.projectTag);

		expect(screen.openTickets).toBe(2);
	});

	it('keeps the live ticket entries of the timeline to the direct links', async () => {
		const { technician, project, task, make } = await scene();
		const direct = await make('Direct');
		const via = await make('Via a task');
		await linkTicketToProject(technician, { ticketId: direct.id, projectId: project.id });
		await linkTicketToTask(technician, { ticketId: via.id, taskId: task.id });

		const screen = await screenOf(technician, project.projectTag);
		const tickets = (await screen.timeline).filter((item) => item.kind === 'ticket');

		expect(tickets.map((item) => item.record?.tag)).toEqual([direct.ticketTag]);
	});
});
