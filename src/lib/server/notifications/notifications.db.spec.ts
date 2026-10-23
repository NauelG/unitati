import { eq, sql } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { users } from '../auth/schema';
import { getDb } from '../db';
import { people } from '../directory/schema';
import { createOrganisation, createPerson, createViewer } from '../assets/testing/fixtures';
import { ensureDefaultStates } from '../projects';
import { createProjectRow, createTaskRow, statesByGroup } from '../projects/testing/fixtures';
import { assign, setAssignees, unassign } from '../projects';
import { assignTicket } from '../service-desk';
import { createQueue, createTicket } from '../service-desk/testing/fixtures';
import { listInbox, markAllRead, markRead, notify, unreadCount } from './index';
import { notifications } from './schema';

async function scenario() {
	const organisation = await createOrganisation();
	const admin = await createViewer(organisation.id, 'admin', 'Ada Admin');
	const tech = await createViewer(organisation.id, 'technician', 'Tess Tech');
	const employee = await createViewer(organisation.id, 'employee', 'Eli Employee');
	const queue = await createQueue(organisation.id);
	const ticket = await createTicket(organisation.id, queue.id, employee.personId!);
	return { organisation, admin, tech, employee, ticket };
}

const all = () => getDb().select().from(notifications);

describe('ticket assignment', () => {
	it('notifies the new assignee once, with the code and subject', async () => {
		const { admin, tech, ticket } = await scenario();

		await assignTicket(admin, ticket.ticketTag, tech.personId);

		const rows = await all();
		expect(rows).toHaveLength(1);
		expect(rows[0]).toMatchObject({
			recipientPersonId: tech.personId,
			actorPersonId: admin.personId,
			type: 'ticket.assigned',
			ticketId: ticket.id,
			readAt: null
		});
		expect(rows[0].snapshot).toMatchObject({
			code: ticket.ticketTag,
			title: ticket.subject,
			actorName: 'Ada Admin'
		});
		expect(await unreadCount(tech)).toBe(1);
	});

	it('notifies nobody when you assign it to yourself', async () => {
		const { tech, ticket } = await scenario();
		await assignTicket(tech, ticket.ticketTag, tech.personId);
		expect(await all()).toHaveLength(0);
	});

	it('notifies nobody when it is unassigned', async () => {
		const { admin, tech, ticket } = await scenario();
		await assignTicket(admin, ticket.ticketTag, tech.personId);
		await assignTicket(admin, ticket.ticketTag, null);
		expect(await all()).toHaveLength(1);
	});
});

describe('task assignment', () => {
	async function taskScenario() {
		const base = await scenario();
		await ensureDefaultStates(getDb(), base.organisation.id);
		const states = await statesByGroup(base.organisation.id);
		const project = await createProjectRow(base.organisation.id);
		const task = await createTaskRow(base.organisation.id, project.id, states.unstarted.id);
		const a = await createPerson(base.organisation.id, 'Aaa Person');
		const b = await createPerson(base.organisation.id, 'Bbb Person');
		const c = await createPerson(base.organisation.id, 'Ccc Person');
		// Only people with a user get an in-app row.
		for (const person of [a, b, c]) {
			const id = crypto.randomUUID();
			await getDb()
				.insert(users)
				.values({ id, name: person.fullName, email: person.email, role: 'technician' });
			await getDb().update(people).set({ userId: id }).where(eq(people.id, person.id));
		}
		return { ...base, task, a, b, c };
	}

	it('setAssignees notifies only the newly added, and nobody the second time', async () => {
		const { admin, task, a, b, c } = await taskScenario();

		await setAssignees(admin, task.id, [a.id]);
		await getDb().delete(notifications);

		await setAssignees(admin, task.id, [a.id, b.id, c.id]);
		const rows = await all();
		expect(rows.map((row) => row.recipientPersonId).sort()).toEqual([b.id, c.id].sort());
		expect(rows.every((row) => row.type === 'task.assigned' && row.taskId === task.id)).toBe(true);

		await getDb().delete(notifications);
		await setAssignees(admin, task.id, [a.id]);
		expect(await all()).toHaveLength(0);
	});

	it('assign notifies once and is silent when repeated; unassign notifies nobody', async () => {
		const { admin, task, a } = await taskScenario();

		await assign(admin, task.id, a.id);
		await assign(admin, task.id, a.id);
		expect(await all()).toHaveLength(1);

		await unassign(admin, task.id, a.id);
		expect(await all()).toHaveLength(1);
	});
});

describe('notify', () => {
	it('gives an inactive person, or one without a user, no in-app row', async () => {
		const { organisation, admin, tech, ticket } = await scenario();
		const noUser = await createPerson(organisation.id, 'No User');
		await getDb().update(people).set({ active: false }).where(eq(people.id, tech.personId!));

		const pending = await getDb().transaction((tx) =>
			notify(tx, {
				organisationId: organisation.id,
				actorPersonId: admin.personId,
				target: { ticketId: ticket.id },
				snapshot: { code: ticket.ticketTag, title: ticket.subject },
				recipients: [
					{ personId: tech.personId!, type: 'ticket.assigned' },
					{ personId: noUser.id, type: 'ticket.assigned' }
				]
			})
		);

		expect(await all()).toHaveLength(0);
		// The person without a user still has an address, so mail would go to them.
		expect(pending.map((mail) => mail.personId)).toEqual([noUser.id]);
	});

	it("drops an employee when visibility is 'internal'", async () => {
		const { organisation, admin, tech, employee, ticket } = await scenario();

		await getDb().transaction((tx) =>
			notify(tx, {
				organisationId: organisation.id,
				actorPersonId: admin.personId,
				target: { ticketId: ticket.id },
				snapshot: { code: ticket.ticketTag, title: ticket.subject },
				visibility: 'internal',
				recipients: [
					{ personId: employee.personId!, type: 'ticket.commented' },
					{ personId: tech.personId!, type: 'ticket.commented' }
				]
			})
		);

		expect((await all()).map((row) => row.recipientPersonId)).toEqual([tech.personId]);
	});

	it('collapses duplicates to the strongest type', async () => {
		const { organisation, admin, tech, ticket } = await scenario();

		await getDb().transaction((tx) =>
			notify(tx, {
				organisationId: organisation.id,
				actorPersonId: admin.personId,
				target: { ticketId: ticket.id },
				snapshot: { code: ticket.ticketTag, title: ticket.subject },
				recipients: [
					{ personId: tech.personId!, type: 'followed.activity' },
					{ personId: tech.personId!, type: 'mention' }
				]
			})
		);

		const rows = await all();
		expect(rows).toHaveLength(1);
		expect(rows[0].type).toBe('mention');
	});
});

describe('the inbox', () => {
	async function seeded() {
		const { tech, admin, ticket } = await scenario();
		await assignTicket(admin, ticket.ticketTag, tech.personId);
		return { tech, admin, ticket };
	}

	it("deletes the viewer's old read rows and leaves unread and other people's alone", async () => {
		const { tech, admin, ticket } = await seeded();
		const old = sql`now() - interval '91 days'`;

		await getDb().update(notifications).set({ readAt: old });
		// Another person's old read row, and the viewer's old *unread* row.
		const [mine] = await all();
		await getDb()
			.insert(notifications)
			.values([
				{ ...mine, id: undefined, recipientPersonId: admin.personId!, readAt: old },
				{ ...mine, id: undefined, readAt: null }
			]);

		await listInbox(tech);

		const rows = await all();
		expect(rows).toHaveLength(2);
		expect(rows.some((row) => row.recipientPersonId === tech.personId && row.readAt !== null)).toBe(
			false
		);
		expect(rows.some((row) => row.recipientPersonId === admin.personId)).toBe(true);
		expect(ticket.id).toBeTruthy();
	});

	it('pages newest first with a keyset cursor and filters unread', async () => {
		const { tech, admin, ticket } = await seeded();
		const [first] = await all();
		await getDb()
			.insert(notifications)
			.values(
				[1, 2, 3].map((n) => ({
					...first,
					id: undefined,
					createdAt: new Date(Date.now() + n * 1000),
					snapshot: { code: `T-${n}`, title: ticket.subject }
				}))
			);

		const page1 = await listInbox(tech, { limit: 3 });
		expect(page1.items.map((item) => item.snapshot.code)).toEqual(['T-3', 'T-2', 'T-1']);
		expect(page1.nextCursor).not.toBeNull();

		const page2 = await listInbox(tech, { limit: 3, cursor: page1.nextCursor! });
		expect(page2.items).toHaveLength(1);
		expect(page2.nextCursor).toBeNull();

		await markAllRead(tech);
		expect((await listInbox(tech, { unreadOnly: true })).items).toHaveLength(0);
		expect(await unreadCount(tech)).toBe(0);
		expect(admin.personId).toBeTruthy();
	});

	it('links a ticket by the viewer’s permission', async () => {
		const { tech, ticket } = await seeded();
		const [item] = (await listInbox(tech)).items;
		expect(item.href).toBe(`/service-desk/${ticket.ticketTag}`);
		expect((await listInbox({ ...tech, role: 'employee' })).items[0]?.href).toBe(
			`/portal/tickets/${ticket.ticketTag}`
		);
	});

	it('refuses to mark another person’s notification as read', async () => {
		const { tech, admin } = await seeded();
		const [row] = await all();

		const refused = await markRead(admin, row.id);
		expect(refused).toEqual({ ok: false, error: 'not_found' });
		expect(await unreadCount(tech)).toBe(1);

		expect((await markRead(tech, row.id)).ok).toBe(true);
		expect(await unreadCount(tech)).toBe(0);
	});
});
