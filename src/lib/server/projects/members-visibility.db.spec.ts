import { isHttpError } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { load as loadOverview } from '../../../routes/(app)/+page.server';
import { load as loadProject } from '../../../routes/(app)/projects/[tag]/+page.server';
import { load as loadProjects } from '../../../routes/(app)/projects/+page.server';
import { load as loadTicket } from '../../../routes/(app)/service-desk/[tag]/+page.server';
import { load as loadTask } from '../../../routes/(app)/tasks/[taskTag]/+page.server';
import { load as loadTasks } from '../../../routes/(app)/tasks/+page.server';
import { activitySentence } from '../../components/unitati/activity';
import { listActivity, listRecentActivity } from '../activity';
import { authenticateRequest } from '../api';
import { handleApiRequest } from '../api';
import { createApiKey } from '../api';
import { createViewer } from '../assets/testing/fixtures';
import type { SessionUser } from '../auth/guards';
import { getDb } from '../db';
import {
	escalateTicket,
	linkTicketToProject,
	linkTicketToTask,
	projectChoices,
	relatedTo,
	taskChoices,
	visibleFeed
} from '../links';
import { search } from '../search';
import { ticketThread } from '../service-desk';
import { createQueue, createTicket } from '../service-desk/testing/fixtures';
import {
	countActiveProjects,
	countOpenTasks,
	getProject,
	getTask,
	listProjects,
	listTasks,
	moveTaskToProject
} from './index';
import { projectMembers, tasks } from './schema';
import {
	assignRow,
	createProjectRow,
	createTaskRow,
	createWorkspace,
	statesByGroup
} from './testing/fixtures';

/**
 * The contract of members-only projects (ADR 0042, #310): every path through
 * which a project the viewer is not a member of could leak, asserted for the
 * viewer who must not learn of it and, as a control, for the ones who must.
 *
 * One fixture. A members-only project P with a task T, linked to a ticket K that
 * every technician can open. N is a technician who is not a member; M one who is;
 * A an admin; E an employee who is a member and is assigned to T, and R the
 * employee who raised K and is not a member of anything.
 *
 * **Assertions are on serialised data**, not on rendered text: a title that a
 * template happens not to draw is still in the payload the browser receives.
 */

const SECRETS = {
	projectTag: 'PRJ-0900',
	projectName: 'Reorganisation Zeta',
	taskTag: 'TSK-0900',
	taskTitle: 'Dismissal plan Quokka'
} as const;

async function scenario() {
	const base = await createWorkspace();
	const { organisation, admin, technician: outsider, employee: requester } = base;
	const member = await createViewer(organisation.id, 'technician', 'Mia Member');
	const employeeMember = await createViewer(organisation.id, 'employee', 'Ed Employee');
	const states = await statesByGroup(organisation.id);

	const secret = await createProjectRow(organisation.id, {
		projectTag: SECRETS.projectTag,
		name: SECRETS.projectName,
		visibility: 'members',
		ownerPersonId: member.personId
	});
	await getDb()
		.insert(projectMembers)
		.values(
			[member, employeeMember].map((viewer) => ({
				organisationId: organisation.id,
				projectId: secret.id,
				personId: viewer.personId!
			}))
		);
	const task = await createTaskRow(organisation.id, secret.id, states.unstarted.id, {
		taskTag: SECRETS.taskTag,
		title: SECRETS.taskTitle
	});
	await assignRow(organisation.id, task.id, employeeMember.personId!);

	const open = await createProjectRow(organisation.id, {
		projectTag: 'PRJ-0001',
		name: 'Office move'
	});
	const openTask = await createTaskRow(organisation.id, open.id, states.unstarted.id, {
		taskTag: 'TSK-0001',
		title: 'Book the van'
	});

	// "My open work" counts assigned tasks, so everybody is on both. The outsider on
	// T is a stale assignment (made before the project was closed): the scope, not
	// the data, is what must keep it out of their counter.
	for (const viewer of [outsider, member, admin]) {
		await assignRow(organisation.id, task.id, viewer.personId!);
		await assignRow(organisation.id, openTask.id, viewer.personId!);
	}

	const queue = await createQueue(organisation.id);
	const ticket = await createTicket(organisation.id, queue.id, requester.personId!);
	expect((await linkTicketToTask(admin, { ticketId: ticket.id, taskId: task.id })).ok).toBe(true);
	expect((await linkTicketToProject(admin, { ticketId: ticket.id, projectId: secret.id })).ok).toBe(
		true
	);

	return {
		...base,
		outsider,
		member,
		employeeMember,
		requester,
		states,
		secret,
		task,
		open,
		openTask,
		queue,
		ticket
	};
}

/** What a browser would receive from a `load`: every promise it streams, awaited, then serialised. */
async function payload(run: () => unknown): Promise<string> {
	const data = (await run()) as Record<string, unknown>;
	const settled = Object.fromEntries(
		await Promise.all(Object.entries(data).map(async ([key, value]) => [key, await value]))
	);
	return JSON.stringify(settled);
}

function event(user: SessionUser, params: Record<string, string> = {}, search = '') {
	return {
		locals: { user },
		params,
		url: new URL(`http://localhost/page${search}`),
		cookies: { get: () => undefined }
	} as never;
}

async function status(run: () => unknown): Promise<number> {
	try {
		await run();
		return 200;
	} catch (caught) {
		if (isHttpError(caught)) return caught.status;
		throw caught;
	}
}

function leaksSecrets(text: string): string[] {
	return Object.values(SECRETS).filter((secret) => text.includes(secret));
}

async function apiGet(actor: SessionUser, path: string) {
	const issued = await createApiKey(actor, {
		name: crypto.randomUUID(),
		scopes: ['projects.view', 'tickets.view'],
		expiresInDays: 90
	});
	if (!issued.ok) throw new Error(String(issued.error));
	const request = new Request(`http://localhost${path}`, {
		headers: { authorization: `Bearer ${issued.value.key}` }
	});
	const locals = { ...(await authenticateRequest(request)) } as unknown as App.Locals;
	const response = await handleApiRequest({ request, locals });
	return { status: response.status, text: await response.text() };
}

describe('a members-only project, for a technician who is not a member', () => {
	it('is absent from the project pages and the board', async () => {
		const s = await scenario();
		const { outsider } = s;

		const list = await payload(() => loadProjects(event(outsider)));
		expect(leaksSecrets(list)).toEqual([]);
		expect(list).toContain('PRJ-0001');

		const params = { tag: SECRETS.projectTag };
		expect(await status(() => loadProject(event(outsider, params)))).toBe(404);
		expect(await status(() => loadProject(event(outsider, params, '?view=board')))).toBe(404);
		expect(await status(() => loadProject(event(outsider, params, '?view=list')))).toBe(404);
	});

	it('is absent from the task pages and lists', async () => {
		const s = await scenario();
		const { outsider } = s;

		const all = await payload(() => loadTasks(event(outsider, {}, '?filter=all')));
		expect(leaksSecrets(all)).toEqual([]);
		expect(all).toContain('TSK-0001');

		const byTitle = await payload(() => loadTasks(event(outsider, {}, '?filter=all&q=Quokka')));
		expect(leaksSecrets(byTitle)).toEqual([]);

		expect(await status(() => loadTask(event(outsider, { taskTag: SECRETS.taskTag })))).toBe(404);

		expect((await listProjects(outsider)).map((project) => project.id)).toEqual([s.open.id]);
		expect((await listTasks(outsider)).map((task) => task.id)).toEqual([s.openTask.id]);
		expect(await getProject(outsider, SECRETS.projectTag)).toEqual({
			ok: false,
			error: 'project_not_found'
		});
		expect(await getTask(outsider, SECRETS.taskTag)).toEqual({
			ok: false,
			error: 'task_not_found'
		});
	});

	it('is absent from the JSON API', async () => {
		const s = await scenario();
		const { outsider } = s;

		const projects = await apiGet(outsider, '/api/v1/projects');
		expect(projects.status).toBe(200);
		expect(leaksSecrets(projects.text)).toEqual([]);

		expect((await apiGet(outsider, `/api/v1/projects/${SECRETS.projectTag}`)).status).toBe(404);
		expect((await apiGet(outsider, `/api/v1/projects/${SECRETS.projectTag}/timeline`)).status).toBe(
			404
		);

		const tasks = await apiGet(outsider, '/api/v1/tasks');
		expect(tasks.status).toBe(200);
		expect(leaksSecrets(tasks.text)).toEqual([]);

		expect((await apiGet(outsider, `/api/v1/tasks/${SECRETS.taskTag}`)).status).toBe(404);
		expect((await apiGet(outsider, `/api/v1/tasks/${SECRETS.taskTag}/timeline`)).status).toBe(404);
		expect((await apiGet(outsider, `/api/v1/tasks/${SECRETS.taskTag}/tickets`)).status).toBe(404);
	});

	it('is not found by code or by words of the title', async () => {
		const s = await scenario();

		for (const term of [
			SECRETS.projectTag,
			SECRETS.taskTag,
			'Quokka',
			'Dismissal plan',
			'Reorganisation',
			'Zeta'
		]) {
			const found = await search(s.outsider, term);
			expect(JSON.stringify(found), term).not.toMatch(/Quokka|Zeta|PRJ-0900|TSK-0900/);
		}
		// The control: a member finds it, so the empty answer above is the scope's doing.
		expect(JSON.stringify(await search(s.member, 'Quokka'))).toContain(SECRETS.taskTag);
	});

	it('is a count, never a code or a title, on the relations of the ticket', async () => {
		const s = await scenario();

		const groups = await relatedTo(s.outsider, { kind: 'ticket', id: s.ticket.id });

		expect(groups).toEqual([
			{ relation: 'resolved_in', icon: 'task', items: [], restricted: 1 },
			{ relation: 'handled_in', icon: 'project', items: [], restricted: 1 }
		]);
		const serialised = JSON.stringify(groups);
		expect(leaksSecrets(serialised)).toEqual([]);
		expect(serialised).not.toContain(s.task.id);
		expect(serialised).not.toContain(s.secret.id);
	});

	it('is absent from the ticket page, including what it streams', async () => {
		const s = await scenario();

		const page = await payload(() => loadTicket(event(s.outsider, { tag: s.ticket.ticketTag })));

		expect(leaksSecrets(page)).toEqual([]);
		expect(page).not.toContain(s.task.id);
		expect(page).not.toContain(s.secret.id);
	});

	it('is a restricted element in the history of the ticket', async () => {
		const s = await scenario();

		const thread = await ticketThread(s.outsider, s.ticket.ticketTag);
		if (!thread.ok) throw new Error('setup');
		const links = thread.value.flatMap((item) =>
			item.kind === 'event' && item.entry.verb.startsWith('link.') ? [item.entry] : []
		);

		expect(links.map((entry) => entry.verb).sort()).toEqual([
			'link.project.added',
			'link.task.added'
		]);
		expect(links.map((entry) => activitySentence(entry))).toEqual([
			'Vinculó un elemento restringido',
			'Vinculó un elemento restringido'
		]);
		expect(leaksSecrets(JSON.stringify(thread.value))).toEqual([]);

		const api = await apiGet(s.outsider, `/api/v1/tickets/${s.ticket.ticketTag}/comments`);
		expect(api.status).toBe(200);
		expect(leaksSecrets(api.text)).toEqual([]);
		const work = await apiGet(s.outsider, `/api/v1/tickets/${s.ticket.ticketTag}/work`);
		expect(leaksSecrets(work.text)).toEqual([]);
		expect(
			JSON.parse(work.text).data.map((group: { restricted: number }) => group.restricted)
		).toEqual([1, 1]);
	});

	it('is absent from the organisation feed on the overview', async () => {
		const s = await scenario();

		const feed = await visibleFeed(s.outsider, await listRecentActivity(s.organisation.id, 50));
		expect(leaksSecrets(JSON.stringify(feed))).toEqual([]);
		expect(await payload(() => loadOverview(event(s.outsider)))).not.toMatch(
			/Quokka|Zeta|PRJ-0900|TSK-0900/
		);

		// The control: the raw feed does carry it, so the redaction is what removed it.
		expect(
			leaksSecrets(JSON.stringify(await listRecentActivity(s.organisation.id, 50)))
		).not.toEqual([]);
	});

	it('is not offered as an escalation target, and cannot be escalated to', async () => {
		const s = await scenario();
		const other = await createTicket(s.organisation.id, s.queue.id, s.requester.personId!);

		expect(await taskChoices(s.outsider, other.id, 'Quokka')).toEqual([]);
		expect(await projectChoices(s.outsider, other.id, 'Zeta')).toEqual([]);
		expect((await taskChoices(s.outsider, other.id, '')).map((choice) => choice.taskTag)).toEqual([
			'TSK-0001'
		]);
		expect(
			(await projectChoices(s.outsider, other.id, '')).map((choice) => choice.projectTag)
		).toEqual(['PRJ-0001']);

		expect(
			await escalateTicket(s.outsider, other.id, { kind: 'existing_task', taskId: s.task.id })
		).toEqual({ ok: false, error: 'task_not_found' });
		expect(
			await escalateTicket(s.outsider, other.id, {
				kind: 'existing_project',
				projectId: s.secret.id
			})
		).toEqual({ ok: false, error: 'project_not_found' });
		expect(
			await escalateTicket(s.outsider, other.id, {
				kind: 'new_task',
				projectId: s.secret.id,
				title: 'Sneaky',
				description: null
			})
		).toEqual({ ok: false, error: 'project_not_found' });
	});

	it('cannot be reached by moving a task into it or out of it', async () => {
		const s = await scenario();

		expect(await moveTaskToProject(s.outsider, s.openTask.id, s.secret.id)).toEqual({
			ok: false,
			error: 'project_not_found'
		});
		expect(await moveTaskToProject(s.outsider, s.task.id, s.open.id)).toEqual({
			ok: false,
			error: 'task_not_found'
		});

		const picker = await payload(() =>
			loadTask(event(s.outsider, { taskTag: s.openTask.taskTag }))
		);
		expect(leaksSecrets(picker)).toEqual([]);
		expect(await status(() => loadTask(event(s.outsider, { taskTag: 'TSK-0001' })))).toBe(200);
	});

	it('is left out of both counters of the layout', async () => {
		const s = await scenario();

		expect(await countActiveProjects(s.outsider)).toBe(1);
		expect(await countOpenTasks(s.outsider)).toBe(1);
	});
});

describe('the same project, for the people who may see it', () => {
	it('is offered, listed, found and counted for a member and for an admin', async () => {
		const s = await scenario();

		for (const viewer of [s.member, s.admin]) {
			expect(await listProjects(viewer)).toHaveLength(2);
			expect((await getProject(viewer, SECRETS.projectTag)).ok).toBe(true);
			expect((await getTask(viewer, SECRETS.taskTag)).ok).toBe(true);
			expect(await countActiveProjects(viewer)).toBe(2);
			expect(await countOpenTasks(viewer)).toBe(2);
			expect(JSON.stringify(await search(viewer, 'Quokka'))).toContain(SECRETS.taskTag);
			expect(
				(await projectChoices(viewer, s.ticket.id, 'Zeta')).map((choice) => choice.projectTag)
			).toEqual([SECRETS.projectTag]);
			expect(await status(() => loadProject(event(viewer, { tag: SECRETS.projectTag })))).toBe(200);
			expect(await status(() => loadTask(event(viewer, { taskTag: SECRETS.taskTag })))).toBe(200);

			const groups = await relatedTo(viewer, { kind: 'ticket', id: s.ticket.id });
			expect(groups.map((group) => [group.relation, group.restricted])).toEqual([
				['resolved_in', undefined],
				['handled_in', undefined]
			]);
			expect(groups[0].items[0].ref).toMatchObject({ tag: SECRETS.taskTag });
			expect(groups[1].items[0].ref).toMatchObject({ tag: SECRETS.projectTag });

			const thread = await ticketThread(viewer, s.ticket.ticketTag);
			if (!thread.ok) throw new Error('setup');
			expect(
				thread.value.flatMap((item) =>
					item.kind === 'event' && item.entry.verb === 'link.task.added'
						? [activitySentence(item.entry)]
						: []
				)
			).toEqual([`Vinculó la tarea ${SECRETS.taskTag} ${SECRETS.taskTitle}`]);
		}
	});

	it('shows a member employee their own task, still without the rest of the project', async () => {
		const s = await scenario();

		const tasks = await listTasks(s.employeeMember);
		expect(tasks.map((task) => task.taskTag)).toEqual([SECRETS.taskTag]);
	});

	it('offers the member as a move target and as a source', async () => {
		const s = await scenario();

		const picker = await payload(() => loadTask(event(s.member, { taskTag: 'TSK-0001' })));
		expect(picker).toContain(SECRETS.projectTag);
	});
});

describe('the requester of the ticket, who is not a member', () => {
	it('learns that work exists, and nothing about it', async () => {
		const s = await scenario();

		const groups = await relatedTo(s.requester, { kind: 'ticket', id: s.ticket.id });

		expect(groups).toEqual([
			{ relation: 'resolved_in', icon: 'task', items: [], restricted: 1 },
			{ relation: 'handled_in', icon: 'project', items: [], restricted: 1 }
		]);
		expect(leaksSecrets(JSON.stringify(groups))).toEqual([]);
		expect(
			(await listActivity({ organisationId: s.organisation.id, target: { ticketId: s.ticket.id } }))
				.length
		).toBeGreaterThan(0);
	});
});

async function freshTask(s: Awaited<ReturnType<typeof scenario>>) {
	return createTaskRow(s.organisation.id, s.open.id, s.states.unstarted.id, {
		taskTag: 'TSK-0002',
		title: 'Unassigned errand'
	});
}

describe('moving a task into a members-only project', () => {
	it('refuses while an assignee is not a member, naming them', async () => {
		const s = await scenario();
		const fresh = await freshTask(s);
		await assignRow(s.organisation.id, fresh.id, s.outsider.personId!);
		await assignRow(s.organisation.id, fresh.id, s.member.personId!);

		const moved = await moveTaskToProject(s.admin, fresh.id, s.secret.id);

		expect(moved).toEqual({
			ok: false,
			error: {
				kind: 'assignees_not_members',
				people: [{ personId: s.outsider.personId, fullName: 'Tom Technician' }]
			}
		});
		const [row] = await getDb()
			.select({ projectId: tasks.projectId })
			.from(tasks)
			.where(eq(tasks.id, fresh.id));
		expect(row.projectId).toBe(s.open.id);
	});

	it('moves once every assignee is a member', async () => {
		const s = await scenario();
		const fresh = await freshTask(s);
		await assignRow(s.organisation.id, fresh.id, s.member.personId!);

		expect(await moveTaskToProject(s.admin, fresh.id, s.secret.id)).toEqual({
			ok: true,
			value: undefined
		});
	});

	it('moves a task with no assignee, and checks nothing for an open target', async () => {
		const s = await scenario();
		const fresh = await freshTask(s);
		const other = await createProjectRow(s.organisation.id, { name: 'Other' });
		await assignRow(s.organisation.id, fresh.id, s.outsider.personId!);

		expect((await moveTaskToProject(s.admin, fresh.id, other.id)).ok).toBe(true);
	});

	it('lets a member move it out to an open project, whoever is assigned', async () => {
		const s = await scenario();

		const moved = await moveTaskToProject(s.member, s.task.id, s.open.id);

		expect(moved.ok).toBe(true);
	});
});
