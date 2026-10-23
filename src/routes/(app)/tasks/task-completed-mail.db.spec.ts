import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getDb } from '#lib/server/db/index.js';
import { notifyTaskCompleted } from '#lib/server/links/testing/notify.js';
import { ticketTask } from '#lib/server/links/schema.js';
import {
	createProjectRow,
	createTaskRow,
	createWorkspace,
	statesByGroup
} from '#lib/server/projects/testing/fixtures.js';
import { actionEvent } from '#lib/server/projects/testing/action-event.js';
import type { MailMessage } from '#lib/server/shared/mail.js';
import { createQueue, createTicket } from '#lib/server/service-desk/testing/fixtures.js';
import { flushEvents, on, resetSubscriptions, setDispatchMode } from '#lib/server/shared/events.js';
import { actions as boardActions } from '../projects/[tag]/+page.server';
import { actions as recordActions } from './[taskTag]/+page.server';

/**
 * The same notification from every way a person moves a task into a completed state
 * (#152): the record's state selector, the board's "Move to…" menu and a drop
 * on the board. All three end in `moveTask`, which is what emits; these specs
 * hold the entry points to that, so a fourth one that bypassed it would show.
 * The API has no task endpoint yet; it will get its case with the endpoint.
 *
 * The person who moves the task is an admin, not the assigned technician: the
 * actor is never notified of their own action (ADR 0040).
 */

let sent: MailMessage[];

beforeEach(() => {
	sent = [];
	resetSubscriptions();
	setDispatchMode('sync');
	on('task.completed', (event) =>
		notifyTaskCompleted(event, {
			mailer: { send: async (message) => void sent.push(message) },
			origin: 'https://unitati.test'
		})
	);
});

afterEach(() => {
	resetSubscriptions();
	setDispatchMode('async');
});

async function setup() {
	const workspace = await createWorkspace();
	const { organisation, employee, technician } = workspace;
	const states = await statesByGroup(organisation.id);
	const project = await createProjectRow(organisation.id);
	const task = await createTaskRow(organisation.id, project.id, states.started.id, {
		title: 'Replace the switch'
	});
	const queue = await createQueue(organisation.id);
	const ticket = await createTicket(organisation.id, queue.id, employee.personId!, {
		assigneePersonId: technician.personId
	});
	await getDb()
		.insert(ticketTask)
		.values({ organisationId: organisation.id, ticketId: ticket.id, taskId: task.id });

	return { ...workspace, states, project, task, ticket };
}

function expectOneMailAbout(ticketTag: string, to: string) {
	expect(sent).toHaveLength(1);
	expect(sent[0].to).toBe(to);
	expect(sent[0].text).toContain(ticketTag);
}

describe('moving a task to a completed state mails the technician', () => {
	it('from the task record', async () => {
		const { admin, technician, states, task, ticket } = await setup();

		await recordActions.changeState(
			actionEvent(admin, { stateId: states.completed.id }, { taskTag: task.taskTag })
		);
		await flushEvents();

		expectOneMailAbout(ticket.ticketTag, technician.email);
	});

	it('from the board menu', async () => {
		const { admin, technician, states, task, project, ticket } = await setup();

		await boardActions.moveTask(
			actionEvent(
				admin,
				{ taskId: task.id, stateId: states.completed.id },
				{ tag: project.projectTag }
			)
		);
		await flushEvents();

		expectOneMailAbout(ticket.ticketTag, technician.email);
	});

	it('from a drop between two cards of the completed column', async () => {
		const { admin, technician, organisation, states, task, project, ticket } = await setup();
		const above = await createTaskRow(organisation.id, project.id, states.completed.id, {
			position: '1000'
		});
		const below = await createTaskRow(organisation.id, project.id, states.completed.id, {
			position: '2000'
		});

		await boardActions.moveTask(
			actionEvent(
				admin,
				{ taskId: task.id, stateId: states.completed.id, after: above.id, before: below.id },
				{ tag: project.projectTag }
			)
		);
		await flushEvents();

		expectOneMailAbout(ticket.ticketTag, technician.email);
	});
});
