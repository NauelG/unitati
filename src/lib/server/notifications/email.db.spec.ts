import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { createOrganisation, createPerson, createViewer } from '../assets/testing/fixtures';
import { getDb } from '../db';
import { ensureDefaultStates } from '../projects';
import { createProjectRow, createTaskRow, statesByGroup } from '../projects/testing/fixtures';
import { assign } from '../projects';
import { addComment, assignTicket, changeTicketStatus } from '../service-desk';
import { createQueue, createTicket } from '../service-desk/testing/fixtures';
import type { Mailer, MailMessage } from '../shared/mail';
import { InMemoryStorage } from '../shared/storage';
import { getPreferences, setPreference } from './index';
import { notificationPreferences, notifications } from './schema';

/**
 * The producers of #302 end to end: the in-app rows `notify` writes inside the
 * domain's transaction, and the mails sent after commit through a fake mailer.
 */

const origin = 'https://unitati.test';

async function scenario() {
	const organisation = await createOrganisation();
	const admin = await createViewer(organisation.id, 'admin', 'Ada Admin');
	const tech = await createViewer(organisation.id, 'technician', 'Tess Tech');
	const employee = await createViewer(organisation.id, 'employee', 'Eli Employee');
	const queue = await createQueue(organisation.id);
	const ticket = await createTicket(organisation.id, queue.id, employee.personId!, {
		subject: 'La impresora no responde',
		assigneePersonId: tech.personId
	});

	const sent: MailMessage[] = [];
	const deps = {
		storage: new InMemoryStorage(),
		mailer: { send: async (message) => void sent.push(message) } satisfies Mailer,
		origin
	};
	return { organisation, admin, tech, employee, queue, ticket, sent, deps };
}

type Scenario = Awaited<ReturnType<typeof scenario>>;

const rows = () => getDb().select().from(notifications);
const rowsFor = async (personId: string | null) =>
	(await rows()).filter((row) => row.recipientPersonId === personId);

/** Mails go out after commit, unawaited: give them a tick to land. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 10));

function comment(s: Scenario, actor = s.tech, visibility: 'public' | 'internal' = 'public') {
	return addComment(
		actor,
		s.ticket.ticketTag,
		{ body: 'Ya está **arreglada**, prueba ahora.', visibility },
		[],
		s.deps
	);
}

describe('a comment', () => {
	it('public, by a technician: the requester is replied to, the assignee hears of it in-app', async () => {
		const s = await scenario();
		const other = await createViewer(s.organisation.id, 'technician', 'Otto Other');

		await comment(s, other);
		await settle();

		const [replied] = await rowsFor(s.employee.personId);
		expect(replied).toMatchObject({ type: 'ticket.replied', ticketId: s.ticket.id });
		expect(replied.snapshot).toMatchObject({
			code: s.ticket.ticketTag,
			title: 'La impresora no responde',
			actorName: 'Otto Other',
			excerpt: 'Ya está arreglada, prueba ahora.'
		});

		const [commented] = await rowsFor(s.tech.personId);
		expect(commented).toMatchObject({ type: 'ticket.commented' });

		// `ticket.commented` is in-app only by default.
		expect(s.sent.map((mail) => mail.to)).toEqual([s.employee.email]);
		expect(s.sent[0].subject).toBe(`[${s.ticket.ticketTag}] La impresora no responde`);
		expect(s.sent[0].text).toContain('«Ya está arreglada, prueba ahora.»');
		expect(s.sent[0].text).toContain(`${origin}/portal/tickets/${s.ticket.ticketTag}`);
		expect(s.sent[0].text).toContain(`${origin}/account/notifications`);
	});

	it('internal: only the assignee, never the requester, in-app or by mail', async () => {
		const s = await scenario();
		const other = await createViewer(s.organisation.id, 'technician', 'Otto Other');

		await comment(s, other, 'internal');
		await settle();

		expect(await rowsFor(s.employee.personId)).toHaveLength(0);
		const [commented] = await rowsFor(s.tech.personId);
		expect(commented).toMatchObject({ type: 'ticket.commented' });
		expect(s.sent).toEqual([]);
	});

	it('never mails an internal comment to the requester, even when they asked for every mail', async () => {
		const s = await scenario();
		await setPreference(s.employee, 'ticket.replied', 'email', true);
		await setPreference(s.tech, 'ticket.commented', 'email', true);

		await comment(s, s.admin, 'internal');
		await settle();

		expect(s.sent.map((mail) => mail.to)).toEqual([s.tech.email]);
		// Staff read the ticket on the desk.
		expect(s.sent[0].text).toContain(`${origin}/service-desk/${s.ticket.ticketTag}`);
	});

	it('by the assignee: the requester is told, the author is not', async () => {
		const s = await scenario();

		await comment(s);
		await settle();

		expect(await rowsFor(s.tech.personId)).toHaveLength(0);
		expect(await rowsFor(s.employee.personId)).toHaveLength(1);
		expect(s.sent.map((mail) => mail.to)).toEqual([s.employee.email]);
	});

	it('by the requester on their own ticket: the assignee is told, the requester is not', async () => {
		const s = await scenario();

		await comment(s, s.employee);
		await settle();

		expect(await rowsFor(s.employee.personId)).toHaveLength(0);
		const [commented] = await rowsFor(s.tech.personId);
		expect(commented).toMatchObject({
			type: 'ticket.commented',
			actorPersonId: s.employee.personId
		});
		expect(s.sent).toEqual([]);
	});

	it('reaches a requester without a user by mail only', async () => {
		const s = await scenario();
		const guest = await createPerson(s.organisation.id, 'Gus Guest');
		const ticket = await createTicket(s.organisation.id, s.queue.id, guest.id, {
			subject: 'Sin acceso'
		});

		await addComment(
			s.tech,
			ticket.ticketTag,
			{ body: 'Respuesta', visibility: 'public' },
			[],
			s.deps
		);
		await changeTicketStatus(s.tech, ticket.ticketTag, 'in_progress', s.deps);
		await changeTicketStatus(s.tech, ticket.ticketTag, 'resolved', s.deps);
		await settle();

		expect(await rowsFor(guest.id)).toHaveLength(0);
		expect(s.sent.map((mail) => [mail.to, mail.subject])).toEqual([
			[guest.email, `[${ticket.ticketTag}] Sin acceso`],
			[guest.email, `[${ticket.ticketTag}] Resuelta: Sin acceso`]
		]);
		expect(s.sent[0].text).toContain(`${origin}/portal/tickets/${ticket.ticketTag}`);
	});
});

describe('resolving a ticket', () => {
	it('tells the requester in-app and by mail, with the subject of the mail it replaces', async () => {
		const s = await scenario();

		await changeTicketStatus(s.tech, s.ticket.ticketTag, 'in_progress', s.deps);
		await changeTicketStatus(s.tech, s.ticket.ticketTag, 'resolved', s.deps);
		await settle();

		const [resolved] = await rowsFor(s.employee.personId);
		expect(resolved).toMatchObject({ type: 'ticket.resolved' });
		expect(s.sent).toHaveLength(1);
		expect(s.sent[0]).toMatchObject({
			to: s.employee.email,
			subject: `[${s.ticket.ticketTag}] Resuelta: La impresora no responde`
		});
	});

	it('notifies nobody for other transitions', async () => {
		const s = await scenario();

		await changeTicketStatus(s.tech, s.ticket.ticketTag, 'in_progress', s.deps);
		await settle();

		expect(await rows()).toHaveLength(0);
		expect(s.sent).toEqual([]);
	});
});

describe('assignment', () => {
	it('mails the new assignee of a ticket by default', async () => {
		const s = await scenario();
		const other = await createViewer(s.organisation.id, 'technician', 'Otto Other');

		await assignTicket(s.admin, s.ticket.ticketTag, other.personId, s.deps);
		await settle();

		expect(s.sent).toHaveLength(1);
		expect(s.sent[0].to).toBe(other.email);
		expect(s.sent[0].text).toContain('Ada Admin te ha asignado');
	});

	it('mails a new assignee of a task by default', async () => {
		const s = await scenario();
		await ensureDefaultStates(getDb(), s.organisation.id);
		const states = await statesByGroup(s.organisation.id);
		const project = await createProjectRow(s.organisation.id);
		const task = await createTaskRow(s.organisation.id, project.id, states.unstarted.id, {
			taskTag: 'TSK-0009',
			title: 'Cambiar el switch'
		});

		await assign(s.admin, task.id, s.tech.personId!, { mailer: s.deps.mailer, origin });
		await settle();

		expect(s.sent).toHaveLength(1);
		expect(s.sent[0]).toMatchObject({ to: s.tech.email, subject: '[TSK-0009] Cambiar el switch' });
		expect(s.sent[0].text).toContain(`${origin}/tasks/TSK-0009`);
	});
});

describe('preferences', () => {
	const stored = (personId: string) =>
		getDb()
			.select()
			.from(notificationPreferences)
			.where(eq(notificationPreferences.personId, personId));

	it('switching off mail for replies stops that mail, and keeps the in-app one', async () => {
		const s = await scenario();
		const off = await setPreference(s.employee, 'ticket.replied', 'email', false);
		expect(off.ok).toBe(true);

		await comment(s);
		await settle();

		expect(s.sent).toEqual([]);
		expect(await rowsFor(s.employee.personId)).toHaveLength(1);
	});

	it('switching off in-app for replies stops the row, and keeps the mail', async () => {
		const s = await scenario();
		await setPreference(s.employee, 'ticket.replied', 'in_app', false);

		await comment(s);
		await settle();

		expect(await rowsFor(s.employee.personId)).toHaveLength(0);
		expect(s.sent.map((mail) => mail.to)).toEqual([s.employee.email]);
	});

	it('stores only what differs from the default: switching back deletes the row', async () => {
		const s = await scenario();

		await setPreference(s.employee, 'ticket.replied', 'email', false);
		expect(await stored(s.employee.personId!)).toMatchObject([
			{ type: 'ticket.replied', channel: 'email', enabled: false }
		]);

		// Writing the same choice twice is an update, not a second row.
		await setPreference(s.employee, 'ticket.replied', 'email', false);
		expect(await stored(s.employee.personId!)).toHaveLength(1);

		await setPreference(s.employee, 'ticket.replied', 'email', true);
		expect(await stored(s.employee.personId!)).toEqual([]);
	});

	it('refuses to switch off in-app for a direct type', async () => {
		const s = await scenario();

		expect(await setPreference(s.tech, 'ticket.assigned', 'in_app', false)).toEqual({
			ok: false,
			error: 'locked'
		});
		expect(await stored(s.tech.personId!)).toEqual([]);

		// Its mail can be switched off.
		expect((await setPreference(s.tech, 'ticket.assigned', 'email', false)).ok).toBe(true);
	});

	it('refuses a type the viewer cannot receive', async () => {
		const s = await scenario();
		expect(await setPreference(s.employee, 'ticket.assigned', 'email', false)).toEqual({
			ok: false,
			error: 'not_available'
		});
	});

	it('lists three types for an employee and all eight for staff, with what is in effect', async () => {
		const s = await scenario();
		await setPreference(s.tech, 'ticket.commented', 'email', true);

		const employee = await getPreferences(s.employee);
		expect(employee.map((row) => row.type)).toEqual([
			'ticket.replied',
			'ticket.resolved',
			'mention'
		]);

		const staff = await getPreferences(s.tech);
		expect(staff).toHaveLength(8);
		expect(staff.find((row) => row.type === 'ticket.commented')).toEqual({
			type: 'ticket.commented',
			inApp: true,
			email: true,
			inAppLocked: false
		});
		expect(staff.find((row) => row.type === 'ticket.assigned')).toMatchObject({
			inApp: true,
			inAppLocked: true
		});
		expect(staff.find((row) => row.type === 'followed.activity')).toMatchObject({ email: false });
	});
});
