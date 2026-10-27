import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { listActivity } from '../activity';
import { createPerson } from '../assets/testing/fixtures';
import { getDb } from '../db';
import { ticketTask } from '../links/schema';
import { notifyTaskCompleted } from '../links/testing/notify';
import { projects, tasks } from '../projects/schema';
import {
	assignRow,
	createProjectRow,
	createTaskRow,
	createWorkspace,
	statesByGroup
} from '../projects/testing/fixtures';
import type { MailMessage } from '../shared/mail';
import { createQueue, createTicket } from '../service-desk/testing/fixtures';
import { flushEvents, on, resetSubscriptions, setDispatchMode } from '../shared/events';
import { setTimeTracking } from '../time';
import { authenticateRequest } from './authenticate-request';
import { handleApiRequest } from './dispatch';
import { createApiKey } from './keys';
import type { ApiPrincipal } from './keys';
import { createServiceAccount, createServiceAccountKey } from './service-accounts';

/**
 * The project, task and state use cases over HTTP (#136): a real `Request`
 * through the dispatcher against a real database, asserted as a `curl` would
 * see it.
 */

type Workspace = Awaited<ReturnType<typeof createWorkspace>>;

async function keyFor(owner: Workspace['technician'], scopes: string[]) {
	const issued = await createApiKey(owner, {
		name: crypto.randomUUID(),
		scopes: scopes as Parameters<typeof createApiKey>[1]['scopes'],
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

/** A principal built by hand: an employee cannot own a key, and the row rule is what is under test. */
async function sendAs(principal: ApiPrincipal, method: string, path: string) {
	const request = new Request(`http://localhost${path}`, { method });
	const locals = {
		user: principal,
		api: { ok: true, keyId: principal.keyId }
	} as unknown as App.Locals;
	return respond(await handleApiRequest({ request, locals }));
}

const api = (path: string) => `/api/v1${path}`;

async function scene() {
	const base = await createWorkspace();
	const states = await statesByGroup(base.organisation.id);
	return { ...base, states };
}

describe('the Done-when sequence, with a projects.view + projects.manage key', () => {
	it('creates a project, adds a task, assigns two people, completes it, moves it, archives the first project', async () => {
		const { organisation, technician, states } = await scene();
		const ada = await createPerson(organisation.id, 'Ada Lovelace');
		const grace = await createPerson(organisation.id, 'Grace Hopper');
		const key = await keyFor(technician, ['projects.view', 'projects.manage']);

		const project = await send('POST', api('/projects'), key, {
			name: 'Office move',
			dueDate: '2026-12-01'
		});
		expect(project.response.status).toBe(201);
		const projectTag: string = project.body.data.tag;
		expect(projectTag).toMatch(/^PRJ-\d{4}$/);
		expect(project.response.headers.get('location')).toBe(`/api/v1/projects/${projectTag}`);
		expect(project.body.data).toMatchObject({
			name: 'Office move',
			owner: null,
			dueDate: '2026-12-01',
			archived: false,
			progress: { backlog: 0, completed: 0, percent: null }
		});

		const task = await send('POST', api(`/projects/${projectTag}/tasks`), key, {
			title: 'Book the van'
		});
		expect(task.response.status).toBe(201);
		const taskTag: string = task.body.data.tag;
		expect(taskTag).toMatch(/^TSK-\d{4}$/);
		expect(task.response.headers.get('location')).toBe(`/api/v1/tasks/${taskTag}`);
		expect(task.body.data).toMatchObject({
			title: 'Book the van',
			project: { tag: projectTag, name: 'Office move' },
			state: { group: 'backlog' },
			assignees: [],
			archived: false
		});

		await send('POST', api(`/tasks/${taskTag}/assignees`), key, { personId: ada.id });
		const assigned = await send('POST', api(`/tasks/${taskTag}/assignees`), key, {
			personId: grace.id
		});
		expect(assigned.response.status).toBe(200);
		expect(assigned.body.data.assignees.map((p: { name: string }) => p.name)).toEqual([
			'Ada Lovelace',
			'Grace Hopper'
		]);

		const done = await send('POST', api(`/tasks/${taskTag}/state`), key, {
			stateId: states.completed.id
		});
		expect(done.response.status).toBe(200);
		expect(done.body.data.state).toMatchObject({ id: states.completed.id, group: 'completed' });

		const other = await send('POST', api('/projects'), key, { name: 'Second site' });
		const moved = await send('POST', api(`/tasks/${taskTag}/project`), key, {
			projectTag: other.body.data.tag
		});
		expect(moved.response.status).toBe(200);
		expect(moved.body.data.project).toEqual({ tag: other.body.data.tag, name: 'Second site' });

		const archived = await send('POST', api(`/projects/${projectTag}/archive`), key);
		expect(archived.response.status).toBe(200);
		expect(archived.body.data).toMatchObject({ tag: projectTag, archived: true });

		const [taskRow] = await getDb().select().from(tasks).where(eq(tasks.taskTag, taskTag));
		const history = await listActivity({
			organisationId: organisation.id,
			target: { taskId: taskRow.id }
		});
		expect(history.map((entry) => entry.verb).sort()).toEqual(
			[
				'task.assigned',
				'task.assigned',
				'task.created',
				'task.project.changed',
				'task.state.changed'
			].sort()
		);
		for (const entry of history) expect(entry.actorPersonId).toBe(technician.personId);
	});
});

describe('moving a task to a completed state', () => {
	const sent: MailMessage[] = [];

	beforeEach(() => {
		sent.length = 0;
		resetSubscriptions();
		setDispatchMode('sync');
		on('task.completed', (event) =>
			notifyTaskCompleted(event, {
				mailer: {
					async send(message) {
						sent.push(message);
					}
				},
				origin: 'https://unitati.test'
			})
		);
	});

	afterEach(() => {
		resetSubscriptions();
		setDispatchMode('async');
	});

	it('mails the technicians of the tickets linked to the task (#152)', async () => {
		const { organisation, admin, technician, employee, states } = await scene();
		const queue = await createQueue(organisation.id);
		const project = await createProjectRow(organisation.id);
		const task = await createTaskRow(organisation.id, project.id, states.started.id, {
			taskTag: 'TSK-0900',
			title: 'Replace the switch'
		});
		const ticket = await createTicket(organisation.id, queue.id, employee.personId!, {
			assigneePersonId: technician.personId,
			subject: 'No network'
		});
		await getDb()
			.insert(ticketTask)
			.values({ organisationId: organisation.id, ticketId: ticket.id, taskId: task.id });
		// Completed by somebody else: the actor is never notified of their own action.
		const key = await keyFor(admin, ['projects.manage']);

		const { response } = await send('POST', api('/tasks/TSK-0900/state'), key, {
			stateId: states.completed.id
		});
		await flushEvents();

		expect(response.status).toBe(200);
		expect(sent).toHaveLength(1);
		expect(sent[0].to).toBe(technician.email);
		expect(sent[0].subject).toBe('[TSK-0900] Tarea completada: Replace the switch');
	});
});

describe('a projects.manage-only key', () => {
	it('creates a project and gets the record back without any read scope', async () => {
		const { technician } = await scene();
		const key = await keyFor(technician, ['projects.manage']);

		const { response, body } = await send('POST', api('/projects'), key, { name: 'Write only' });

		expect(response.status).toBe(201);
		expect(body.data.name).toBe('Write only');
	});

	it('cannot read: listing is a 404', async () => {
		const { technician } = await scene();
		const key = await keyFor(technician, ['projects.manage']);

		expect((await send('GET', api('/projects'), key)).response.status).toBe(404);
	});
});

describe('reads', () => {
	it('lists active projects with their progress, and the archived ones on request', async () => {
		const { organisation, technician, states } = await scene();
		const live = await createProjectRow(organisation.id, { name: 'Live', projectTag: 'PRJ-0001' });
		await createProjectRow(organisation.id, {
			name: 'Old',
			projectTag: 'PRJ-0002',
			archivedAt: new Date()
		});
		await createTaskRow(organisation.id, live.id, states.completed.id);
		await createTaskRow(organisation.id, live.id, states.started.id);
		await createTaskRow(organisation.id, live.id, states.cancelled.id);
		const key = await keyFor(technician, ['projects.view']);

		const active = await send('GET', api('/projects'), key);
		const archived = await send('GET', api('/projects?archived=true'), key);

		expect(active.body.data).toEqual([
			{
				tag: 'PRJ-0001',
				name: 'Live',
				description: null,
				owner: null,
				dueDate: null,
				archived: false,
				visibility: 'organisation',
				progress: { backlog: 0, unstarted: 0, started: 1, completed: 1, cancelled: 1, percent: 50 }
			}
		]);
		expect(archived.body.data.map((p: { tag: string }) => p.tag)).toEqual(['PRJ-0002']);
		expect(archived.body.meta).toMatchObject({ total: 1, pageCount: 1 });
	});

	it('gets a project and a task by tag, and answers 404 for an unknown one', async () => {
		const { organisation, technician, states } = await scene();
		const project = await createProjectRow(organisation.id, { projectTag: 'PRJ-0001' });
		await createTaskRow(organisation.id, project.id, states.started.id, { taskTag: 'TSK-0001' });
		const key = await keyFor(technician, ['projects.view']);

		expect((await send('GET', api('/projects/PRJ-0001'), key)).body.data.tag).toBe('PRJ-0001');
		const task = await send('GET', api('/tasks/TSK-0001'), key);
		expect(task.body.data).toMatchObject({ tag: 'TSK-0001', state: { group: 'started' } });
		expect((await send('GET', api('/projects/PRJ-9999'), key)).response.status).toBe(404);
		expect((await send('GET', api('/tasks/TSK-9999'), key)).response.status).toBe(404);
	});

	it('lists tasks in board order, filtered, with an empty page for a project nobody can see', async () => {
		const { organisation, technician, states } = await scene();
		const project = await createProjectRow(organisation.id, { projectTag: 'PRJ-0001' });
		await createTaskRow(organisation.id, project.id, states.completed.id, { title: 'done' });
		await createTaskRow(organisation.id, project.id, states.backlog.id, { title: 'waiting' });
		const key = await keyFor(technician, ['projects.view']);

		const all = await send('GET', api('/tasks'), key);
		const started = await send('GET', api('/tasks?group=completed'), key);
		const ofProject = await send('GET', api('/tasks?projectTag=PRJ-0001'), key);
		const unknown = await send('GET', api('/tasks?projectTag=PRJ-9999'), key);

		expect(all.body.data.map((t: { title: string }) => t.title)).toEqual(['waiting', 'done']);
		expect(started.body.data.map((t: { title: string }) => t.title)).toEqual(['done']);
		expect(ofProject.body.meta.total).toBe(2);
		expect(unknown.response.status).toBe(200);
		expect(unknown.body).toEqual({
			data: [],
			meta: { page: 1, perPage: 25, total: 0, pageCount: 1 }
		});
	});

	it('lists the states of the catalogue with their group and position', async () => {
		const { technician } = await scene();
		const key = await keyFor(technician, ['projects.view']);

		const { response, body } = await send('GET', api('/states'), key);

		expect(response.status).toBe(200);
		expect(body.data.map((s: { group: string }) => s.group)).toEqual(
			expect.arrayContaining(['backlog', 'unstarted', 'started', 'completed', 'cancelled'])
		);
		expect(body.data[0]).toEqual({
			id: expect.any(String),
			name: expect.any(String),
			group: expect.any(String),
			position: expect.any(Number)
		});
	});

	it('reads the timeline of a task and of a project, without internal ids', async () => {
		const { technician } = await scene();
		const key = await keyFor(technician, ['projects.view', 'projects.manage']);
		const first = await send('POST', api('/projects'), key, { name: 'One' });
		const second = await send('POST', api('/projects'), key, { name: 'Two' });
		const task = await send('POST', api(`/projects/${first.body.data.tag}/tasks`), key, {
			title: 'Move me'
		});
		await send('POST', api(`/tasks/${task.body.data.tag}/project`), key, {
			projectTag: second.body.data.tag
		});

		const ofTask = await send('GET', api(`/tasks/${task.body.data.tag}/timeline`), key);
		const ofProject = await send('GET', api(`/projects/${first.body.data.tag}/timeline`), key);

		expect(ofTask.body.data.map((e: { verb: string }) => e.verb)).toEqual([
			'task.project.changed',
			'task.created'
		]);
		expect(ofTask.body.data[0].actor).toEqual({
			kind: 'person',
			id: technician.personId,
			name: 'Tom Technician'
		});
		expect(ofTask.body.data[0].payload).toMatchObject({
			fromProjectTag: first.body.data.tag,
			toProjectTag: second.body.data.tag
		});
		const [row] = await getDb().select().from(projects).where(eq(projects.name, 'One'));
		expect(JSON.stringify([ofTask.body, ofProject.body])).not.toContain(row.id);
		expect(ofProject.body.data.map((e: { verb: string }) => e.verb)).toEqual(['project.created']);
	});
});

describe('pagination', () => {
	it('pages projects and tasks, and meta totals match the key’s scope', async () => {
		const { organisation, technician, employee, states } = await scene();
		const mine = await createProjectRow(organisation.id, { name: 'A', projectTag: 'PRJ-0001' });
		await createProjectRow(organisation.id, { name: 'B', projectTag: 'PRJ-0002' });
		await createProjectRow(organisation.id, { name: 'C', projectTag: 'PRJ-0003' });
		const own = await createTaskRow(organisation.id, mine.id, states.started.id);
		await createTaskRow(organisation.id, mine.id, states.started.id);
		await assignRow(organisation.id, own.id, employee.personId!);
		const key = await keyFor(technician, ['projects.view']);
		const principal = {
			...employee,
			keyId: crypto.randomUUID(),
			scopes: ['projects.view.assigned']
		} as ApiPrincipal;

		const second = await send('GET', api('/projects?perPage=2&page=2'), key);
		const staffTasks = await send('GET', api('/tasks?perPage=1&page=2'), key);
		const ownProjects = await sendAs(principal, 'GET', api('/projects'));
		const ownTasks = await sendAs(principal, 'GET', api('/tasks'));

		expect(second.body.data.map((p: { tag: string }) => p.tag)).toEqual(['PRJ-0003']);
		expect(second.body.meta).toEqual({ page: 2, perPage: 2, total: 3, pageCount: 2 });
		expect(staffTasks.body.meta).toEqual({ page: 2, perPage: 1, total: 2, pageCount: 2 });
		expect(ownProjects.body.meta.total).toBe(1);
		expect(ownTasks.body.meta.total).toBe(1);
	});
});

describe('a projects.view.assigned employee', () => {
	async function employeeScene() {
		const base = await scene();
		const { organisation, employee, states } = base;
		const mine = await createProjectRow(organisation.id, { name: 'Mine', projectTag: 'PRJ-0001' });
		const theirs = await createProjectRow(organisation.id, {
			name: 'Theirs',
			projectTag: 'PRJ-0002'
		});
		const own = await createTaskRow(organisation.id, mine.id, states.started.id, {
			taskTag: 'TSK-0001'
		});
		await createTaskRow(organisation.id, mine.id, states.started.id, { taskTag: 'TSK-0002' });
		await createTaskRow(organisation.id, theirs.id, states.started.id, { taskTag: 'TSK-0003' });
		await assignRow(organisation.id, own.id, employee.personId!);

		const principal = {
			...employee,
			keyId: crypto.randomUUID(),
			scopes: ['projects.view.assigned']
		} as ApiPrincipal;
		return { ...base, principal };
	}

	it('sees only its tasks and the projects that hold them, counting only those tasks', async () => {
		const { principal } = await employeeScene();

		const projectsList = await sendAs(principal, 'GET', api('/projects'));
		const tasksList = await sendAs(principal, 'GET', api('/tasks'));

		expect(projectsList.body.data.map((p: { tag: string }) => p.tag)).toEqual(['PRJ-0001']);
		expect(projectsList.body.data[0].progress.started).toBe(1);
		expect(tasksList.body.data.map((t: { tag: string }) => t.tag)).toEqual(['TSK-0001']);
	});

	it('gets 404 for another task and for an unseen project, and 200 for its own', async () => {
		const { principal } = await employeeScene();

		expect((await sendAs(principal, 'GET', api('/tasks/TSK-0001'))).response.status).toBe(200);
		expect((await sendAs(principal, 'GET', api('/tasks/TSK-0002'))).response.status).toBe(404);
		expect((await sendAs(principal, 'GET', api('/tasks/TSK-0003'))).response.status).toBe(404);
		expect((await sendAs(principal, 'GET', api('/projects/PRJ-0002'))).response.status).toBe(404);
	});

	it('reads the timeline of its own task, and gets 404 on any project timeline', async () => {
		const { principal } = await employeeScene();

		expect((await sendAs(principal, 'GET', api('/tasks/TSK-0001/timeline'))).response.status).toBe(
			200
		);
		expect((await sendAs(principal, 'GET', api('/tasks/TSK-0002/timeline'))).response.status).toBe(
			404
		);
		expect(
			(await sendAs(principal, 'GET', api('/projects/PRJ-0001/timeline'))).response.status
		).toBe(404);
	});

	it('cannot write', async () => {
		const { principal } = await employeeScene();
		const request = new Request('http://localhost/api/v1/projects', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ name: 'Nope' })
		});
		const locals = { user: principal, api: { ok: true, keyId: principal.keyId } };

		const response = await handleApiRequest({ request, locals } as never);

		expect(response.status).toBe(404);
	});
});

describe('a service account key holding only projects.view.assigned', () => {
	it('sees empty lists: it has no person to be assigned to', async () => {
		const { organisation, admin, states } = await scene();
		const project = await createProjectRow(organisation.id);
		await createTaskRow(organisation.id, project.id, states.started.id);
		const created = await createServiceAccount(admin, { name: 'Bot', role: 'employee' });
		if (!created.ok) throw new Error(created.error);
		const issued = await createServiceAccountKey(admin, created.value.id, {
			name: 'bot',
			scopes: ['projects.view.assigned'],
			expiresInDays: null
		});
		if (!issued.ok) throw new Error(issued.error);

		const projectsList = await send('GET', api('/projects'), issued.value.key);
		const tasksList = await send('GET', api('/tasks'), issued.value.key);

		expect(projectsList.response.status).toBe(200);
		expect(projectsList.body).toEqual({
			data: [],
			meta: { page: 1, perPage: 25, total: 0, pageCount: 1 }
		});
		expect(tasksList.body.data).toEqual([]);
	});
});

describe('refusals', () => {
	async function manage() {
		const base = await scene();
		const key = await keyFor(base.technician, ['projects.view', 'projects.manage']);
		const project = await send('POST', api('/projects'), key, { name: 'Office move' });
		const task = await send('POST', api(`/projects/${project.body.data.tag}/tasks`), key, {
			title: 'Pack'
		});
		return { ...base, key, projectTag: project.body.data.tag, taskTag: task.body.data.tag };
	}

	it('answers 409 project_archived for every write on an archived project and on its tasks', async () => {
		const { key, organisation, projectTag, taskTag } = await manage();
		const person = await createPerson(organisation.id, 'Ada Lovelace');
		await send('POST', api(`/projects/${projectTag}/archive`), key);

		const attempts = [
			send('PATCH', api(`/projects/${projectTag}`), key, { name: 'Renamed' }),
			send('POST', api(`/projects/${projectTag}/tasks`), key, { title: 'More' }),
			send('PATCH', api(`/tasks/${taskTag}`), key, { title: 'Renamed' }),
			send('POST', api(`/tasks/${taskTag}/assignees`), key, { personId: person.id })
		];

		for (const { response, body } of await Promise.all(attempts)) {
			expect(response.status).toBe(409);
			expect(body.error.code).toBe('project_archived');
		}
		const read = await send('GET', api(`/tasks/${taskTag}`), key);
		expect(read.body.data.archived).toBe(true);
	});

	it('unarchives with DELETE and the writes work again', async () => {
		const { key, projectTag } = await manage();
		await send('POST', api(`/projects/${projectTag}/archive`), key);

		const back = await send('DELETE', api(`/projects/${projectTag}/archive`), key);
		const write = await send('PATCH', api(`/projects/${projectTag}`), key, { name: 'Again' });

		expect(back.body.data.archived).toBe(false);
		expect(write.response.status).toBe(200);
	});

	it('answers 409 same_project when moving a task to the project it is in', async () => {
		const { key, projectTag, taskTag } = await manage();

		const { response, body } = await send('POST', api(`/tasks/${taskTag}/project`), key, {
			projectTag
		});

		expect(response.status).toBe(409);
		expect(body.error.code).toBe('same_project');
	});

	it('answers 400 on the field for a project, a state, an owner or a person that does not exist', async () => {
		const { key, projectTag, taskTag } = await manage();
		const nobody = '00000000-0000-4000-8000-000000000000';

		const cases = [
			[
				await send('POST', api(`/tasks/${taskTag}/project`), key, { projectTag: 'PRJ-9999' }),
				'projectTag'
			],
			[await send('POST', api(`/tasks/${taskTag}/state`), key, { stateId: nobody }), 'stateId'],
			[
				await send('POST', api(`/projects/${projectTag}/tasks`), key, {
					title: 'x',
					stateId: nobody
				}),
				'stateId'
			],
			[
				await send('POST', api('/projects'), key, { name: 'x', ownerPersonId: nobody }),
				'ownerPersonId'
			],
			[
				await send('POST', api(`/tasks/${taskTag}/assignees`), key, { personId: nobody }),
				'personId'
			]
		] as const;

		for (const [{ response, body }, field] of cases) {
			expect(response.status, field).toBe(400);
			expect(body.error.issues[0].path, field).toEqual([field]);
		}
	});

	it('answers 409 for a duplicate tag and moves the URL when a tag is changed', async () => {
		const { key, projectTag, taskTag } = await manage();

		const duplicate = await send('PATCH', api(`/projects/${projectTag}`), key, {
			projectTag
		}).then(() => send('POST', api('/projects'), key, { name: 'Twin', projectTag }));
		const renamed = await send('PATCH', api(`/tasks/${taskTag}`), key, { taskTag: 'TSK-0777' });

		expect(duplicate.response.status).toBe(409);
		expect(duplicate.body.error.code).toBe('duplicate_project_tag');
		expect(renamed.response.status).toBe(200);
		expect(renamed.response.headers.get('location')).toBe('/api/v1/tasks/TSK-0777');
		expect((await send('GET', api(`/tasks/${taskTag}`), key)).response.status).toBe(404);
	});

	it('answers 400 for an invalid body', async () => {
		const { key } = await manage();

		const { response, body } = await send('POST', api('/projects'), key, { name: '' });

		expect(response.status).toBe(400);
		expect(body.error.code).toBe('invalid_input');
	});

	it('assigns and unassigns idempotently, writing no activity the second time', async () => {
		const { key, organisation, taskTag } = await manage();
		const person = await createPerson(organisation.id, 'Ada Lovelace');
		const [row] = await getDb().select().from(tasks).where(eq(tasks.taskTag, taskTag));
		const count = async () =>
			(await listActivity({ organisationId: organisation.id, target: { taskId: row.id } })).length;

		await send('POST', api(`/tasks/${taskTag}/assignees`), key, { personId: person.id });
		const afterFirst = await count();
		const again = await send('POST', api(`/tasks/${taskTag}/assignees`), key, {
			personId: person.id
		});
		const afterSecond = await count();
		const removed = await send('DELETE', api(`/tasks/${taskTag}/assignees/${person.id}`), key);
		const afterRemoval = await count();
		const removedAgain = await send('DELETE', api(`/tasks/${taskTag}/assignees/${person.id}`), key);

		expect(again.response.status).toBe(200);
		expect(afterSecond).toBe(afterFirst);
		expect(removed.body.data.assignees).toEqual([]);
		expect(removedAgain.response.status).toBe(200);
		expect(await count()).toBe(afterRemoval);
	});

	it('moves to the same state without writing an event', async () => {
		const { key, states, organisation, taskTag } = await manage();
		const [row] = await getDb().select().from(tasks).where(eq(tasks.taskTag, taskTag));

		await send('POST', api(`/tasks/${taskTag}/state`), key, { stateId: row.stateId });

		const history = await listActivity({
			organisationId: organisation.id,
			target: { taskId: row.id }
		});
		expect(history.map((e) => e.verb)).toEqual(['task.created']);
		expect(states.backlog.id).toBeDefined();
	});
});

describe('members-only projects (#309)', () => {
	async function closedScene() {
		const base = await scene();
		const { organisation, admin, technician, states } = base;
		const closed = await createProjectRow(organisation.id, {
			name: 'Secret',
			projectTag: 'PRJ-0001',
			visibility: 'members'
		});
		await createTaskRow(organisation.id, closed.id, states.started.id, { taskTag: 'TSK-0001' });
		await createPerson(organisation.id, 'Somebody');
		return {
			...base,
			adminKey: await keyFor(admin, ['projects.view', 'projects.manage']),
			techKey: await keyFor(technician, ['projects.view', 'projects.manage'])
		};
	}

	it('answers 404 for the project and its tasks to a key whose owner is not a member', async () => {
		const { techKey } = await closedScene();

		expect((await send('GET', api('/projects/PRJ-0001'), techKey)).response.status).toBe(404);
		expect((await send('GET', api('/tasks/TSK-0001'), techKey)).response.status).toBe(404);
		expect((await send('GET', api('/projects'), techKey)).body.data).toEqual([]);
		expect(
			(await send('PATCH', api('/projects/PRJ-0001'), techKey, { name: 'Mine' })).response.status
		).toBe(404);
	});

	it('shows an admin key the project, with its visibility on the wire', async () => {
		const { adminKey } = await closedScene();

		const { response, body } = await send('GET', api('/projects/PRJ-0001'), adminKey);

		expect(response.status).toBe(200);
		expect(body.data.visibility).toBe('members');
	});

	it('creates members-only and switches visibility through PATCH', async () => {
		const { adminKey } = await closedScene();

		const created = await send('POST', api('/projects'), adminKey, {
			name: 'Born closed',
			visibility: 'members'
		});
		expect(created.response.status).toBe(201);
		expect(created.body.data.visibility).toBe('members');

		const reopened = await send('PATCH', api(`/projects/${created.body.data.tag}`), adminKey, {
			visibility: 'organisation'
		});
		expect(reopened.body.data.visibility).toBe('organisation');
	});

	it('answers 409 not_a_member when assigning a non-member', async () => {
		const { adminKey, organisation } = await closedScene();
		const outsider = await createPerson(organisation.id, 'Outsider');

		const { response, body } = await send('POST', api('/tasks/TSK-0001/assignees'), adminKey, {
			personId: outsider.id
		});

		expect(response.status).toBe(409);
		expect(body.error.code).toBe('not_a_member');
	});
});

describe('the wire', () => {
	it('never lets an internal task or project id out', async () => {
		const { organisation, technician, states } = await scene();
		const project = await createProjectRow(organisation.id, { projectTag: 'PRJ-0001' });
		const task = await createTaskRow(organisation.id, project.id, states.started.id, {
			taskTag: 'TSK-0001'
		});
		const key = await keyFor(technician, ['projects.view', 'projects.manage']);

		const responses = [
			await send('GET', api('/projects'), key),
			await send('GET', api('/projects/PRJ-0001'), key),
			await send('GET', api('/projects/PRJ-0001/timeline'), key),
			await send('GET', api('/tasks'), key),
			await send('GET', api('/tasks/TSK-0001'), key),
			await send('GET', api('/tasks/TSK-0001/timeline'), key),
			await send('POST', api('/tasks/TSK-0001/assignees'), key, {
				personId: technician.personId!
			}),
			await send('POST', api('/projects/PRJ-0001/archive'), key)
		];

		const text = JSON.stringify(responses.map((r) => r.body));
		expect(text).not.toContain(project.id);
		expect(text).not.toContain(task.id);
	});

	it('documents the new endpoints in openapi.json', async () => {
		const { technician } = await scene();
		const key = await keyFor(technician, ['projects.view']);

		const { body } = await send('GET', api('/openapi.json'), key);

		expect(Object.keys(body.paths)).toEqual(
			expect.arrayContaining([
				'/projects',
				'/projects/{tag}',
				'/projects/{tag}/timeline',
				'/projects/{tag}/archive',
				'/projects/{tag}/tasks',
				'/tasks',
				'/tasks/{tag}',
				'/tasks/{tag}/timeline',
				'/tasks/{tag}/state',
				'/tasks/{tag}/project',
				'/tasks/{tag}/assignees',
				'/tasks/{tag}/assignees/{personId}',
				'/states'
			])
		);
		expect(Object.keys(body.components.schemas)).toEqual(
			expect.arrayContaining(['Project', 'Task', 'State', 'Person', 'TimelineEntry'])
		);
	});
});

describe('subtasks over the API (ADR 0055)', () => {
	async function family() {
		const base = await scene();
		const key = await keyFor(base.technician, ['projects.view', 'projects.manage', 'time.log']);
		const project = await send('POST', api('/projects'), key, { name: 'Mail server' });
		const projectTag: string = project.body.data.tag;
		const parent = await send('POST', api(`/projects/${projectTag}/tasks`), key, {
			title: 'Migrate'
		});
		return { ...base, key, projectTag, parentTag: parent.body.data.tag as string };
	}

	it('creates a subtask by parentTag and reads both sides, with time on the single read', async () => {
		const { key, projectTag, parentTag, admin } = await family();
		await setTimeTracking(admin, true);

		const child = await send('POST', api(`/projects/${projectTag}/tasks`), key, {
			title: 'Export mailboxes',
			parentTag
		});
		expect(child.response.status).toBe(201);
		expect(child.body.data).toMatchObject({
			parent: { tag: parentTag, title: 'Migrate' },
			subtasks: { total: 0, completed: 0, restricted: 0 }
		});

		const parent = await send('GET', api(`/tasks/${parentTag}`), key);
		expect(parent.body.data).toMatchObject({
			parent: null,
			subtasks: { total: 1, completed: 0, restricted: 0 },
			time: { ownMinutes: 0, withSubtasksMinutes: 0 }
		});

		const listed = await send('GET', api(`/tasks?parent=${parentTag}`), key);
		expect(listed.body.data.map((task: { tag: string }) => task.tag)).toEqual([
			child.body.data.tag
		]);
		expect(listed.body.data[0]).not.toHaveProperty('time');
		const none = await send('GET', api('/tasks?parent=TSK-9999'), key);
		expect(none.body).toMatchObject({ data: [], meta: { total: 0 } });
	});

	it('answers time: null to a key without time.log', async () => {
		const { technician, parentTag } = await family();
		const reader = await keyFor(technician, ['projects.view']);

		const { body } = await send('GET', api(`/tasks/${parentTag}`), reader);
		expect(body.data.time).toBeNull();
	});

	it('sets and removes a parent, and declares each refusal', async () => {
		const { key, projectTag, parentTag, states } = await family();
		const task = await send('POST', api(`/projects/${projectTag}/tasks`), key, { title: 'Task' });
		const taskTag: string = task.body.data.tag;

		const set = await send('POST', api(`/tasks/${taskTag}/parent`), key, { parentTag });
		expect(set.response.status).toBe(200);
		expect(set.body.data.parent).toEqual({ tag: parentTag, title: 'Migrate' });

		const missing = await send('POST', api(`/tasks/${parentTag}/parent`), key, {
			parentTag: 'TSK-9999'
		});
		expect(missing.response.status).toBe(400);
		expect(missing.body.error.issues[0].path).toEqual(['parentTag']);

		const self = await send('POST', api(`/tasks/${parentTag}/parent`), key, { parentTag });
		expect(self.response.status).toBe(400);

		const deep = await send('POST', api(`/projects/${projectTag}/tasks`), key, {
			title: 'Deep',
			parentTag: taskTag
		});
		expect(deep.response.status).toBe(409);
		expect(deep.body.error.code).toBe('parent_is_subtask');

		const other = await send('POST', api(`/projects/${projectTag}/tasks`), key, { title: 'Other' });
		const hasChildren = await send('POST', api(`/tasks/${parentTag}/parent`), key, {
			parentTag: other.body.data.tag
		});
		expect(hasChildren.response.status).toBe(409);
		expect(hasChildren.body.error.code).toBe('task_has_subtasks');

		const close = await send('POST', api(`/tasks/${parentTag}/state`), key, {
			stateId: states.completed.id
		});
		expect(close.response.status).toBe(409);
		expect(close.body.error.code).toBe('open_subtasks');
		expect(close.body.error.details).toEqual({ subtasks: [{ tag: taskTag, title: 'Task' }] });

		await send('POST', api(`/tasks/${taskTag}/state`), key, { stateId: states.completed.id });
		await send('POST', api(`/tasks/${parentTag}/state`), key, { stateId: states.completed.id });
		const reopen = await send('POST', api(`/tasks/${taskTag}/state`), key, {
			stateId: states.started.id
		});
		expect(reopen.response.status).toBe(409);
		expect(reopen.body.error.code).toBe('parent_closed');

		const removed = await send('DELETE', api(`/tasks/${taskTag}/parent`), key);
		expect(removed.response.status).toBe(200);
		expect(removed.body.data.parent).toBeNull();
	});

	it('documents the subtask endpoints and fields in openapi.json', async () => {
		const { key } = await family();

		const { body } = await send('GET', api('/openapi.json'), key);

		expect(Object.keys(body.paths['/tasks/{tag}/parent'])).toEqual(
			expect.arrayContaining(['post', 'delete'])
		);
		expect(Object.keys(body.components.schemas.Task.properties)).toEqual(
			expect.arrayContaining(['parent', 'subtasks'])
		);
		expect(Object.keys(body.components.schemas.TaskDetail.properties)).toContain('time');
		expect(JSON.stringify(body.paths['/tasks/{tag}/state'].post.responses)).toContain(
			'open_subtasks'
		);
		expect(JSON.stringify(body.paths['/projects/{tag}/tasks'].post)).toContain('parentTag');
	});
});

describe('a subtask’s timeline over the API', () => {
	it('names the parent by code and title, without its internal id', async () => {
		const { technician, organisation, states } = await scene();
		const key = await keyFor(technician, ['projects.view', 'projects.manage']);
		const project = await createProjectRow(organisation.id);
		const parent = await createTaskRow(organisation.id, project.id, states.unstarted.id, {
			title: 'Parent'
		});
		const child = await createTaskRow(organisation.id, project.id, states.unstarted.id);
		await send('POST', api(`/tasks/${child.taskTag}/parent`), key, { parentTag: parent.taskTag });

		const { body } = await send('GET', api(`/tasks/${child.taskTag}/timeline`), key);

		expect(body.data[0]).toMatchObject({
			verb: 'task.parent.changed',
			payload: { from: null, to: { taskTag: parent.taskTag, title: 'Parent' } }
		});
		expect(JSON.stringify(body)).not.toContain(parent.id);
	});
});
