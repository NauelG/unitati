import { eq } from 'drizzle-orm';
import { describe, expect, it, vi } from 'vitest';
import { getDb } from '../db';
import { activity } from '../activity';
import { ticketAsset } from '../links';
import { tickets } from './schema';
import {
	createAsset,
	createCatalogue,
	createOrganisation,
	createPerson,
	createViewer,
	createViewerWithoutPerson
} from '../assets/testing/fixtures';
import type { Mailer } from './mail';
import {
	addComment,
	assignTicket,
	changeTicketStatus,
	createQueue,
	createTicket,
	deleteQueue,
	getAttachment,
	getTicketByTag,
	listTickets,
	moveTicketToQueue,
	setTicketPriority,
	ticketThread,
	type UploadedFile
} from './index';
import { InMemoryStorage } from './storage';
import { createQueue as insertQueue } from './testing/fixtures';

async function workspace() {
	const organisation = await createOrganisation();
	const technician = await createViewer(organisation.id, 'technician', 'Tess Tech');
	const employee = await createViewer(organisation.id, 'employee', 'Eve Employee');
	const other = await createViewer(organisation.id, 'employee', 'Oscar Other');
	const queue = await insertQueue(organisation.id, 'Hardware');
	const sent: Parameters<Mailer['send']>[0][] = [];
	const deps = {
		storage: new InMemoryStorage(),
		mailer: { send: async (message) => void sent.push(message) } satisfies Mailer
	};
	return { organisation, technician, employee, other, queue, deps, sent };
}

const open = async (w: Awaited<ReturnType<typeof workspace>>, actor = w.employee) => {
	const outcome = await createTicket(
		actor,
		{ subject: 'La impresora no responde', body: 'Se queda en cola', queueId: w.queue.id },
		[],
		w.deps
	);
	if (!outcome.ok) throw new Error(outcome.error);
	return outcome.value;
};

/** Mail is fire-and-forget; let its promise settle before asserting. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 20));

describe('opening a ticket', () => {
	it('stores an employee ticket as themselves, via the portal, with the body as first comment', async () => {
		const w = await workspace();
		const { ticketTag } = await open(w);

		const ticket = await getTicketByTag(w.employee, ticketTag);
		const thread = await ticketThread(w.employee, ticketTag);

		expect(ticket).toMatchObject({
			ok: true,
			value: { channel: 'portal', requesterPersonId: w.employee.personId, status: 'new' }
		});
		expect(thread.ok && thread.value.filter((item) => item.kind === 'comment')).toHaveLength(1);
	});

	it('ignores a requester an employee posts for somebody else', async () => {
		const w = await workspace();

		const outcome = await createTicket(
			w.employee,
			{
				subject: 'Spoof',
				body: 'x',
				queueId: w.queue.id,
				requesterPersonId: w.other.personId!,
				priority: 'urgent'
			},
			[],
			w.deps
		);

		expect(outcome.ok).toBe(true);
		const ticket = await getTicketByTag(w.employee, outcome.ok ? outcome.value.ticketTag : '');
		expect(ticket).toMatchObject({
			value: { requesterPersonId: w.employee.personId, priority: 'normal' }
		});
	});

	it('lets a technician name the requester; it shows in that person’s portal as an agent ticket', async () => {
		const w = await workspace();

		const outcome = await createTicket(
			w.technician,
			{
				subject: 'Por teléfono',
				body: 'Llamó',
				queueId: w.queue.id,
				requesterPersonId: w.other.personId!
			},
			[],
			w.deps
		);

		expect(outcome.ok).toBe(true);
		const page = await listTickets(w.other);
		expect(page.rows.map((row) => [row.channel, row.requesterPersonId])).toEqual([
			['agent', w.other.personId]
		]);
	});

	it('rejects a missing queue before the database', async () => {
		const w = await workspace();

		await expect(
			createTicket(w.employee, { subject: 'x', body: 'y' } as never, [], w.deps)
		).rejects.toThrow();
		expect(await getDb().select().from(activity)).toHaveLength(0);
	});

	it('refuses another organisation’s queue', async () => {
		const w = await workspace();
		const foreign = await createOrganisation('Other', 'other');
		const foreignQueue = await insertQueue(foreign.id, 'Theirs');

		const outcome = await createTicket(
			w.employee,
			{ subject: 'x', body: 'y', queueId: foreignQueue.id },
			[],
			w.deps
		);

		expect(outcome).toEqual({ ok: false, error: 'queue_not_found' });
	});

	it('refuses to open a ticket for a credential with no directory record', async () => {
		const w = await workspace();
		const ghost = await createViewerWithoutPerson(w.organisation.id, 'employee');

		const outcome = await createTicket(
			ghost,
			{ subject: 'x', body: 'y', queueId: w.queue.id },
			[],
			w.deps
		);

		expect(outcome).toEqual({ ok: false, error: 'requester_required' });
	});

	it('records ticket.created in the same transaction', async () => {
		const w = await workspace();
		const { id } = await open(w);

		const rows = await getDb().select().from(activity).where(eq(activity.ticketId, id));

		expect(rows.map((row) => row.verb)).toEqual(['ticket.created']);
	});
});

describe('opening a ticket about assets', () => {
	async function withAssets() {
		const w = await workspace();
		const { modelId } = await createCatalogue(w.organisation.id);
		const mine = await createAsset(w.organisation.id, modelId, {
			assetTag: 'AST-0001',
			custodianPersonId: w.employee.personId
		});
		const printer = await createAsset(w.organisation.id, modelId, {
			assetTag: 'AST-0002',
			name: 'Floor printer',
			shared: true
		});
		const stranger = await createAsset(w.organisation.id, modelId, {
			assetTag: 'AST-0003',
			custodianPersonId: w.other.personId
		});
		return { w, mine, printer, stranger };
	}

	const input = (w: Awaited<ReturnType<typeof workspace>>, assetIds: string[]) => ({
		subject: 'La impresora no responde',
		body: 'Se queda en cola',
		queueId: w.queue.id,
		assetIds
	});

	it('links every asset picked, and says so in the ticket thread', async () => {
		const { w, mine, printer } = await withAssets();

		const outcome = await createTicket(w.employee, input(w, [mine.id, printer.id]), [], w.deps);
		if (!outcome.ok) throw new Error(outcome.error);

		const links = await getDb().select().from(ticketAsset);
		const thread = await ticketThread(w.technician, outcome.value.ticketTag);
		const linked = thread.ok
			? thread.value.flatMap((item) =>
					item.kind === 'event' && item.entry.verb === 'link.asset.added'
						? [item.entry.payload.assetTag]
						: []
				)
			: [];

		expect({ linked: links.map((link) => link.assetId).sort(), thread: linked.sort() }).toEqual({
			linked: [mine.id, printer.id].sort(),
			thread: ['AST-0001', 'AST-0002']
		});
	});

	it('opens a ticket with no assets exactly as before', async () => {
		const { w } = await withAssets();

		const outcome = await createTicket(w.employee, input(w, []), [], w.deps);

		expect(outcome.ok).toBe(true);
		expect(await getDb().select().from(ticketAsset)).toHaveLength(0);
	});

	it('links an asset once however many times the form posted it', async () => {
		const { w, mine } = await withAssets();

		const outcome = await createTicket(w.employee, input(w, [mine.id, mine.id]), [], w.deps);

		expect(outcome.ok).toBe(true);
		expect(await getDb().select().from(ticketAsset)).toHaveLength(1);
	});

	it('refuses an asset the employee may not attach, even by id, and opens nothing', async () => {
		const { w, mine, stranger } = await withAssets();
		const kept: string[] = [];
		const deleted: string[] = [];
		const storage = {
			put: async (key: string) => void kept.push(key),
			get: async () => null,
			delete: async (key: string) => void deleted.push(key)
		};
		const file: UploadedFile = {
			filename: 'captura.png',
			contentType: 'image/png',
			data: new Uint8Array([1, 2, 3])
		};

		const outcome = await createTicket(w.employee, input(w, [mine.id, stranger.id]), [file], {
			...w.deps,
			storage
		});

		expect({
			outcome,
			tickets: (await getDb().select().from(tickets)).length,
			links: (await getDb().select().from(ticketAsset)).length,
			entries: (await getDb().select().from(activity)).length,
			orphanedFiles: kept.filter((key) => !deleted.includes(key))
		}).toEqual({
			outcome: { ok: false, error: 'asset_not_found' },
			tickets: 0,
			links: 0,
			entries: 0,
			orphanedFiles: []
		});
	});

	it('lets staff attach any asset to a ticket they open for somebody', async () => {
		const { w, stranger } = await withAssets();

		const outcome = await createTicket(
			w.technician,
			{ ...input(w, [stranger.id]), requesterPersonId: w.employee.personId! },
			[],
			w.deps
		);

		expect(outcome.ok).toBe(true);
		expect(await getDb().select().from(ticketAsset)).toHaveLength(1);
	});

	it('rejects an absurd number of assets before the database', async () => {
		const { w } = await withAssets();
		const ids = Array.from({ length: 21 }, () => crypto.randomUUID());

		await expect(createTicket(w.employee, input(w, ids), [], w.deps)).rejects.toThrow();
	});
});

describe('the status workflow', () => {
	it('refuses new → closed with a typed failure, not an exception', async () => {
		const w = await workspace();
		const { ticketTag } = await open(w);

		const outcome = await changeTicketStatus(w.technician, ticketTag, 'closed', w.deps);

		expect(outcome).toEqual({ ok: false, error: 'invalid_transition' });
	});

	it('allows reopening a closed ticket and records it as a status change', async () => {
		const w = await workspace();
		const { id, ticketTag } = await open(w);
		for (const to of ['in_progress', 'resolved', 'closed', 'in_progress'] as const) {
			expect(await changeTicketStatus(w.technician, ticketTag, to, w.deps)).toMatchObject({
				ok: true
			});
		}

		const verbs = await getDb().select().from(activity).where(eq(activity.ticketId, id));
		const changes = verbs.filter((row) => row.verb === 'ticket.status.changed');

		expect(changes).toHaveLength(4);
		expect(changes.at(-1)?.payload).toEqual({ from: 'closed', to: 'in_progress' });
	});

	it('mails the requester on resolved, once', async () => {
		const w = await workspace();
		const { ticketTag } = await open(w);
		await changeTicketStatus(w.technician, ticketTag, 'in_progress', w.deps);
		await changeTicketStatus(w.technician, ticketTag, 'resolved', w.deps);
		await settle();

		expect(w.sent.map((message) => message.to)).toEqual(['eve.employee@acme.test']);
	});
});

describe('comments and the internal-note boundary', () => {
	it('never delivers an internal note to the requester', async () => {
		const w = await workspace();
		const { ticketTag } = await open(w);
		await addComment(
			w.technician,
			ticketTag,
			{ body: 'SECRETO interno', visibility: 'internal' },
			[],
			w.deps
		);
		await addComment(
			w.technician,
			ticketTag,
			{ body: 'Ya está arreglado', visibility: 'public' },
			[],
			w.deps
		);

		const asEmployee = await ticketThread(w.employee, ticketTag);
		const asTechnician = await ticketThread(w.technician, ticketTag);

		expect(JSON.stringify(asEmployee)).not.toContain('SECRETO');
		expect(JSON.stringify(asEmployee)).toContain('Ya está arreglado');
		expect(JSON.stringify(asTechnician)).toContain('SECRETO');
	});

	it('hides staff-only events from the requester', async () => {
		const w = await workspace();
		const { ticketTag } = await open(w);
		await assignTicket(w.technician, ticketTag, w.technician.personId);
		await setTicketPriority(w.technician, ticketTag, 'urgent');

		const thread = await ticketThread(w.employee, ticketTag);
		const verbs = thread.ok
			? thread.value.flatMap((item) => (item.kind === 'event' ? [item.entry.verb] : []))
			: [];

		expect(verbs).toEqual(['ticket.created']);
	});

	it('refuses an internal note from an employee', async () => {
		const w = await workspace();
		const { ticketTag } = await open(w);

		const outcome = await addComment(
			w.employee,
			ticketTag,
			{ body: 'x', visibility: 'internal' },
			[],
			w.deps
		);

		expect(outcome).toEqual({ ok: false, error: 'internal_not_allowed' });
	});

	it('does not let an employee answer someone else’s ticket', async () => {
		const w = await workspace();
		const { ticketTag } = await open(w);

		const outcome = await addComment(
			w.other,
			ticketTag,
			{ body: 'x', visibility: 'public' },
			[],
			w.deps
		);

		expect(outcome).toEqual({ ok: false, error: 'ticket_not_found' });
	});

	it('mails the requester on a public technician answer, and not on an internal note', async () => {
		const w = await workspace();
		const { ticketTag } = await open(w);

		await addComment(w.technician, ticketTag, { body: 'nota', visibility: 'internal' }, [], w.deps);
		await addComment(
			w.technician,
			ticketTag,
			{ body: 'respuesta', visibility: 'public' },
			[],
			w.deps
		);
		await settle();

		expect(w.sent).toHaveLength(1);
	});

	it('still saves the comment and returns when SMTP is down', async () => {
		const w = await workspace();
		const { ticketTag } = await open(w);
		const error = vi.spyOn(console, 'error').mockImplementation(() => {});
		const deps = {
			...w.deps,
			mailer: { send: () => Promise.reject(new Error('ECONNREFUSED')) } satisfies Mailer
		};

		const outcome = await addComment(
			w.technician,
			ticketTag,
			{ body: 'respuesta', visibility: 'public' },
			[],
			deps
		);
		await settle();

		expect(outcome.ok).toBe(true);
		const thread = await ticketThread(w.technician, ticketTag);
		expect(thread.ok && thread.value.filter((item) => item.kind === 'comment')).toHaveLength(2);
		expect(error).toHaveBeenCalled();
		error.mockRestore();
	});
});

describe('attachments', () => {
	const file: UploadedFile = {
		filename: 'captura.png',
		contentType: 'image/png',
		data: new Uint8Array([1, 2, 3])
	};

	async function withAttachment() {
		const w = await workspace();
		const { ticketTag } = await open(w);
		await addComment(
			w.technician,
			ticketTag,
			{ body: 'mira', visibility: 'public' },
			[file],
			w.deps
		);
		const thread = await ticketThread(w.employee, ticketTag);
		const comment = thread.ok
			? thread.value.find((item) => item.kind === 'comment' && item.attachments.length)
			: null;
		const attachmentId = comment?.kind === 'comment' ? comment.attachments[0].id : '';
		return { w, ticketTag, attachmentId };
	}

	it('is retrievable by someone who can read the comment', async () => {
		const { w, attachmentId } = await withAttachment();

		const outcome = await getAttachment(w.employee, attachmentId, w.deps);

		expect(outcome).toMatchObject({ ok: true, value: { filename: 'captura.png' } });
	});

	it('is not found from another organisation', async () => {
		const { w, attachmentId } = await withAttachment();
		const foreign = await createOrganisation('Other', 'other');
		const stranger = await createViewer(foreign.id, 'technician', 'Sam Stranger');

		expect(await getAttachment(stranger, attachmentId, w.deps)).toEqual({
			ok: false,
			error: 'attachment_not_found'
		});
	});

	it('is not found by an employee when it hangs off an internal note', async () => {
		const w = await workspace();
		const { ticketTag } = await open(w);
		await addComment(
			w.technician,
			ticketTag,
			{ body: 'interno', visibility: 'internal' },
			[file],
			w.deps
		);
		const thread = await ticketThread(w.technician, ticketTag);
		const note = thread.ok
			? thread.value.find((item) => item.kind === 'comment' && item.attachments.length)
			: null;
		const id = note?.kind === 'comment' ? note.attachments[0].id : '';

		expect(await getAttachment(w.employee, id, w.deps)).toEqual({
			ok: false,
			error: 'attachment_not_found'
		});
	});

	it('refuses too many files', async () => {
		const w = await workspace();
		const { ticketTag } = await open(w);

		const outcome = await addComment(
			w.technician,
			ticketTag,
			{ body: 'x', visibility: 'public' },
			Array.from({ length: 6 }, () => file),
			w.deps
		);

		expect(outcome).toEqual({ ok: false, error: 'attachments_too_many' });
	});
});

describe('visibility and staff writes', () => {
	it('lists only an employee’s own tickets, and staff see all', async () => {
		const w = await workspace();
		await open(w, w.employee);
		await open(w, w.other);

		expect((await listTickets(w.employee)).total).toBe(1);
		expect((await listTickets(w.technician)).total).toBe(2);
	});

	it('finds a ticket by Spanish stem, "impresoras" → "impresora"', async () => {
		const w = await workspace();
		await open(w);

		const page = await listTickets(w.technician, { search: 'impresoras' });

		expect(page.total).toBe(1);
	});

	it('does not search an employee into internal notes', async () => {
		const w = await workspace();
		const { ticketTag } = await open(w);
		await addComment(
			w.technician,
			ticketTag,
			{ body: 'reiniciar el spooler', visibility: 'internal' },
			[],
			w.deps
		);

		expect((await listTickets(w.employee, { search: 'spooler' })).total).toBe(0);
		expect((await listTickets(w.technician, { search: 'spooler' })).total).toBe(1);
	});

	it('records assignment, unassignment, priority and queue changes with snapshots', async () => {
		const w = await workspace();
		const { id, ticketTag } = await open(w);
		const other = await createQueue(w.technician, { name: 'Redes' });

		await assignTicket(w.technician, ticketTag, w.technician.personId);
		await assignTicket(w.technician, ticketTag, null);
		await setTicketPriority(w.technician, ticketTag, 'high');
		await moveTicketToQueue(w.technician, ticketTag, other.ok ? other.value.id : '');

		const rows = await getDb().select().from(activity).where(eq(activity.ticketId, id));
		expect(rows.map((row) => row.verb).sort()).toEqual(
			[
				'ticket.created',
				'ticket.assigned',
				'ticket.unassigned',
				'ticket.priority.changed',
				'ticket.queue.changed'
			].sort()
		);
	});

	it('refuses to assign someone from another organisation', async () => {
		const w = await workspace();
		const { ticketTag } = await open(w);
		const foreign = await createOrganisation('Other', 'other');
		const stranger = await createPerson(foreign.id, 'Sam Stranger');

		expect(await assignTicket(w.technician, ticketTag, stranger.id)).toEqual({
			ok: false,
			error: 'assignee_not_found'
		});
	});

	it('refuses to delete a queue that has tickets', async () => {
		const w = await workspace();
		await open(w);

		expect(await deleteQueue(w.technician, w.queue.id)).toEqual({
			ok: false,
			error: 'queue_in_use'
		});
	});
});
