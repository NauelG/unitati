import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { getDb } from '../db';
import { listActivity } from '../activity';
import { projects, tasks } from '../projects/schema';
import {
	createProjectRow,
	createTaskRow,
	createWorkspace,
	statesByGroup
} from '../projects/testing/fixtures';
import { tickets } from '../service-desk/schema';
import { createQueue, createTicket } from '../service-desk/testing/fixtures';
import { escalateTicket, ticketProject, ticketTask } from './index';

/**
 * One function, four targets (#149). Whatever the target, the ticket row stays
 * exactly as it was: escalating is relating, not resolving.
 */

async function scene(status: typeof tickets.$inferInsert.status = 'new') {
	const base = await createWorkspace();
	const { organisation, employee } = base;
	const queue = await createQueue(organisation.id);
	const ticket = await createTicket(organisation.id, queue.id, employee.personId!, { status });
	const states = await statesByGroup(organisation.id);
	const project = await createProjectRow(organisation.id, { projectTag: 'PRJ-0001', name: 'Move' });
	const task = await createTaskRow(organisation.id, project.id, states.unstarted.id, {
		taskTag: 'TSK-0001',
		title: 'Book the van'
	});

	return { ...base, queue, ticket, states, project, task };
}

async function ticketRow(id: string) {
	const [row] = await getDb().select().from(tickets).where(eq(tickets.id, id));
	return row;
}

function verbsOn(organisationId: string, target: Parameters<typeof listActivity>[0]['target']) {
	return listActivity({ organisationId, target }).then((entries) => entries.map((e) => e.verb));
}

describe('escalateTicket', () => {
	it('links an existing task', async () => {
		const { organisation, technician, ticket, task } = await scene();

		const outcome = await escalateTicket(technician, ticket.id, {
			kind: 'existing_task',
			taskId: task.id
		});

		expect({
			outcome,
			links: (await getDb().select().from(ticketTask)).length,
			verbs: await verbsOn(organisation.id, { ticketId: ticket.id })
		}).toEqual({
			outcome: { ok: true, value: { kind: 'task', id: task.id, tag: 'TSK-0001' } },
			links: 1,
			verbs: ['link.task.added']
		});
	});

	it('links an existing project', async () => {
		const { organisation, technician, ticket, project } = await scene();

		const outcome = await escalateTicket(technician, ticket.id, {
			kind: 'existing_project',
			projectId: project.id
		});

		expect({
			outcome,
			links: (await getDb().select().from(ticketProject)).length,
			verbs: await verbsOn(organisation.id, { ticketId: ticket.id })
		}).toEqual({
			outcome: { ok: true, value: { kind: 'project', id: project.id, tag: 'PRJ-0001' } },
			links: 1,
			verbs: ['link.project.added']
		});
	});

	it('creates a task in the default state with no assignee, then links it', async () => {
		const { organisation, technician, ticket, project, states } = await scene();

		const outcome = await escalateTicket(technician, ticket.id, {
			kind: 'new_task',
			projectId: project.id,
			title: '  Replace the printer ',
			description: 'It eats pages.'
		});
		if (!outcome.ok) throw new Error(outcome.error);

		const [created] = await getDb().select().from(tasks).where(eq(tasks.id, outcome.value.id));
		expect({
			kind: outcome.value.kind,
			title: created.title,
			description: created.description,
			stateId: created.stateId,
			dueDate: created.dueDate,
			onTicket: await verbsOn(organisation.id, { ticketId: ticket.id }),
			onTask: await verbsOn(organisation.id, { taskId: created.id }),
			links: (await getDb().select().from(ticketTask)).map((link) => link.taskId)
		}).toEqual({
			kind: 'task',
			title: 'Replace the printer',
			description: 'It eats pages.',
			stateId: states.backlog.id,
			dueDate: null,
			onTicket: ['link.task.added'],
			onTask: ['task.created'],
			links: [created.id]
		});
	});

	it('creates a project with the given owner and no due date, then links it', async () => {
		const { organisation, technician, ticket } = await scene();

		const outcome = await escalateTicket(technician, ticket.id, {
			kind: 'new_project',
			name: 'Printer fleet',
			ownerPersonId: technician.personId
		});
		if (!outcome.ok) throw new Error(outcome.error);

		const [created] = await getDb()
			.select()
			.from(projects)
			.where(eq(projects.id, outcome.value.id));
		expect({
			kind: outcome.value.kind,
			tag: outcome.value.tag === created.projectTag,
			owner: created.ownerPersonId,
			dueDate: created.dueDate,
			onTicket: await verbsOn(organisation.id, { ticketId: ticket.id }),
			onProject: await verbsOn(organisation.id, { projectId: created.id })
		}).toEqual({
			kind: 'project',
			tag: true,
			owner: technician.personId,
			dueDate: null,
			onTicket: ['link.project.added'],
			onProject: ['project.created']
		});
	});

	it('escalating again to the same existing task is a success that writes nothing more', async () => {
		const { organisation, technician, ticket, task } = await scene();
		const target = { kind: 'existing_task', taskId: task.id } as const;

		await escalateTicket(technician, ticket.id, target);
		const second = await escalateTicket(technician, ticket.id, target);

		expect(second.ok).toBe(true);
		expect(await verbsOn(organisation.id, { ticketId: ticket.id })).toEqual(['link.task.added']);
	});

	it.each(['resolved', 'closed'] as const)('escalates a %s ticket', async (status) => {
		const { technician, ticket, project } = await scene(status);

		const outcome = await escalateTicket(technician, ticket.id, {
			kind: 'new_task',
			projectId: project.id,
			title: 'Follow-up',
			description: null
		});

		expect(outcome.ok).toBe(true);
	});

	it.each([
		[
			'existing_task',
			(s: Awaited<ReturnType<typeof scene>>) => ({
				kind: 'existing_task' as const,
				taskId: s.task.id
			})
		],
		[
			'existing_project',
			(s: Awaited<ReturnType<typeof scene>>) => ({
				kind: 'existing_project' as const,
				projectId: s.project.id
			})
		],
		[
			'new_task',
			(s: Awaited<ReturnType<typeof scene>>) => ({
				kind: 'new_task' as const,
				projectId: s.project.id,
				title: 'T',
				description: null
			})
		],
		['new_project', () => ({ kind: 'new_project' as const, name: 'P', ownerPersonId: null })]
	])('leaves the ticket row untouched on %s', async (_name, target) => {
		const s = await scene();
		const before = await ticketRow(s.ticket.id);

		await escalateTicket(s.technician, s.ticket.id, target(s));

		expect(await ticketRow(s.ticket.id)).toEqual(before);
	});

	it('lets a key without projects.manage link existing work but not create any', async () => {
		const { admin, ticket, task, project } = await scene();
		const narrowed = {
			...admin,
			scopes: ['tickets.manage', 'projects.view'] as ('tickets.manage' | 'projects.view')[]
		};

		const existing = await escalateTicket(narrowed, ticket.id, {
			kind: 'existing_task',
			taskId: task.id
		});
		const newTask = await escalateTicket(narrowed, ticket.id, {
			kind: 'new_task',
			projectId: project.id,
			title: 'Nope',
			description: null
		});
		const newProject = await escalateTicket(narrowed, ticket.id, {
			kind: 'new_project',
			name: 'Nope',
			ownerPersonId: null
		});

		expect([existing.ok, newTask, newProject]).toEqual([
			true,
			{ ok: false, error: 'forbidden_create' },
			{ ok: false, error: 'forbidden_create' }
		]);
		expect(await getDb().select().from(projects)).toHaveLength(1);
	});

	it('refuses without tickets.manage', async () => {
		const { employee, ticket, task } = await scene();

		expect(
			await escalateTicket(employee, ticket.id, { kind: 'existing_task', taskId: task.id })
		).toEqual({ ok: false, error: 'forbidden' });
	});

	it('reports a missing ticket', async () => {
		const { technician, task } = await scene();

		expect(
			await escalateTicket(technician, crypto.randomUUID(), {
				kind: 'existing_task',
				taskId: task.id
			})
		).toEqual({ ok: false, error: 'ticket_not_found' });
	});

	it('reports missing targets as missing', async () => {
		const { technician, ticket } = await scene();

		expect([
			await escalateTicket(technician, ticket.id, {
				kind: 'existing_task',
				taskId: crypto.randomUUID()
			}),
			await escalateTicket(technician, ticket.id, {
				kind: 'existing_project',
				projectId: crypto.randomUUID()
			}),
			await escalateTicket(technician, ticket.id, {
				kind: 'new_task',
				projectId: crypto.randomUUID(),
				title: 'T',
				description: null
			})
		]).toEqual([
			{ ok: false, error: 'task_not_found' },
			{ ok: false, error: 'project_not_found' },
			{ ok: false, error: 'project_not_found' }
		]);
	});

	it('refuses an archived project for every target kind that reaches it', async () => {
		const { technician, ticket, project, task } = await scene();
		await getDb()
			.update(projects)
			.set({ archivedAt: new Date() })
			.where(eq(projects.id, project.id));

		expect([
			await escalateTicket(technician, ticket.id, { kind: 'existing_task', taskId: task.id }),
			await escalateTicket(technician, ticket.id, {
				kind: 'existing_project',
				projectId: project.id
			}),
			await escalateTicket(technician, ticket.id, {
				kind: 'new_task',
				projectId: project.id,
				title: 'T',
				description: null
			})
		]).toEqual(Array(3).fill({ ok: false, error: 'project_archived' }));
	});

	it('rejects an empty title or name after trimming, writing nothing', async () => {
		const { technician, ticket, project } = await scene();

		const noTitle = await escalateTicket(technician, ticket.id, {
			kind: 'new_task',
			projectId: project.id,
			title: '   ',
			description: null
		});
		const noName = await escalateTicket(technician, ticket.id, {
			kind: 'new_project',
			name: ' ',
			ownerPersonId: null
		});

		expect([noTitle, noName]).toEqual([
			{ ok: false, error: 'invalid_input' },
			{ ok: false, error: 'invalid_input' }
		]);
		expect(await getDb().select().from(tasks)).toHaveLength(1);
		expect(await getDb().select().from(projects)).toHaveLength(1);
		expect(await getDb().select().from(ticketTask)).toHaveLength(0);
	});

	it('rejects an owner who is not in the organisation', async () => {
		const { technician, ticket } = await scene();

		const outcome = await escalateTicket(technician, ticket.id, {
			kind: 'new_project',
			name: 'P',
			ownerPersonId: crypto.randomUUID()
		});

		expect(outcome).toEqual({ ok: false, error: 'invalid_input' });
	});

	it('creates nothing when the new record could not then be linked', async () => {
		const { admin, ticket, project } = await scene();
		// Can create, cannot read: the freshly made task is out of the actor's scope.
		const blind = {
			...admin,
			scopes: ['tickets.manage', 'projects.manage'] as ('tickets.manage' | 'projects.manage')[]
		};

		const outcome = await escalateTicket(blind, ticket.id, {
			kind: 'new_task',
			projectId: project.id,
			title: 'Ghost',
			description: null
		});

		expect(outcome.ok).toBe(false);
		expect(await getDb().select().from(tasks)).toHaveLength(1);
		expect(await getDb().select().from(ticketTask)).toHaveLength(0);
	});
});
