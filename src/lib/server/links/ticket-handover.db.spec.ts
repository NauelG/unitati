import { and, eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { decideHandover, deliver, ensureDefaultHandoverTemplates, takeBack } from '../assets';
import { assignCustody, setCategoryRequiresHandover } from '../assets';
import { handovers } from '../assets/schema';
import {
	createAsset,
	createCatalogue,
	createOrganisation,
	createPerson,
	createViewer
} from '../assets/testing/fixtures';
import { drawnSignature } from '../assets/testing/png';
import { getDb } from '../db';
import { flushEvents, resetSubscriptions, setDispatchMode, on } from '../shared/events';
import { InMemoryStorage } from '../shared/storage';
import { ticketComments, tickets } from '../service-desk/schema';
import { createQueue, createTicket } from '../service-desk/testing/fixtures';
import { notifyHandoverDecided } from './notify-handover-decided';
import { ticketHandover } from './schema';
import { linkHandover, linkHandoverByCode, relatedTo, unlinkHandover } from './index';

/** #279: a handover fulfils the ticket that asked for it, and tells it how it ended. */

beforeEach(() => {
	resetSubscriptions();
	setDispatchMode('sync');
	on('handover.accepted', notifyHandoverDecided);
	on('handover.rejected', notifyHandoverDecided);
});

afterEach(() => {
	resetSubscriptions();
	setDispatchMode('async');
});

const evidence = { ip: '203.0.113.7', userAgent: 'Mozilla/5.0' };
const deps = { storage: new InMemoryStorage(), mailer: null };

async function workspace() {
	const organisation = await createOrganisation();
	await ensureDefaultHandoverTemplates(getDb(), organisation.id);
	const technician = await createViewer(organisation.id, 'technician', 'Grace Hopper');
	const employee = await createViewer(organisation.id, 'employee', 'Eve Employee');
	const ada = await createPerson(organisation.id, 'Ada Lovelace');
	const laptops = await createCatalogue(organisation.id);
	await setCategoryRequiresHandover(
		await createViewer(organisation.id, 'admin', 'Root Admin'),
		laptops.categoryId,
		true
	);
	const queue = await createQueue(organisation.id);
	const ticket = await createTicket(organisation.id, queue.id, employee.personId!, {
		status: 'in_progress',
		assigneePersonId: technician.personId
	});
	const laptop = await createAsset(organisation.id, laptops.modelId, { name: 'Laptop' });

	async function deliverFromTicket(link: boolean) {
		const outcome = await deliver(
			technician,
			{ personId: ada.id, assetIds: [laptop.id] },
			{
				mailer: null,
				linkTo: (token) => token,
				afterIssue: link
					? (tx, handover) =>
							linkHandover(tx, technician, { ticketId: ticket.id, handoverId: handover.id }).then(
								() => undefined
							)
					: undefined
			}
		);
		if (!outcome.ok || outcome.value.handover?.status !== 'pending') throw new Error('setup');
		return outcome.value.handover;
	}

	return { organisation, technician, employee, ada, ticket, laptop, deliverFromTicket };
}

async function notesOf(ticketId: string) {
	return getDb().select().from(ticketComments).where(eq(ticketComments.ticketId, ticketId));
}

describe('delivering from a ticket', () => {
	it('links the handover in the same transaction, and the related panel shows its live state', async () => {
		const { technician, ticket, deliverFromTicket } = await workspace();

		const handover = await deliverFromTicket(true);

		const groups = await relatedTo(technician, { kind: 'ticket', id: ticket.id });
		const group = groups.find((g) => g.relation === 'fulfilled_by');
		expect(group?.items.map((item) => [item.ref.tag, item.status])).toEqual([
			[handover.code, 'pending']
		]);
	});

	it('shows a pending handover past its date as expired', async () => {
		const { technician, ticket, deliverFromTicket } = await workspace();
		const handover = await deliverFromTicket(true);
		await getDb()
			.update(handovers)
			.set({ expiresAt: new Date('2020-01-01T00:00:00Z') })
			.where(eq(handovers.id, handover.id));

		const groups = await relatedTo(technician, { kind: 'ticket', id: ticket.id });

		expect(groups.find((g) => g.relation === 'fulfilled_by')?.items[0]?.status).toBe('expired');
	});

	it('reads from the handover side too, and hides handovers from the requester', async () => {
		const { technician, employee, ticket, deliverFromTicket } = await workspace();
		const handover = await deliverFromTicket(true);

		const fromHandover = await relatedTo(technician, { kind: 'handover', id: handover.id });
		const asRequester = await relatedTo(employee, { kind: 'ticket', id: ticket.id });

		expect({
			tickets: fromHandover.flatMap((g) => g.items.map((item) => [g.relation, item.ref.tag])),
			requesterGroups: asRequester.map((g) => g.relation)
		}).toEqual({
			tickets: [['fulfils', ticket.ticketTag]],
			requesterGroups: []
		});
	});

	it('rolls the delivery back when the link cannot be made', async () => {
		const { technician, ada, laptop } = await workspace();

		const outcome = deliver(
			technician,
			{ personId: ada.id, assetIds: [laptop.id] },
			{
				mailer: null,
				afterIssue: async () => {
					throw new Error('no ticket');
				}
			}
		);

		await expect(outcome).rejects.toThrow('no ticket');
		expect(await getDb().select().from(handovers)).toEqual([]);
	});
});

describe('linking an existing handover', () => {
	it('links by code, once however many times it is asked, and unlinks', async () => {
		const { technician, ticket, deliverFromTicket } = await workspace();
		const handover = await deliverFromTicket(false);

		const first = await linkHandoverByCode(technician, {
			ticketId: ticket.id,
			code: handover.code.toLowerCase()
		});
		const second = await linkHandoverByCode(technician, {
			ticketId: ticket.id,
			code: handover.code
		});
		const rows = await getDb().select().from(ticketHandover);
		const removed = await unlinkHandover(technician, {
			ticketId: ticket.id,
			handoverId: handover.id
		});
		const again = await unlinkHandover(technician, {
			ticketId: ticket.id,
			handoverId: handover.id
		});

		expect({ first, second, links: rows.length, removed, again }).toEqual({
			first: { ok: true, value: undefined },
			second: { ok: true, value: undefined },
			links: 1,
			removed: { ok: true, value: undefined },
			again: { ok: false, error: 'not_linked' }
		});
	});

	it('refuses an unknown code, and anyone without tickets.manage', async () => {
		const { technician, employee, ticket, deliverFromTicket } = await workspace();
		const handover = await deliverFromTicket(false);

		expect({
			unknown: await linkHandoverByCode(technician, { ticketId: ticket.id, code: 'HND-9999' }),
			employee: await linkHandoverByCode(employee, { ticketId: ticket.id, code: handover.code }),
			unlink: await unlinkHandover(employee, { ticketId: ticket.id, handoverId: handover.id })
		}).toEqual({
			unknown: { ok: false, error: 'handover_not_found' },
			employee: { ok: false, error: 'forbidden' },
			unlink: { ok: false, error: 'forbidden' }
		});
	});
});

describe('a decided handover → internal note on its tickets', () => {
	it('accepting adds exactly one internal system note and leaves the ticket as it was', async () => {
		const { organisation, ticket, deliverFromTicket } = await workspace();
		const handover = await deliverFromTicket(true);

		await decideHandover(
			handover.token,
			'accept',
			{ ...evidence, signature: drawnSignature() },
			deps
		);
		await flushEvents();

		const notes = await notesOf(ticket.id);
		const [after] = await getDb().select().from(tickets).where(eq(tickets.id, ticket.id));
		expect({
			notes: notes.map((n) => [
				n.visibility,
				n.authorPersonId,
				n.organisationId === organisation.id
			]),
			mentionsCode: notes[0]?.body.includes(handover.code),
			status: after.status,
			assignee: after.assigneePersonId,
			queue: after.queueId
		}).toEqual({
			notes: [['internal', null, true]],
			mentionsCode: true,
			status: ticket.status,
			assignee: ticket.assigneePersonId,
			queue: ticket.queueId
		});
	});

	it('rejecting adds a note containing the reason', async () => {
		const { ticket, deliverFromTicket } = await workspace();
		const handover = await deliverFromTicket(true);

		await decideHandover(handover.token, 'reject', { ...evidence, reason: 'Wrong laptop' }, deps);
		await flushEvents();

		const notes = await notesOf(ticket.id);
		expect(notes).toHaveLength(1);
		expect(notes[0].body).toContain('Wrong laptop');
		expect(notes[0].body).toContain(handover.code);
	});

	it('does nothing, and nothing fails, for a handover no ticket asked for', async () => {
		const { ticket, deliverFromTicket } = await workspace();
		const handover = await deliverFromTicket(false);

		const outcome = await decideHandover(
			handover.token,
			'accept',
			{ ...evidence, signature: drawnSignature() },
			deps
		);
		await flushEvents();

		expect(outcome.ok).toBe(true);
		expect(await notesOf(ticket.id)).toEqual([]);
	});

	it('also notes the return handover of a take-back linked to the ticket', async () => {
		const { technician, ticket, ada, laptop } = await workspace();
		await assignCustody(technician, laptop.id, ada.id);
		const outcome = await takeBack(
			technician,
			ada.id,
			[{ assetId: laptop.id, condition: 'good' }],
			{
				mailer: null,
				linkTo: (token) => token,
				afterIssue: async (tx, handover) => {
					await linkHandover(tx, technician, { ticketId: ticket.id, handoverId: handover.id });
				}
			}
		);
		if (!outcome.ok || !outcome.value.handover) throw new Error('setup');

		await decideHandover(
			outcome.value.handover.token,
			'accept',
			{ ...evidence, signature: drawnSignature() },
			deps
		);
		await flushEvents();

		const rows = await getDb()
			.select()
			.from(ticketHandover)
			.where(and(eq(ticketHandover.ticketId, ticket.id)));
		expect({ links: rows.length, notes: (await notesOf(ticket.id)).length }).toEqual({
			links: 1,
			notes: 1
		});
	});
});
