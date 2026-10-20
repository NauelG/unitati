import { and, eq, sql } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { activity } from '../activity';
import { createOrganisation, createViewer } from '../assets/testing/fixtures';
import { getDb } from '../db';
import type { Mailer } from '../shared/mail';
import { addComment, createTicket, editComment, ticketThread } from './index';
import { ticketComments, tickets } from './schema';
import { InMemoryStorage } from '../shared/storage';
import { createQueue } from './testing/fixtures';

async function workspace() {
	const organisation = await createOrganisation();
	const technician = await createViewer(organisation.id, 'technician', 'Tess Tech');
	const employee = await createViewer(organisation.id, 'employee', 'Eve Employee');
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
	return { organisation, technician, employee, queue, deps, sent, tag: opened.value.ticketTag };
}

type W = Awaited<ReturnType<typeof workspace>>;

async function comments(w: W, viewer = w.technician) {
	const thread = await ticketThread(viewer, w.tag);
	if (!thread.ok) throw new Error(thread.error);
	return thread.value.flatMap((item) => (item.kind === 'comment' ? [item] : []));
}

const reply = async (
	w: W,
	author: W['employee'],
	body: string,
	visibility: 'public' | 'internal' = 'public'
) => {
	const outcome = await addComment(author, w.tag, { body, visibility }, [], w.deps);
	if (!outcome.ok) throw new Error(outcome.error);
	return outcome.value.commentId;
};

const editedActivity = (commentId: string) =>
	getDb()
		.select()
		.from(activity)
		.where(and(eq(activity.verb, 'comment.edited')))
		.then((rows) =>
			rows.filter((row) => (row.payload as { commentId: string }).commentId === commentId)
		);

describe('editing a comment', () => {
	it('lets the author edit it, stamps edited_at and records the activity', async () => {
		const w = await workspace();
		const id = await reply(w, w.employee, 'primero');

		const outcome = await editComment(w.employee, id, 'corregido');

		expect(outcome.ok).toBe(true);
		const edited = (await comments(w, w.employee)).find((c) => c.id === id);
		expect(edited).toMatchObject({ body: 'corregido', canEdit: true });
		expect(edited?.editedAt).toBeInstanceOf(Date);
		const rows = await editedActivity(id);
		expect(rows).toHaveLength(1);
		expect(rows[0].payload).toEqual({ commentId: id, visibility: 'public' });
	});

	it('refuses somebody who is not the author', async () => {
		const w = await workspace();
		const id = await reply(w, w.employee, 'mío');

		const outcome = await editComment(w.technician, id, 'ajeno');

		expect(outcome).toEqual({ ok: false, error: 'forbidden' });
		expect((await comments(w)).find((c) => c.id === id)).toMatchObject({
			body: 'mío',
			canEdit: false,
			editedAt: null
		});
	});

	it("lets a technician edit the requester's opening message", async () => {
		const w = await workspace();
		const [first] = await comments(w);
		expect(first.canEdit).toBe(true);

		const outcome = await editComment(w.technician, first.id, 'Descripción corregida');

		expect(outcome.ok).toBe(true);
		expect((await comments(w))[0]).toMatchObject({ body: 'Descripción corregida' });
	});

	it("does not let a technician edit a requester's later comment", async () => {
		const w = await workspace();
		const id = await reply(w, w.employee, 'otra cosa');

		expect(await editComment(w.technician, id, 'x')).toEqual({ ok: false, error: 'forbidden' });
	});

	it('does not let a requester edit the opening message through a technician exception', async () => {
		const w = await workspace();
		const [first] = await comments(w);

		// The requester wrote it, so the author rule applies; a different employee cannot see it.
		const stranger = await createViewer(w.organisation.id, 'employee', 'Oscar Other');
		expect(await editComment(stranger, first.id, 'x')).toEqual({ ok: false, error: 'not_found' });
	});

	it('hides an internal note from a requester: not found, never forbidden', async () => {
		const w = await workspace();
		const id = await reply(w, w.technician, 'nota', 'internal');

		expect(await editComment(w.employee, id, 'x')).toEqual({ ok: false, error: 'not_found' });
	});

	it('lets a technician edit their own internal note', async () => {
		const w = await workspace();
		const id = await reply(w, w.technician, 'nota', 'internal');

		expect((await editComment(w.technician, id, 'nota v2')).ok).toBe(true);
		expect((await editedActivity(id))[0].payload).toEqual({
			commentId: id,
			visibility: 'internal'
		});
	});

	it('is a no-op when the text is unchanged', async () => {
		const w = await workspace();
		const id = await reply(w, w.employee, 'igual');

		expect((await editComment(w.employee, id, 'igual')).ok).toBe(true);

		expect(await editedActivity(id)).toHaveLength(0);
		expect((await comments(w, w.employee)).find((c) => c.id === id)?.editedAt).toBeNull();
	});

	it('does not move the ticket in the "recently updated" order, nor send mail', async () => {
		const w = await workspace();
		const id = await reply(w, w.employee, 'typo');
		const read = async () => {
			const [row] = await getDb().select().from(tickets).where(eq(tickets.ticketTag, w.tag));
			return row.updatedAt.getTime();
		};
		const before = await read();
		w.sent.length = 0;

		await editComment(w.employee, id, 'sin typo');
		await new Promise((resolve) => setTimeout(resolve, 20));

		expect(await read()).toBe(before);
		expect(w.sent).toHaveLength(0);
	});

	it('does not list comment.edited in the thread', async () => {
		const w = await workspace();
		const id = await reply(w, w.employee, 'a');
		await editComment(w.employee, id, 'b');

		const thread = await ticketThread(w.technician, w.tag);
		expect(
			thread.ok && thread.value.some((i) => i.kind === 'event' && i.entry.verb === 'comment.edited')
		).toBe(false);
	});

	it('makes the new text searchable', async () => {
		const w = await workspace();
		const id = await reply(w, w.employee, 'texto original');
		await editComment(w.employee, id, 'reinstalar controlador');

		const [row] = await getDb()
			.select({ hit: ticketComments.id })
			.from(ticketComments)
			.where(
				and(
					eq(ticketComments.id, id),
					sql`${ticketComments.search} @@ plainto_tsquery('spanish', 'controlador')`
				)
			);
		expect(row?.hit).toBe(id);
	});

	it('refuses a body over the limit', async () => {
		const w = await workspace();
		const id = await reply(w, w.employee, 'corto');

		expect(await editComment(w.employee, id, 'x'.repeat(20_001))).toEqual({
			ok: false,
			error: 'body_too_long'
		});
	});
});
