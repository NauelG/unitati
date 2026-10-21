import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getDb } from '../db';
import { people } from '../directory';
import { createViewer } from '../assets/testing/fixtures';
import { moveTask } from '../projects';
import {
	createProjectRow,
	createTaskRow,
	createWorkspace,
	statesByGroup
} from '../projects/testing/fixtures';
import type { Mailer, MailMessage } from '../shared/mail';
import { tickets } from '../service-desk/schema';
import { createQueue, createTicket } from '../service-desk/testing/fixtures';
import { flushEvents, on, resetSubscriptions, setDispatchMode } from '../shared/events';
import { setPreference } from '../notifications';
import { notifications } from '../notifications/schema';
import { notifyTaskCompleted } from './notify-task-completed';
import { ticketTask } from './schema';

/**
 * `task.completed` → `task.linked_completed` notifications and mail, from the
 * move to the outbox (#152, #302). The handler is
 * wired the way `subscriptions.ts` wires it, with a fake mailer, and driven
 * through `moveTask`, which is the only emitter and the call every entry point
 * (the project board's menu and drag, the task record) ends in.
 */

const origin = 'https://unitati.test';

let sent: MailMessage[];

function fakeMailer(): Mailer {
	return {
		async send(message) {
			sent.push(message);
		}
	};
}

function subscribe(mailer: Mailer | null) {
	on('task.completed', (event) => notifyTaskCompleted(event, { mailer, origin }));
}

beforeEach(() => {
	sent = [];
	resetSubscriptions();
	setDispatchMode('sync');
});

afterEach(() => {
	resetSubscriptions();
	setDispatchMode('async');
	vi.restoreAllMocks();
});

async function scene() {
	const base = await createWorkspace();
	const { organisation, employee } = base;
	const queue = await createQueue(organisation.id);
	const states = await statesByGroup(organisation.id);
	const project = await createProjectRow(organisation.id);
	const task = await createTaskRow(organisation.id, project.id, states.started.id, {
		taskTag: 'TSK-0001',
		title: 'Replace the switch'
	});
	const second = await createViewer(organisation.id, 'technician', 'Tessa Technician');

	async function ticketFor(assigneePersonId: string | null, overrides = {}) {
		const ticket = await createTicket(organisation.id, queue.id, employee.personId!, {
			assigneePersonId,
			...overrides
		});
		await getDb()
			.insert(ticketTask)
			.values({ organisationId: organisation.id, ticketId: ticket.id, taskId: task.id });
		return ticket;
	}

	return { ...base, states, task, second, ticketFor };
}

const linkedRows = () =>
	getDb().select().from(notifications).where(eq(notifications.type, 'task.linked_completed'));

describe('task completed → notification and mail', () => {
	it('writes one in-app row per ticket and sends one mail per technician, listing them', async () => {
		const { admin, states, task, technician, second, ticketFor } = await scene();
		const a = await ticketFor(technician.personId, { subject: 'No network' });
		const b = await ticketFor(technician.personId, { subject: 'Slow wifi' });
		const c = await ticketFor(second.personId, { subject: 'Port dead' });
		subscribe(fakeMailer());

		await moveTask(admin, task.id, states.completed.id);
		await flushEvents();

		const rows = await linkedRows();
		expect(
			rows
				.filter((row) => row.recipientPersonId === technician.personId)
				.map((row) => row.ticketId)
				.sort()
		).toEqual([a.id, b.id].sort());
		expect(rows.filter((row) => row.recipientPersonId === second.personId)).toHaveLength(1);
		expect(rows[0].snapshot.summary).toBe('TSK-0001 Replace the switch');
		expect(rows.every((row) => row.actorPersonId === admin.personId)).toBe(true);

		expect(sent).toHaveLength(2);
		const toTom = sent.find((m) => m.to === technician.email)!;
		const toTessa = sent.find((m) => m.to === second.email)!;
		expect(toTom.subject).toBe('[TSK-0001] Tarea completada: Replace the switch');
		expect(toTom.text).toContain(
			`${a.ticketTag} No network: ${origin}/service-desk/${a.ticketTag}`
		);
		expect(toTom.text).toContain(`${b.ticketTag} Slow wifi`);
		expect(toTom.text).not.toContain(c.ticketTag);
		expect(toTessa.text).toContain(`${c.ticketTag} Port dead`);
		expect(toTessa.text).not.toContain(a.ticketTag);
		expect(toTom.text).toContain(`${origin}/account/notifications`);
	});

	it('follows the technician’s preference: no mail, the in-app rows still arrive', async () => {
		const { admin, states, task, technician, ticketFor } = await scene();
		await ticketFor(technician.personId);
		await setPreference(technician, 'task.linked_completed', 'email', false);
		subscribe(fakeMailer());

		await moveTask(admin, task.id, states.completed.id);
		await flushEvents();

		expect(sent).toEqual([]);
		expect(await linkedRows()).toHaveLength(1);
	});

	it('does not tell the technician who completed the task themself', async () => {
		const { states, task, technician, ticketFor } = await scene();
		await ticketFor(technician.personId);
		subscribe(fakeMailer());

		await moveTask(technician, task.id, states.completed.id);
		await flushEvents();

		expect(sent).toEqual([]);
		expect(await linkedRows()).toEqual([]);
	});

	it('mails again when the task leaves completed and re-enters it', async () => {
		const { admin, states, task, technician, ticketFor } = await scene();
		await ticketFor(technician.personId);
		subscribe(fakeMailer());

		await moveTask(admin, task.id, states.completed.id);
		await moveTask(admin, task.id, states.started.id);
		await moveTask(admin, task.id, states.completed.id);
		await flushEvents();

		expect(sent).toHaveLength(2);
	});

	it('does not mail for tickets resolved, closed or unassigned', async () => {
		const { admin, states, task, technician, ticketFor } = await scene();
		await ticketFor(technician.personId, { status: 'resolved' });
		await ticketFor(technician.personId, { status: 'closed' });
		await ticketFor(null);
		subscribe(fakeMailer());

		const completed = await moveTask(admin, task.id, states.completed.id);
		await flushEvents();

		expect(completed.ok).toBe(true);
		expect(sent).toEqual([]);
		expect(await linkedRows()).toEqual([]);
	});

	it('mails nothing, and does not fail, when SMTP is not configured; the inbox still hears', async () => {
		const { admin, states, task, technician, ticketFor } = await scene();
		await ticketFor(technician.personId);
		subscribe(null);

		const moved = await moveTask(admin, task.id, states.completed.id);
		await flushEvents();

		expect(moved.ok).toBe(true);
		expect(sent).toEqual([]);
		expect(await linkedRows()).toHaveLength(1);
	});

	it('skips a technician with no address', async () => {
		const { admin, states, task, technician, ticketFor } = await scene();
		await ticketFor(technician.personId);
		await getDb().update(people).set({ email: '' }).where(eq(people.id, technician.personId!));
		subscribe(fakeMailer());

		await moveTask(admin, task.id, states.completed.id);
		await flushEvents();

		expect(sent).toEqual([]);
	});

	it('returns before a send that never finishes', async () => {
		const { admin, states, task, technician, ticketFor } = await scene();
		await ticketFor(technician.personId);
		subscribe({ send: () => new Promise<void>(() => {}) });

		const moved = await moveTask(admin, task.id, states.completed.id);
		await flushEvents();

		expect(moved.ok).toBe(true);
	});

	it('succeeds and logs when delivery fails', async () => {
		const { admin, states, task, technician, ticketFor } = await scene();
		await ticketFor(technician.personId);
		const error = vi.spyOn(console, 'error').mockImplementation(() => {});
		subscribe({
			send: () => Promise.reject(new Error('connection refused'))
		});

		const moved = await moveTask(admin, task.id, states.completed.id);
		await flushEvents();
		await new Promise((resolve) => setTimeout(resolve, 0));

		expect(moved.ok).toBe(true);
		expect(error).toHaveBeenCalledWith(
			`could not send mail to ${technician.email}`,
			expect.any(Error)
		);
	});

	it('never modifies the ticket', async () => {
		const { admin, states, task, technician, ticketFor } = await scene();
		const ticket = await ticketFor(technician.personId);
		subscribe(fakeMailer());

		await moveTask(admin, task.id, states.completed.id);
		await flushEvents();

		const [after] = await getDb().select().from(tickets).where(eq(tickets.id, ticket.id));
		expect(after).toEqual(ticket);
	});
});
