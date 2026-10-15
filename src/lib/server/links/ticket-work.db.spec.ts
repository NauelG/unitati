import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { getDb } from '../db';
import { createOrganisation, createPerson } from '../assets/testing/fixtures';
import { ensureDefaultStates } from '../projects/defaults';
import { refusalFrom } from '../db/testing/refusal';
import { listActivity } from '../activity';
import { createQueue, createTicket } from '../service-desk/testing/fixtures';
import { tickets } from '../service-desk/schema';
import { projects, tasks } from '../projects/schema';
import {
	createProjectRow,
	createTaskRow,
	createWorkspace,
	statesByGroup
} from '../projects/testing/fixtures';
import {
	linkProject,
	linkTask,
	linkTicketToProject,
	linkTicketToTask,
	ticketProject,
	ticketTask,
	unlinkProject,
	unlinkTask
} from './index';

/**
 * The ticket → work relations at the module's public surface (#149). The ticket
 * is the only record that ever changes: no spec here asserts anything about a
 * task or a project that a link could have touched, because it cannot.
 */

async function scene() {
	const base = await createWorkspace();
	const { organisation, employee } = base;
	const queue = await createQueue(organisation.id);
	const ticket = await createTicket(organisation.id, queue.id, employee.personId!);
	const states = await statesByGroup(organisation.id);
	const project = await createProjectRow(organisation.id, { projectTag: 'PRJ-0001', name: 'Move' });
	const task = await createTaskRow(organisation.id, project.id, states.unstarted.id, {
		taskTag: 'TSK-0001',
		title: 'Book the van'
	});

	return { ...base, queue, ticket, states, project, task };
}

/** A second organisation with its own ticket, project and task. */
async function foreignScene() {
	const organisation = await createOrganisation('Other', 'other');
	await ensureDefaultStates(getDb(), organisation.id);
	const queue = await createQueue(organisation.id);
	const requester = await createPerson(organisation.id, 'Olga Other');
	const ticket = await createTicket(organisation.id, queue.id, requester.id);
	const states = await statesByGroup(organisation.id);
	const project = await createProjectRow(organisation.id, { projectTag: 'PRJ-0001' });
	const task = await createTaskRow(organisation.id, project.id, states.unstarted.id, {
		taskTag: 'TSK-0001'
	});

	return { ticket, project, task };
}

async function ticketRow(id: string) {
	const [row] = await getDb().select().from(tickets).where(eq(tickets.id, id));
	return row;
}

describe('ticket_task and ticket_project constraints', () => {
	it('refuse a link to a task that does not exist', async () => {
		const { organisation, ticket } = await scene();

		const refusal = await refusalFrom(
			getDb().insert(ticketTask).values({
				organisationId: organisation.id,
				ticketId: ticket.id,
				taskId: crypto.randomUUID()
			})
		);

		expect(refusal).toMatchObject({ constraint: 'ticket_task_task_id_tasks_id_fk' });
	});

	it('refuse a link to a project that does not exist', async () => {
		const { organisation, ticket } = await scene();

		const refusal = await refusalFrom(
			getDb().insert(ticketProject).values({
				organisationId: organisation.id,
				ticketId: ticket.id,
				projectId: crypto.randomUUID()
			})
		);

		expect(refusal).toMatchObject({ constraint: 'ticket_project_project_id_projects_id_fk' });
	});

	it('refuse the same pair twice', async () => {
		const { organisation, ticket, task, project } = await scene();
		const db = getDb();
		await db.insert(ticketTask).values({
			organisationId: organisation.id,
			ticketId: ticket.id,
			taskId: task.id
		});
		await db.insert(ticketProject).values({
			organisationId: organisation.id,
			ticketId: ticket.id,
			projectId: project.id
		});

		const again = await refusalFrom(
			db.insert(ticketTask).values({
				organisationId: organisation.id,
				ticketId: ticket.id,
				taskId: task.id
			})
		);
		const againProject = await refusalFrom(
			db.insert(ticketProject).values({
				organisationId: organisation.id,
				ticketId: ticket.id,
				projectId: project.id
			})
		);

		expect([again, againProject]).toMatchObject([
			{ constraint: 'ticket_task_pair' },
			{ constraint: 'ticket_project_pair' }
		]);
	});
});

describe('linkTicketToTask', () => {
	it('links, attributes the link and records it against the ticket with a snapshot', async () => {
		const { organisation, technician, ticket, task } = await scene();

		const outcome = await linkTicketToTask(technician, { ticketId: ticket.id, taskId: task.id });

		const [link] = await getDb().select().from(ticketTask);
		const onTicket = await listActivity({
			organisationId: organisation.id,
			target: { ticketId: ticket.id }
		});
		const onTask = await listActivity({
			organisationId: organisation.id,
			target: { taskId: task.id }
		});

		expect({
			outcome,
			createdBy: link.createdByPersonId,
			verbs: onTicket.map((entry) => entry.verb),
			payload: onTicket[0]?.payload,
			taskVerbs: onTask.map((entry) => entry.verb)
		}).toEqual({
			outcome: { ok: true, value: { created: true } },
			createdBy: technician.personId,
			verbs: ['link.task.added'],
			payload: { taskId: task.id, taskTag: 'TSK-0001', taskTitle: 'Book the van' },
			taskVerbs: []
		});
	});

	it('is idempotent: the second call succeeds and writes neither a row nor an entry', async () => {
		const { organisation, technician, ticket, task } = await scene();
		const pair = { ticketId: ticket.id, taskId: task.id };

		await linkTicketToTask(technician, pair);
		const second = await linkTicketToTask(technician, pair);

		const links = await getDb().select().from(ticketTask);
		const history = await listActivity({
			organisationId: organisation.id,
			target: { ticketId: ticket.id }
		});

		expect({ second, links: links.length, entries: history.length }).toEqual({
			second: { ok: true, value: { created: false } },
			links: 1,
			entries: 1
		});
	});

	it('needs tickets.manage', async () => {
		const { employee, ticket, task } = await scene();

		const outcome = await linkTicketToTask(employee, { ticketId: ticket.id, taskId: task.id });

		expect(outcome).toEqual({ ok: false, error: 'forbidden' });
		expect(await getDb().select().from(ticketTask)).toHaveLength(0);
	});

	it('reports a ticket of another organisation as not found', async () => {
		const { technician, task } = await scene();
		const other = await foreignScene();

		const outcome = await linkTicketToTask(technician, {
			ticketId: other.ticket.id,
			taskId: task.id
		});

		expect(outcome).toEqual({ ok: false, error: 'ticket_not_found' });
	});

	it('reports a task of another organisation as missing, not forbidden', async () => {
		const { technician, ticket } = await scene();
		const other = await foreignScene();

		const outcome = await linkTicketToTask(technician, {
			ticketId: ticket.id,
			taskId: other.task.id
		});

		expect(outcome).toEqual({ ok: false, error: 'task_not_found' });
	});

	it('refuses a task of an archived project', async () => {
		const { technician, ticket, project, task } = await scene();
		await getDb()
			.update(projects)
			.set({ archivedAt: new Date() })
			.where(eq(projects.id, project.id));

		const outcome = await linkTicketToTask(technician, { ticketId: ticket.id, taskId: task.id });

		expect(outcome).toEqual({ ok: false, error: 'project_archived' });
		expect(await getDb().select().from(ticketTask)).toHaveLength(0);
	});

	it('does not touch the ticket row', async () => {
		const { technician, ticket, task } = await scene();
		const before = await ticketRow(ticket.id);

		await linkTicketToTask(technician, { ticketId: ticket.id, taskId: task.id });

		expect(await ticketRow(ticket.id)).toEqual(before);
	});
});

describe('a target the actor cannot read', () => {
	it('an actor with no project-read permission at all sees every project as missing', async () => {
		const { technician, ticket, project } = await scene();
		const blind = { ...technician, scopes: ['tickets.manage'] as const };

		const outcome = await linkTicketToProject(blind, {
			ticketId: ticket.id,
			projectId: project.id
		});

		expect(outcome).toEqual({ ok: false, error: 'project_not_found' });
	});
});

describe('linkTicketToProject', () => {
	it('links and records the snapshot on the ticket', async () => {
		const { organisation, technician, ticket, project } = await scene();

		const outcome = await linkTicketToProject(technician, {
			ticketId: ticket.id,
			projectId: project.id
		});
		const onTicket = await listActivity({
			organisationId: organisation.id,
			target: { ticketId: ticket.id }
		});

		expect({ outcome, verbs: onTicket.map((e) => e.verb), payload: onTicket[0]?.payload }).toEqual({
			outcome: { ok: true, value: { created: true } },
			verbs: ['link.project.added'],
			payload: { projectId: project.id, projectTag: 'PRJ-0001', projectName: 'Move' }
		});
	});

	it('is idempotent', async () => {
		const { technician, ticket, project } = await scene();
		const pair = { ticketId: ticket.id, projectId: project.id };

		await linkTicketToProject(technician, pair);
		const second = await linkTicketToProject(technician, pair);

		expect(second).toEqual({ ok: true, value: { created: false } });
		expect(await getDb().select().from(ticketProject)).toHaveLength(1);
	});

	it('refuses an archived project', async () => {
		const { technician, ticket, project } = await scene();
		await getDb()
			.update(projects)
			.set({ archivedAt: new Date() })
			.where(eq(projects.id, project.id));

		const outcome = await linkTicketToProject(technician, {
			ticketId: ticket.id,
			projectId: project.id
		});

		expect(outcome).toEqual({ ok: false, error: 'project_archived' });
	});

	it('does not touch the ticket row', async () => {
		const { technician, ticket, project } = await scene();
		const before = await ticketRow(ticket.id);

		await linkTicketToProject(technician, { ticketId: ticket.id, projectId: project.id });

		expect(await ticketRow(ticket.id)).toEqual(before);
	});
});

describe('the transactional cores', () => {
	it('roll back with the caller: a link is not committed without its transaction', async () => {
		const { technician, ticket, task, project } = await scene();

		await getDb()
			.transaction(async (tx) => {
				await linkTask(tx, technician, { ticketId: ticket.id, taskId: task.id });
				await linkProject(tx, technician, { ticketId: ticket.id, projectId: project.id });
				throw new Error('abort');
			})
			.catch(() => undefined);

		expect(await getDb().select().from(ticketTask)).toHaveLength(0);
		expect(await getDb().select().from(ticketProject)).toHaveLength(0);
	});
});

describe('unlinking', () => {
	it('removes the link and records the snapshot taken before the row went', async () => {
		const { organisation, technician, ticket, task } = await scene();
		const pair = { ticketId: ticket.id, taskId: task.id };
		await linkTicketToTask(technician, pair);

		const outcome = await unlinkTask(technician, pair);

		const history = await listActivity({
			organisationId: organisation.id,
			target: { ticketId: ticket.id }
		});
		expect({
			outcome,
			links: (await getDb().select().from(ticketTask)).length,
			verbs: history.map((e) => e.verb).sort()
		}).toEqual({
			outcome: { ok: true, value: undefined },
			links: 0,
			verbs: ['link.task.added', 'link.task.removed']
		});
	});

	it('reports link_not_found when the pair does not exist', async () => {
		const { technician, ticket, task, project } = await scene();

		expect(await unlinkTask(technician, { ticketId: ticket.id, taskId: task.id })).toEqual({
			ok: false,
			error: 'link_not_found'
		});
		expect(await unlinkProject(technician, { ticketId: ticket.id, projectId: project.id })).toEqual(
			{ ok: false, error: 'link_not_found' }
		);
	});

	it('needs tickets.manage', async () => {
		const { employee, ticket, task } = await scene();

		expect(await unlinkTask(employee, { ticketId: ticket.id, taskId: task.id })).toEqual({
			ok: false,
			error: 'forbidden'
		});
	});

	it('works on an archived project: the link belongs to links', async () => {
		const { technician, ticket, project, task } = await scene();
		await linkTicketToTask(technician, { ticketId: ticket.id, taskId: task.id });
		await linkTicketToProject(technician, { ticketId: ticket.id, projectId: project.id });
		await getDb()
			.update(projects)
			.set({ archivedAt: new Date() })
			.where(eq(projects.id, project.id));

		const task_ = await unlinkTask(technician, { ticketId: ticket.id, taskId: task.id });
		const project_ = await unlinkProject(technician, {
			ticketId: ticket.id,
			projectId: project.id
		});

		expect([task_.ok, project_.ok]).toEqual([true, true]);
	});

	it('leaves past entries unchanged when the task is renamed afterwards', async () => {
		const { organisation, technician, ticket, task } = await scene();
		await linkTicketToTask(technician, { ticketId: ticket.id, taskId: task.id });

		await getDb().update(tasks).set({ title: 'Book the lorry' }).where(eq(tasks.id, task.id));

		const [entry] = await listActivity({
			organisationId: organisation.id,
			target: { ticketId: ticket.id }
		});
		expect(entry.payload).toMatchObject({ taskTitle: 'Book the van' });
	});

	it('does not touch the ticket row', async () => {
		const { technician, ticket, task } = await scene();
		await linkTicketToTask(technician, { ticketId: ticket.id, taskId: task.id });
		const before = await ticketRow(ticket.id);

		await unlinkTask(technician, { ticketId: ticket.id, taskId: task.id });

		expect(await ticketRow(ticket.id)).toEqual(before);
	});
});
