import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { createViewer } from '../assets/testing/fixtures';
import { listActivity } from '../activity';
import { getDb } from '../db';
import { ticketProject, ticketTask } from '../links';
import { projects, tasks } from '../projects/schema';
import {
	createProjectRow,
	createTaskRow,
	createWorkspace,
	statesByGroup
} from '../projects/testing/fixtures';
import { createQueue, createTicket } from '../service-desk/testing/fixtures';
import { authenticateRequest } from './authenticate-request';
import { handleApiRequest } from './dispatch';
import { createApiKey } from './keys';
import type { ApiPrincipal } from './keys';

/**
 * Turning a ticket into work over HTTP (#153): a real `Request` through the
 * dispatcher against a real database, asserted as a `curl` would see it.
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
	return {
		...base,
		queue,
		ticket,
		states,
		project,
		task,
		base: `/api/v1/tickets/${ticket.ticketTag}`
	};
}

async function keyFor(
	actor: Awaited<ReturnType<typeof scene>>['technician'],
	scopes: Parameters<typeof createApiKey>[1]['scopes']
) {
	const issued = await createApiKey(actor, {
		name: crypto.randomUUID(),
		scopes,
		expiresInDays: 90
	});
	if (!issued.ok) throw new Error(issued.error);
	return issued.value.key;
}

async function respond(response: Response) {
	const text = await response.text();
	return { response, body: text ? JSON.parse(text) : null };
}

async function send(method: string, path: string, key: string, body?: Record<string, unknown>) {
	const request = new Request(`http://localhost${path}`, {
		method,
		headers: {
			authorization: `Bearer ${key}`,
			...(body ? { 'content-type': 'application/json' } : {})
		},
		body: body ? JSON.stringify(body) : undefined
	});
	const locals = { ...(await authenticateRequest(request)) } as unknown as App.Locals;
	return respond(await handleApiRequest({ request, locals }));
}

/** An employee cannot own a key, so the principal is built by hand. */
async function sendAs(principal: ApiPrincipal, method: string, path: string) {
	const request = new Request(`http://localhost${path}`, { method });
	const locals = {
		user: principal,
		api: { ok: true, keyId: principal.keyId }
	} as unknown as App.Locals;
	return respond(await handleApiRequest({ request, locals }));
}

const MANAGE = ['tickets.manage', 'projects.manage'] as const;

describe('POST /api/v1/tickets/{tag}/escalations', () => {
	it('links an existing task with 201, then answers 200 and writes nothing the second time', async () => {
		const s = await scene();
		const key = await keyFor(s.technician, [...MANAGE]);
		const path = `${s.base}/escalations`;
		const body = { target: 'existing_task', taskTag: 'TSK-0001' };

		const first = await send('POST', path, key, body);
		expect(first.response.status).toBe(201);
		expect(first.body).toEqual({
			data: { kind: 'task', tag: 'TSK-0001', href: '/tasks/TSK-0001' }
		});

		const again = await send('POST', path, key, body);
		expect(again.response.status).toBe(200);
		expect(again.body).toEqual(first.body);

		expect(await getDb().select().from(ticketTask)).toHaveLength(1);
		const history = await listActivity({
			organisationId: s.organisation.id,
			target: { ticketId: s.ticket.id }
		});
		expect(history.filter((entry) => entry.verb === 'link.task.added')).toHaveLength(1);
	});

	it('links an existing project', async () => {
		const s = await scene();
		const key = await keyFor(s.technician, [...MANAGE]);

		const { response, body } = await send('POST', `${s.base}/escalations`, key, {
			target: 'existing_project',
			projectTag: 'PRJ-0001'
		});

		expect(response.status).toBe(201);
		expect(body.data).toMatchObject({ kind: 'project', tag: 'PRJ-0001' });
		expect(await getDb().select().from(ticketProject)).toHaveLength(1);
	});

	it('creates a task in a project and links it', async () => {
		const s = await scene();
		const key = await keyFor(s.technician, [...MANAGE]);

		const { response, body } = await send('POST', `${s.base}/escalations`, key, {
			target: 'new_task',
			projectTag: 'PRJ-0001',
			title: 'Replace the printer',
			description: 'It jams.'
		});

		expect(response.status).toBe(201);
		expect(body.data.kind).toBe('task');
		const [created] = await getDb().select().from(tasks).where(eq(tasks.taskTag, body.data.tag));
		expect(created).toMatchObject({ title: 'Replace the printer', description: 'It jams.' });
		expect(await getDb().select().from(ticketTask)).toHaveLength(1);
	});

	it('creates a project and links it', async () => {
		const s = await scene();
		const key = await keyFor(s.technician, [...MANAGE]);

		const { response, body } = await send('POST', `${s.base}/escalations`, key, {
			target: 'new_project',
			name: 'Printer fleet',
			ownerPersonId: s.technician.personId
		});

		expect(response.status).toBe(201);
		expect(body.data.kind).toBe('project');
		const [created] = await getDb()
			.select()
			.from(projects)
			.where(eq(projects.projectTag, body.data.tag));
		expect(created).toMatchObject({ name: 'Printer fleet', ownerPersonId: s.technician.personId });
	});

	it('lets a key without projects.manage relate existing work and answers 403 to creating it', async () => {
		const s = await scene();
		const key = await keyFor(s.technician, ['tickets.manage']);
		const path = `${s.base}/escalations`;

		const existing = await send('POST', path, key, {
			target: 'existing_task',
			taskTag: 'TSK-0001'
		});
		expect(existing.response.status).toBe(201);

		const created = await send('POST', path, key, {
			target: 'new_task',
			projectTag: 'PRJ-0001',
			title: 'Nope'
		});
		expect(created.response.status).toBe(403);
		expect(created.body.error.code).toBe('forbidden_create');

		const project = await send('POST', path, key, { target: 'new_project', name: 'Nope' });
		expect(project.response.status).toBe(403);
	});

	it('answers 409 to an archived target', async () => {
		const s = await scene();
		const key = await keyFor(s.technician, [...MANAGE]);
		await getDb()
			.update(projects)
			.set({ archivedAt: new Date() })
			.where(eq(projects.id, s.project.id));

		const task = await send('POST', `${s.base}/escalations`, key, {
			target: 'existing_task',
			taskTag: 'TSK-0001'
		});
		const project = await send('POST', `${s.base}/escalations`, key, {
			target: 'existing_project',
			projectTag: 'PRJ-0001'
		});

		expect(task.response.status).toBe(409);
		expect(task.body.error.code).toBe('project_archived');
		expect(project.response.status).toBe(409);
	});

	it('answers 404 to an unknown ticket, task or project tag', async () => {
		const s = await scene();
		const key = await keyFor(s.technician, [...MANAGE]);

		const ticket = await send('POST', '/api/v1/tickets/TCK-9999/escalations', key, {
			target: 'existing_task',
			taskTag: 'TSK-0001'
		});
		const task = await send('POST', `${s.base}/escalations`, key, {
			target: 'existing_task',
			taskTag: 'TSK-9999'
		});
		const project = await send('POST', `${s.base}/escalations`, key, {
			target: 'new_task',
			projectTag: 'PRJ-9999',
			title: 'x'
		});

		expect([ticket, task, project].map((r) => r.response.status)).toEqual([404, 404, 404]);
	});

	it('answers 422 to an empty title and 400 to an unknown target', async () => {
		const s = await scene();
		const key = await keyFor(s.technician, [...MANAGE]);

		const empty = await send('POST', `${s.base}/escalations`, key, {
			target: 'new_task',
			projectTag: 'PRJ-0001',
			title: '   '
		});
		expect(empty.response.status).toBe(422);
		expect(empty.body.error.code).toBe('invalid_input');

		const unknown = await send('POST', `${s.base}/escalations`, key, { target: 'nowhere' });
		expect(unknown.response.status).toBe(400);
		expect(await getDb().select().from(ticketTask)).toHaveLength(0);
	});

	it('answers 404 to a key without tickets.manage', async () => {
		const s = await scene();
		const key = await keyFor(s.technician, ['tickets.view', 'projects.manage']);

		const { response } = await send('POST', `${s.base}/escalations`, key, {
			target: 'existing_task',
			taskTag: 'TSK-0001'
		});

		expect(response.status).toBe(404);
	});
});

describe('unlinking a ticket from work', () => {
	it('unlinks a task and a project with 204, then answers 404', async () => {
		const s = await scene();
		const key = await keyFor(s.technician, [...MANAGE]);
		await send('POST', `${s.base}/escalations`, key, {
			target: 'existing_task',
			taskTag: 'TSK-0001'
		});
		await send('POST', `${s.base}/escalations`, key, {
			target: 'existing_project',
			projectTag: 'PRJ-0001'
		});

		for (const path of [`${s.base}/tasks/TSK-0001`, `${s.base}/projects/PRJ-0001`]) {
			const removed = await send('DELETE', path, key);
			expect(removed.response.status, path).toBe(204);
			expect(removed.body).toBeNull();

			const repeat = await send('DELETE', path, key);
			expect(repeat.response.status, path).toBe(404);
		}

		expect(await getDb().select().from(ticketTask)).toHaveLength(0);
		expect(await getDb().select().from(ticketProject)).toHaveLength(0);
	});

	it('answers 404 to a key without tickets.manage and leaves the link', async () => {
		const s = await scene();
		const manage = await keyFor(s.technician, [...MANAGE]);
		const viewOnly = await keyFor(s.technician, ['tickets.view', 'projects.view']);
		await send('POST', `${s.base}/escalations`, manage, {
			target: 'existing_task',
			taskTag: 'TSK-0001'
		});

		const { response } = await send('DELETE', `${s.base}/tasks/TSK-0001`, viewOnly);

		expect(response.status).toBe(404);
		expect(await getDb().select().from(ticketTask)).toHaveLength(1);
	});
});

describe('reading the work of a ticket and the tickets of work', () => {
	async function escalated() {
		const s = await scene();
		const manage = await keyFor(s.technician, [...MANAGE]);
		await send('POST', `${s.base}/escalations`, manage, {
			target: 'existing_task',
			taskTag: 'TSK-0001'
		});
		await send('POST', `${s.base}/escalations`, manage, {
			target: 'existing_project',
			projectTag: 'PRJ-0001'
		});
		const read = await keyFor(s.technician, ['tickets.view', 'projects.view']);
		return { ...s, read };
	}

	it('lists the tasks and projects a ticket was escalated to', async () => {
		const s = await escalated();

		const { response, body } = await send('GET', `${s.base}/work`, s.read);

		expect(response.status).toBe(200);
		expect(
			body.data.map((group: { relation: string; items: { tag: string; href: string }[] }) => [
				group.relation,
				group.items.map((item) => [item.tag, item.href])
			])
		).toEqual([
			['resolved_in', [['TSK-0001', '/tasks/TSK-0001']]],
			['handled_in', [['PRJ-0001', '/projects/PRJ-0001']]]
		]);
		expect(body.data[0].items[0]).toMatchObject({
			kind: 'task',
			status: { group: 'unstarted' }
		});
	});

	it('answers a key scoped to ticket reads only, with the same groups', async () => {
		const s = await escalated();
		const ticketsOnly = await keyFor(s.technician, ['tickets.view']);

		const { response, body } = await send('GET', `${s.base}/work`, ticketsOnly);

		expect(response.status).toBe(200);
		expect(body.data.map((group: { relation: string }) => group.relation)).toEqual([
			'resolved_in',
			'handled_in'
		]);
	});

	it('lists the tickets of a task and of a project', async () => {
		const s = await escalated();

		const task = await send('GET', '/api/v1/tasks/TSK-0001/tickets', s.read);
		const project = await send('GET', '/api/v1/projects/PRJ-0001/tickets', s.read);

		expect(task.response.status).toBe(200);
		expect(task.body.data).toMatchObject([
			{ relation: 'resolves', items: [{ tag: s.ticket.ticketTag, kind: 'ticket' }] }
		]);
		expect(project.body.data).toMatchObject([
			{ relation: 'handles', items: [{ tag: s.ticket.ticketTag }] },
			{
				relation: 'resolves_via_tasks',
				items: [{ tag: s.ticket.ticketTag, via: { tag: 'TSK-0001' } }]
			}
		]);

		const missing = await send('GET', '/api/v1/tasks/TSK-9999/tickets', s.read);
		expect(missing.response.status).toBe(404);
	});

	it('shows a requester their own ticket’s work outside their scope as a count only, and nobody else’s', async () => {
		const s = await escalated();
		const employee = await createViewer(s.organisation.id, 'employee', 'Eve Employee');
		const principal: ApiPrincipal = {
			...employee,
			scopes: ['tickets.view.own'],
			keyId: crypto.randomUUID()
		};
		const mine = await createTicket(s.organisation.id, s.queue.id, employee.personId!);
		const manage = await keyFor(s.technician, [...MANAGE]);
		await send('POST', `/api/v1/tickets/${mine.ticketTag}/escalations`, manage, {
			target: 'existing_task',
			taskTag: 'TSK-0001'
		});

		const own = await sendAs(principal, 'GET', `/api/v1/tickets/${mine.ticketTag}/work`);
		expect(own.response.status).toBe(200);
		expect(own.body.data[0]).toMatchObject({ relation: 'resolved_in', items: [], restricted: 1 });
		expect(JSON.stringify(own.body)).not.toContain('TSK-0001');
		expect(JSON.stringify(own.body)).not.toContain('Book the van');

		const theirs = await sendAs(principal, 'GET', `${s.base}/work`);
		expect(theirs.response.status).toBe(404);
	});
});
