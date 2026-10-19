import { describe, expect, it } from 'vitest';
import { assignRow } from '#lib/server/projects/testing/fixtures.js';
import {
	createProjectRow,
	createTaskRow,
	createWorkspace,
	statesByGroup
} from '#lib/server/projects/testing/fixtures.js';
import { listActivity } from '#lib/server/activity/index.js';
import { getProject, listTasks } from '#lib/server/projects/index.js';
import { actionEvent, outcomeOf } from '#lib/server/projects/testing/action-event.js';
import { linkTicketToProject, linkTicketToTask, relatedTo } from '#lib/server/links/index.js';
import { createQueue, createTicket } from '#lib/server/service-desk/testing/fixtures.js';
import { changeTicketStatus } from '#lib/server/service-desk/index.js';
import { actions, load } from './+page.server';

async function setup() {
	const workspace = await createWorkspace();
	const project = await createProjectRow(workspace.organisation.id);
	return { ...workspace, project, params: { tag: project.projectTag } };
}

describe('writing to a project record', () => {
	it('answers 403 to every write from a viewer who may only read assigned work', async () => {
		const { employee, params } = await setup();

		for (const run of [
			() => actions.update(actionEvent(employee, { name: 'Nope' }, params)),
			() => actions.archive(actionEvent(employee, {}, params)),
			() => actions.unarchive(actionEvent(employee, {}, params)),
			() => actions.createTask(actionEvent(employee, { title: 'Nope' }, params)),
			() => actions.moveTask(actionEvent(employee, {}, params)),
			() => actions.unlinkTicket(actionEvent(employee, { recordId: crypto.randomUUID() }, params))
		]) {
			expect((await outcomeOf(run)).thrown?.status).toBe(403);
		}
	});

	it('sends an anonymous visitor to sign in instead of writing', async () => {
		const { params } = await setup();

		const { thrown } = await outcomeOf(() => actions.archive(actionEvent(null, {}, params)));

		expect(thrown?.status).toBe(303);
	});

	it('archives and restores, keeping the project and its tasks reachable', async () => {
		const { technician, project, organisation, params } = await setup();
		const states = await statesByGroup(organisation.id);
		await createTaskRow(organisation.id, project.id, states.unstarted.id);

		await actions.archive(actionEvent(technician, {}, params));
		const archived = await getProject(technician, project.projectTag);
		expect(archived.ok && archived.value.archivedAt).toBeTruthy();
		expect(await listTasks(technician, { projectId: project.id })).toHaveLength(1);

		await actions.unarchive(actionEvent(technician, {}, params));
		const restored = await getProject(technician, project.projectTag);
		expect(restored.ok && restored.value.archivedAt).toBeNull();
	});

	it('creates a task in the default state from a title alone', async () => {
		const { technician, project, params } = await setup();

		const { returned } = await outcomeOf(() =>
			actions.createTask(actionEvent(technician, { title: 'Pack the boxes' }, params))
		);

		const [task] = await listTasks(technician, { projectId: project.id });
		expect(task).toMatchObject({ title: 'Pack the boxes', stateGroup: 'backlog' });
		expect(returned).toMatchObject({ action: 'createTask' });
	});

	it('refuses a blank task title and creates nothing', async () => {
		const { technician, project, params } = await setup();

		const { returned } = await outcomeOf(() =>
			actions.createTask(actionEvent(technician, { title: ' ' }, params))
		);

		expect(returned?.status).toBe(400);
		expect(await listTasks(technician, { projectId: project.id })).toEqual([]);
	});

	it('refuses to add a task to an archived project', async () => {
		const { technician, project, params } = await setup();
		await actions.archive(actionEvent(technician, {}, params));

		const { returned } = await outcomeOf(() =>
			actions.createTask(actionEvent(technician, { title: 'Too late' }, params))
		);

		expect(returned?.status).toBe(400);
		expect(await listTasks(technician, { projectId: project.id })).toEqual([]);
	});

	it('edits the project and keeps the tag unique', async () => {
		const { technician, organisation, project, params } = await setup();
		await createProjectRow(organisation.id, { projectTag: 'TAKEN' });

		const ok = await outcomeOf(() =>
			actions.update(
				actionEvent(
					technician,
					{ name: 'Renamed', description: '', ownerPersonId: '', dueDate: '' },
					params
				)
			)
		);
		expect(ok.returned).toMatchObject({ action: 'update' });
		const renamed = await getProject(technician, project.projectTag);
		expect(renamed.ok && renamed.value.name).toBe('Renamed');

		const clash = await outcomeOf(() =>
			actions.update(
				actionEvent(
					technician,
					{ name: 'Renamed', projectTag: 'TAKEN', ownerPersonId: '', dueDate: '' },
					params
				)
			)
		);
		expect(clash.returned?.status).toBe(400);
		expect(clash.returned?.data).toMatchObject({ field: 'projectTag' });
	});

	it('leaves every other field alone when an in-place edit posts one field', async () => {
		const { technician, organisation } = await setup();
		const owner = technician.personId!;
		const project = await createProjectRow(organisation.id, {
			name: 'Keep me',
			description: 'Some **markdown**',
			dueDate: '2026-12-01',
			ownerPersonId: null
		});
		const target = { tag: project.projectTag };

		await actions.update(actionEvent(technician, { ownerPersonId: owner }, target));
		await actions.update(actionEvent(technician, { name: 'Renamed' }, target));
		await actions.update(actionEvent(technician, { description: 'New text' }, target));

		const found = await getProject(technician, project.projectTag);
		expect(found.ok && found.value).toMatchObject({
			name: 'Renamed',
			description: 'New text',
			dueDate: '2026-12-01',
			ownerPersonId: owner
		});
	});

	it('clears the due date and the owner only when the field is posted empty', async () => {
		const { technician, organisation } = await setup();
		const project = await createProjectRow(organisation.id, {
			dueDate: '2026-12-01',
			ownerPersonId: technician.personId!
		});
		const target = { tag: project.projectTag };

		await actions.update(actionEvent(technician, { dueDate: '' }, target));
		const afterDue = await getProject(technician, project.projectTag);
		expect(afterDue.ok && afterDue.value).toMatchObject({
			dueDate: null,
			ownerPersonId: technician.personId
		});

		await actions.update(actionEvent(technician, { ownerPersonId: '' }, target));
		const afterOwner = await getProject(technician, project.projectTag);
		expect(afterOwner.ok && afterOwner.value.ownerPersonId).toBeNull();
	});

	it('returns the new code so the page can follow it, and refuses a reserved or duplicate one', async () => {
		const { technician, organisation, params } = await setup();
		await createProjectRow(organisation.id, { projectTag: 'TAKEN' });

		const moved = await outcomeOf(() =>
			actions.update(actionEvent(technician, { projectTag: 'MOVED' }, params))
		);
		expect(moved.returned).toMatchObject({ action: 'update', projectTag: 'MOVED' });
		expect((await getProject(technician, 'MOVED')).ok).toBe(true);

		for (const projectTag of ['TAKEN', 'new', '']) {
			const refused = await outcomeOf(() =>
				actions.update(actionEvent(technician, { projectTag }, { tag: 'MOVED' }))
			);
			expect(refused.returned?.status).toBe(400);
			expect(refused.returned?.data).toMatchObject({ field: 'projectTag' });
		}
	});

	it('refuses a name posted blank and a description over the limit', async () => {
		const { technician, params } = await setup();

		const blank = await outcomeOf(() =>
			actions.update(actionEvent(technician, { name: ' ' }, params))
		);
		expect(blank.returned?.data).toMatchObject({ field: 'name' });

		const long = await outcomeOf(() =>
			actions.update(actionEvent(technician, { description: 'x'.repeat(20_001) }, params))
		);
		expect(long.returned?.data).toMatchObject({ field: 'description' });
	});

	it('still refuses writes to an employee who has a task in the project', async () => {
		const { employee, params, project, organisation } = await setup();
		const states = await statesByGroup(organisation.id);
		const task = await createTaskRow(organisation.id, project.id, states.unstarted.id);
		await assignRow(organisation.id, task.id, employee.personId!);

		expect(
			(await outcomeOf(() => actions.archive(actionEvent(employee, {}, params)))).thrown?.status
		).toBe(403);
	});

	it('creates a task in the column the quick create was opened from', async () => {
		const { technician, project, organisation, params } = await setup();
		const states = await statesByGroup(organisation.id);

		await actions.createTask(
			actionEvent(technician, { title: 'Quick', stateId: states.started.id }, params)
		);

		const [task] = await listTasks(technician, { projectId: project.id });
		expect(task).toMatchObject({ title: 'Quick', stateId: states.started.id });
	});
});

describe('moving a task on the board', () => {
	it('moves to another column, to the end when no neighbour is named', async () => {
		const { technician, project, organisation, params } = await setup();
		const states = await statesByGroup(organisation.id);
		const first = await createTaskRow(organisation.id, project.id, states.started.id, {
			title: 'Already there',
			taskTag: 'T-1'
		});
		const moving = await createTaskRow(organisation.id, project.id, states.unstarted.id, {
			title: 'Moving',
			taskTag: 'T-2'
		});

		await actions.moveTask(
			actionEvent(technician, { taskId: moving.id, stateId: states.started.id }, params)
		);

		const column = (await listTasks(technician, { projectId: project.id })).filter(
			(task) => task.stateId === states.started.id
		);
		expect(column.map((task) => task.id)).toEqual([first.id, moving.id]);
	});

	it('reorders inside a column from the neighbours of the drop, writing no activity', async () => {
		const { technician, project, organisation, params } = await setup();
		const states = await statesByGroup(organisation.id);
		const ids: string[] = [];
		for (const [index, title] of ['a', 'b', 'c'].entries()) {
			const row = await createTaskRow(organisation.id, project.id, states.unstarted.id, {
				title,
				taskTag: `R-${index}`,
				position: String((index + 1) * 1000)
			});
			ids.push(row.id);
		}
		const [a, b, c] = ids;

		await actions.moveTask(
			actionEvent(
				technician,
				{ taskId: c, stateId: states.unstarted.id, after: a, before: b },
				params
			)
		);

		const column = await listTasks(technician, { projectId: project.id });
		expect(column.map((task) => task.id)).toEqual([a, c, b]);
		expect(await listActivity({ organisationId: organisation.id, target: { taskId: c } })).toEqual(
			[]
		);
	});

	it('refuses a malformed request and moves nothing', async () => {
		const { technician, params } = await setup();

		const { returned } = await outcomeOf(() =>
			actions.moveTask(actionEvent(technician, { taskId: 'nope', stateId: 'nope' }, params))
		);

		expect(returned?.status).toBe(400);
	});

	it('refuses to move a task of an archived project', async () => {
		const { technician, project, organisation, params } = await setup();
		const states = await statesByGroup(organisation.id);
		const task = await createTaskRow(organisation.id, project.id, states.unstarted.id);
		await actions.archive(actionEvent(technician, {}, params));

		const { returned } = await outcomeOf(() =>
			actions.moveTask(
				actionEvent(technician, { taskId: task.id, stateId: states.started.id }, params)
			)
		);

		expect(returned?.status).toBe(400);
	});
});

describe('loading the project record for the board', () => {
	/** The cookie jar is the cookie the request brought, and what `load` writes back. */
	const written: { name: string; value: string }[] = [];
	const event = (
		user: unknown,
		params: Record<string, string>,
		search = '',
		boardCookie?: string
	) => {
		written.length = 0;
		return {
			locals: { user },
			params,
			url: new URL(`http://localhost/projects/${params.tag}${search}`),
			cookies: {
				get: (name: string) => (name === 'unitati-board' ? boardCookie : undefined),
				set: (name: string, value: string) => written.push({ name, value })
			}
		} as never;
	};

	it('renders the description as sanitised HTML next to the raw markdown', async () => {
		const { technician, organisation } = await setup();
		const project = await createProjectRow(organisation.id, {
			description: 'Hi **there** <script>x</script>'
		});

		const data = (await load(event(technician, { tag: project.projectTag }))) as {
			descriptionHtml: string;
			project: { description: string };
		};

		expect(data.project.description).toContain('**there**');
		expect(data.descriptionHtml).toContain('<strong>there</strong>');
		expect(data.descriptionHtml).not.toContain('<script');
	});

	it('shows the board unless the list is asked for', async () => {
		const { technician, params } = await setup();

		const board = (await load(event(technician, params))) as { view: string };
		const list = (await load(event(technician, params, '?view=list'))) as { view: string };

		expect([board.view, list.view]).toEqual(['board', 'list']);
	});

	it('opens on the stored view when the URL names none, on the first server response', async () => {
		const { technician, params } = await setup();
		const stored = JSON.stringify({ view: 'list', states: {} });

		const data = (await load(event(technician, params, '', stored))) as { view: string };

		expect(data.view).toBe('list');
	});

	it('lets an explicit ?view= win over the stored view without touching the cookie', async () => {
		const { technician, params } = await setup();
		const stored = JSON.stringify({ view: 'list', states: {} });

		const data = (await load(event(technician, params, '?view=board', stored))) as {
			view: string;
		};

		expect(data.view).toBe('board');
		expect(written).toEqual([]);
	});

	it('hands the folded columns to the page and drops a state that no longer exists', async () => {
		const { technician, organisation, params } = await setup();
		const states = await statesByGroup(organisation.id);
		const gone = '99999999-9999-4999-8999-999999999999';
		const stored = JSON.stringify({
			view: null,
			states: { [states.completed.id]: 'collapsed', [gone]: 'collapsed' }
		});

		const data = (await load(event(technician, params, '', stored))) as {
			view: string;
			collapsedStates: Record<string, string>;
		};

		expect(data.view).toBe('board');
		expect(data.collapsedStates).toEqual({ [states.completed.id]: 'collapsed' });
		expect(written).toHaveLength(1);
		expect(JSON.parse(written[0].value)).toEqual({
			view: null,
			states: { [states.completed.id]: 'collapsed' }
		});
	});

	it('renders the default board for a malformed cookie and rewrites it cleaned', async () => {
		const { technician, params } = await setup();

		const data = (await load(event(technician, params, '', '{nope'))) as {
			view: string;
			collapsedStates: Record<string, string>;
		};

		expect(data).toMatchObject({ view: 'board', collapsedStates: {} });
		expect(JSON.parse(written[0].value)).toEqual({ view: null, states: {} });
	});

	it('writes no cookie for a person who never stored a preference', async () => {
		const { technician, params } = await setup();

		await load(event(technician, params));

		expect(written).toEqual([]);
	});

	it('gives the assigned viewer only their own cards, and every column to put them in', async () => {
		const { employee, project, organisation, params } = await setup();
		const states = await statesByGroup(organisation.id);
		const mine = await createTaskRow(organisation.id, project.id, states.started.id, {
			taskTag: 'M-1'
		});
		await createTaskRow(organisation.id, project.id, states.started.id, { taskTag: 'M-2' });
		await assignRow(organisation.id, mine.id, employee.personId!);

		const data = (await load(event(employee, params))) as {
			tasks: { id: string }[];
			states: unknown[];
			canManage: boolean;
		};

		expect(data.tasks.map((task) => task.id)).toEqual([mine.id]);
		expect(data.states).toHaveLength(5);
		expect(data.canManage).toBe(false);
	});
});

describe('the tickets behind a project record', () => {
	async function scene() {
		const base = await setup();
		const { organisation, technician, employee, project } = base;
		const queue = await createQueue(organisation.id);
		const states = await statesByGroup(organisation.id);
		const [one, two] = await Promise.all([
			createTaskRow(organisation.id, project.id, states.started.id),
			createTaskRow(organisation.id, project.id, states.started.id)
		]);
		const make = (subject: string, requester = employee.personId!) =>
			createTicket(organisation.id, queue.id, requester, { subject });
		return { ...base, one, two, make, technician };
	}

	const event = (user: unknown, params: Record<string, string>) =>
		({
			locals: { user },
			params,
			url: new URL('http://localhost/projects/x'),
			cookies: { get: () => undefined, set: () => undefined }
		}) as never;

	it('counts open tickets once, direct plus via tasks, leaving resolved and closed out', async () => {
		const { technician, project, one, two, make, params } = await scene();
		const both = await make('Reaches two tasks');
		const direct = await make('Direct');
		const done = await make('Done');
		await linkTicketToTask(technician, { ticketId: both.id, taskId: one.id });
		await linkTicketToTask(technician, { ticketId: both.id, taskId: two.id });
		await linkTicketToProject(technician, { ticketId: direct.id, projectId: project.id });
		await linkTicketToProject(technician, { ticketId: done.id, projectId: project.id });
		await changeTicketStatus(technician, done.ticketTag, 'in_progress');
		await changeTicketStatus(technician, done.ticketTag, 'resolved');

		const data = (await load(event(technician, params))) as { openTickets: number };

		expect(data.openTickets).toBe(2);
	});

	it('unlinks a direct ticket on an archived project and writes the entry on the ticket', async () => {
		const { technician, organisation, project, make, params } = await scene();
		const ticket = await make('Direct');
		await linkTicketToProject(technician, { ticketId: ticket.id, projectId: project.id });
		const { archiveProject } = await import('#lib/server/projects/index.js');
		await archiveProject(technician, project.id);

		const { returned } = await outcomeOf(() =>
			actions.unlinkTicket(actionEvent(technician, { recordId: ticket.id }, params))
		);

		expect(returned).toMatchObject({ action: 'unlinkTicket' });
		expect(await relatedTo(technician, { kind: 'project', id: project.id })).toEqual([]);
		const onTicket = await listActivity({
			organisationId: organisation.id,
			target: { ticketId: ticket.id }
		});
		expect(onTicket.map((entry) => entry.verb)).toContain('link.project.removed');
	});

	it('keeps the live ticket entries of the timeline to the direct links', async () => {
		const { technician, project, one, make, params } = await scene();
		const direct = await make('Direct');
		const via = await make('Via a task');
		await linkTicketToProject(technician, { ticketId: direct.id, projectId: project.id });
		await linkTicketToTask(technician, { ticketId: via.id, taskId: one.id });

		const data = (await load(event(technician, params))) as {
			timeline: Promise<{ kind: string; record?: { tag: string } }[]>;
		};
		const tickets = (await data.timeline).filter((item) => item.kind === 'ticket');

		expect(tickets.map((item) => item.record?.tag)).toEqual([direct.ticketTag]);
	});
});
