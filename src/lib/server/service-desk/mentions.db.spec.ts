import { and, eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { mentionToken } from '#lib/domain/mentions.js';
import { createOrganisation, createViewer } from '../assets/testing/fixtures';
import { getDb } from '../db';
import { follows, notifications } from '../notifications/schema';
import type { Mailer } from '../shared/mail';
import { InMemoryStorage } from '../shared/storage';
import {
	addComment,
	assignTicket,
	createTicket,
	editComment,
	searchMentionables,
	searchStaffMentionables,
	ticketThread
} from './index';
import { tickets } from './schema';
import { createQueue } from './testing/fixtures';

async function workspace() {
	const organisation = await createOrganisation();
	const admin = await createViewer(organisation.id, 'admin', 'Ada Admin');
	const technician = await createViewer(organisation.id, 'technician', 'Tess Tech');
	const colleague = await createViewer(organisation.id, 'technician', 'Theo Tech');
	const employee = await createViewer(organisation.id, 'employee', 'Eve Employee');
	const other = await createViewer(organisation.id, 'employee', 'Olga Other');
	const queue = await createQueue(organisation.id, 'Hardware');
	const sent: Parameters<Mailer['send']>[0][] = [];
	const deps = {
		storage: new InMemoryStorage(),
		mailer: { send: async (message) => void sent.push(message) } satisfies Mailer
	};
	const opened = await createTicket(
		employee,
		{ subject: 'La impresora no responde', body: 'Se queda en cola', queueId: queue.id },
		[],
		deps
	);
	if (!opened.ok) throw new Error(opened.error);
	return {
		organisation,
		admin,
		technician,
		colleague,
		employee,
		other,
		queue,
		deps,
		sent,
		tag: opened.value.ticketTag,
		ticketId: opened.value.id
	};
}

type W = Awaited<ReturnType<typeof workspace>>;
type Viewer = W['admin'];

const names = (list: { label: string }[]) => list.map((entry) => entry.label);

async function offered(
	w: W,
	viewer: Viewer,
	visibility: 'public' | 'internal',
	query = ''
): Promise<string[]> {
	const outcome = await searchMentionables(viewer, w.tag, visibility, query);
	if (!outcome.ok) throw new Error(outcome.error);
	return names(outcome.value);
}

const say = async (
	w: W,
	author: Viewer,
	body: string,
	visibility: 'public' | 'internal' = 'public'
) => {
	const outcome = await addComment(author, w.tag, { body, visibility }, [], w.deps);
	if (!outcome.ok) throw new Error(JSON.stringify(outcome.error));
	return outcome.value.commentId;
};

const mention = (person: Viewer) => mentionToken(person.name, person.personId!);
const inbox = () => getDb().select().from(notifications);
const followers = () => getDb().select().from(follows);

describe('who the picker offers', () => {
	it('offers staff only in an internal comment, never the viewer or the requester', async () => {
		const w = await workspace();
		expect(await offered(w, w.technician, 'internal')).toEqual(['Ada Admin', 'Theo Tech']);
	});

	it('offers the requester too in a public comment', async () => {
		const w = await workspace();
		expect(await offered(w, w.technician, 'public')).toEqual([
			'Ada Admin',
			'Eve Employee',
			'Theo Tech'
		]);
	});

	it('narrows by name or email and caps the list at 8', async () => {
		const w = await workspace();
		expect(await offered(w, w.technician, 'public', 'theo')).toEqual(['Theo Tech']);
		expect(await offered(w, w.technician, 'public', 'ada.admin@')).toEqual(['Ada Admin']);
		expect(await offered(w, w.technician, 'public', '%')).toEqual([]);

		for (let i = 0; i < 10; i++) await createViewer(w.organisation.id, 'technician', `Extra ${i}`);
		const all = await searchMentionables(w.technician, w.tag, 'internal', '');
		expect(all.ok && all.value).toHaveLength(8);
	});

	it('offers the portal the assignee and the staff who answered publicly, and nobody else', async () => {
		const w = await workspace();
		expect(await offered(w, w.employee, 'public')).toEqual([]);

		await assignTicket(w.admin, w.tag, w.technician.personId, w.deps);
		await say(w, w.colleague, 'Lo miro yo');
		await say(w, w.admin, 'Nota', 'internal');

		expect(await offered(w, w.employee, 'public')).toEqual(['Tess Tech', 'Theo Tech']);
		expect(await offered(w, w.employee, 'internal')).toEqual([]);
	});

	it('offers nothing to an employee who does not own the ticket', async () => {
		const w = await workspace();
		const outcome = await searchMentionables(w.other, w.tag, 'public', '');
		expect(outcome).toEqual({ ok: false, error: 'ticket_not_found' });
	});

	it('offers staff, and only staff, on the form that opens a ticket', async () => {
		const w = await workspace();
		expect(names(await searchStaffMentionables(w.technician, ''))).toEqual([
			'Ada Admin',
			'Theo Tech'
		]);
		expect(await searchStaffMentionables(w.employee, '')).toEqual([]);
	});

	it('leaves out people who left', async () => {
		const w = await workspace();
		const { people } = await import('../directory/schema');
		await getDb().update(people).set({ active: false }).where(eq(people.id, w.colleague.personId!));
		expect(await offered(w, w.technician, 'internal')).toEqual(['Ada Admin']);
	});
});

describe('notifying the people a comment names', () => {
	it('notifies a mentioned colleague, links the ticket and follows it', async () => {
		const w = await workspace();

		await say(w, w.technician, `Mira esto ${mention(w.colleague)}`, 'internal');

		const rows = await inbox();
		expect(rows).toHaveLength(1);
		expect(rows[0]).toMatchObject({
			recipientPersonId: w.colleague.personId,
			actorPersonId: w.technician.personId,
			type: 'mention',
			ticketId: w.ticketId
		});
		expect(rows[0].snapshot).toMatchObject({
			actorName: 'Tess Tech',
			excerpt: 'Mira esto @Theo Tech'
		});
		// The mentioned colleague follows, and so does the author (#57).
		expect((await followers()).map((row) => row.personId).sort()).toEqual(
			[w.colleague.personId, w.technician.personId].sort()
		);
	});

	it('does not notify an employee named by a forged token in an internal comment', async () => {
		const w = await workspace();

		const id = await say(w, w.technician, `Psst ${mention(w.employee)}`, 'internal');

		expect(await inbox()).toHaveLength(0);
		// Nobody was mentioned in effect; only the author follows (#57).
		expect((await followers()).map((row) => row.personId)).toEqual([w.technician.personId]);
		const thread = await ticketThread(w.employee, w.tag);
		expect(
			thread.ok && thread.value.some((item) => item.kind === 'comment' && item.id === id)
		).toBe(false);
	});

	it('does not notify somebody who could not see the ticket', async () => {
		const w = await workspace();
		await say(w, w.technician, `Hola ${mention(w.other)}`);
		expect((await inbox()).filter((row) => row.recipientPersonId === w.other.personId)).toEqual([]);
	});

	it('sends the assignee one mention, not a mention and a comment', async () => {
		const w = await workspace();
		await assignTicket(w.admin, w.tag, w.technician.personId, w.deps);
		const before = (await inbox()).length;

		await say(w, w.colleague, `Para ti ${mention(w.technician)}`);

		const fresh = (await inbox()).filter((row) => row.recipientPersonId === w.technician.personId);
		expect(fresh).toHaveLength(before + 1);
		expect(fresh.filter((row) => row.type === 'mention')).toHaveLength(1);
		expect(fresh.filter((row) => row.type === 'ticket.commented')).toHaveLength(0);
		// The requester is told of the reply, as before.
		expect((await inbox()).filter((row) => row.type === 'ticket.replied')).toHaveLength(1);
	});

	it('does not make a participant a follower, but a mentioned stranger one', async () => {
		const w = await workspace();
		await assignTicket(w.admin, w.tag, w.technician.personId, w.deps);

		await say(
			w,
			w.colleague,
			`${mention(w.employee)} ${mention(w.technician)} ${mention(w.admin)}`
		);

		const people = (await followers()).map((row) => row.personId);
		// The mentioned stranger, and the comment's author (#57); never the participants.
		expect(people.sort()).toEqual([w.admin.personId, w.colleague.personId].sort());
		// the requester is still told, as a mention
		const toRequester = (await inbox()).filter(
			(row) => row.recipientPersonId === w.employee.personId
		);
		expect(toRequester.map((row) => row.type)).toEqual(['mention']);
	});

	it('does not notify yourself', async () => {
		const w = await workspace();
		await say(w, w.technician, `Nota para mí ${mention(w.technician)}`, 'internal');
		expect(await inbox()).toHaveLength(0);
	});

	it('lets the portal mention the assignee', async () => {
		const w = await workspace();
		await assignTicket(w.admin, w.tag, w.technician.personId, w.deps);

		await say(w, w.employee, `${mention(w.technician)} ¿hay novedades?`);

		const mentions = (await inbox()).filter((row) => row.type === 'mention');
		expect(mentions.map((row) => row.recipientPersonId)).toEqual([w.technician.personId]);
	});

	it('mails the mentioned person', async () => {
		const w = await workspace();
		await say(w, w.technician, `Hola ${mention(w.colleague)}`);
		await new Promise((resolve) => setTimeout(resolve, 50));
		expect(w.sent.some((message) => message.to === w.colleague.email)).toBe(true);
	});
});

describe('editing a comment', () => {
	it('notifies only the people added by the edit', async () => {
		const w = await workspace();
		const id = await say(w, w.technician, `Hola ${mention(w.colleague)}`, 'internal');
		expect(await inbox()).toHaveLength(1);

		const outcome = await editComment(
			w.technician,
			id,
			`Hola ${mention(w.colleague)} y ${mention(w.admin)}`,
			w.deps
		);

		expect(outcome.ok).toBe(true);
		const rows = await inbox();
		expect(rows.map((row) => row.recipientPersonId).sort()).toEqual(
			[w.colleague.personId, w.admin.personId].sort()
		);
		expect(rows.filter((row) => row.recipientPersonId === w.admin.personId)).toHaveLength(1);
	});

	it('does not notify again when the edit keeps the same mentions', async () => {
		const w = await workspace();
		const id = await say(w, w.technician, `Hola ${mention(w.colleague)}`);
		await editComment(w.technician, id, `Hola de nuevo ${mention(w.colleague)}`, w.deps);
		expect((await inbox()).filter((row) => row.type === 'mention')).toHaveLength(1);
	});

	it('drops a forged mention added by an edit', async () => {
		const w = await workspace();
		const id = await say(w, w.technician, 'Nota', 'internal');
		await editComment(w.technician, id, `Nota ${mention(w.employee)}`, w.deps);
		expect(await inbox()).toHaveLength(0);
	});
});

describe('opening a ticket', () => {
	it('notifies the staff member named in the opening message', async () => {
		const w = await workspace();
		const outcome = await createTicket(
			w.technician,
			{
				subject: 'Cambio de monitor',
				body: `Para ${mention(w.colleague)}`,
				queueId: w.queue.id,
				requesterPersonId: w.employee.personId!
			},
			[],
			w.deps
		);
		if (!outcome.ok) throw new Error(outcome.error);

		const rows = (await inbox()).filter((row) => row.type === 'mention');
		expect(rows).toHaveLength(1);
		expect(rows[0]).toMatchObject({
			recipientPersonId: w.colleague.personId,
			ticketId: outcome.value.id
		});
		expect(rows[0].snapshot).toMatchObject({ code: outcome.value.ticketTag });
		const [row] = await getDb()
			.select()
			.from(follows)
			.where(and(eq(follows.ticketId, outcome.value.id)));
		expect(row.personId).toBe(w.colleague.personId);
	});

	it('ignores a token forged by an employee in the portal', async () => {
		const w = await workspace();
		const outcome = await createTicket(
			w.employee,
			{ subject: 'Otro', body: `Hola ${mention(w.admin)}`, queueId: w.queue.id },
			[],
			w.deps
		);
		expect(outcome.ok).toBe(true);
		expect((await inbox()).filter((row) => row.type === 'mention')).toHaveLength(0);
		const rows = await getDb().select({ id: tickets.id }).from(tickets);
		expect(rows.length).toBeGreaterThan(1);
	});
});
