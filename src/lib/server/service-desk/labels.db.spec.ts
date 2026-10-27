import { asc, eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import {
	createLabel,
	deleteLabel,
	listLabels,
	setLabelActive,
	getTicketByTag,
	setTicketLabels,
	ticketLabelsOf,
	ticketThread,
	updateLabel
} from '.';
import { createOrganisation, createViewer } from '../assets/testing/fixtures';
import { getDb } from '../db';
import { activity } from '../activity/schema';
import { createQueue, createTicket } from './testing/fixtures';

/** #391: labels on tickets, at the service-desk domain seam. */

async function desk() {
	const organisation = await createOrganisation();
	const technician = await createViewer(organisation.id, 'technician', 'Tess Tech');
	const employee = await createViewer(organisation.id, 'employee', 'Eve Employee');
	const queue = await createQueue(organisation.id);
	const ticket = await createTicket(organisation.id, queue.id, employee.personId!);
	return { organisation, technician, employee, queue, ticket };
}

async function label(actor: Parameters<typeof createLabel>[0], name: string) {
	const outcome = await createLabel(actor, { name });
	if (!outcome.ok) throw new Error(outcome.error);
	return { id: outcome.value.id, name };
}

const entries = (ticketId: string) =>
	getDb()
		.select()
		.from(activity)
		.where(eq(activity.ticketId, ticketId))
		.orderBy(asc(activity.occurredAt));

const changes = async (ticketId: string) =>
	(await entries(ticketId)).filter((entry) => entry.verb === 'ticket.labels.changed');

describe('the label catalogue', () => {
	it('refuses a name that differs only in case or padding, and accepts it in another organisation', async () => {
		const { technician } = await desk();
		await label(technician, 'vpn');

		expect(await createLabel(technician, { name: 'VPN' })).toEqual({
			ok: false,
			error: 'duplicate_label_name'
		});
		expect(await createLabel(technician, { name: '  Vpn ' })).toEqual({
			ok: false,
			error: 'duplicate_label_name'
		});

		const elsewhere = await createOrganisation('Other', 'other');
		const stranger = await createViewer(elsewhere.id, 'technician', 'Olga Other');
		expect((await createLabel(stranger, { name: 'VPN' })).ok).toBe(true);
	});

	it('refuses a rename onto an existing name but lets a label change its own case', async () => {
		const { technician } = await desk();
		const vpn = await label(technician, 'vpn');
		const audit = await label(technician, 'audit');

		expect(await updateLabel(technician, audit.id, { name: 'VPN' })).toEqual({
			ok: false,
			error: 'duplicate_label_name'
		});
		expect((await updateLabel(technician, vpn.id, { name: 'VPN' })).ok).toBe(true);
	});

	it.each([
		['an empty name', { name: '   ' }],
		['a 51-character name', { name: 'x'.repeat(51) }],
		['a 201-character description', { name: 'ok', description: 'x'.repeat(201) }],
		['a colour outside the palette', { name: 'ok', color: 'chartreuse' as never }]
	])('refuses %s', async (_case, input) => {
		const { technician } = await desk();

		expect(await createLabel(technician, input)).toEqual({ ok: false, error: 'invalid_label' });
		expect(await listLabels(technician)).toHaveLength(0);
	});

	it('accepts the bounds: a 50-character name and a 200-character description', async () => {
		const { technician } = await desk();

		const outcome = await createLabel(technician, {
			name: 'x'.repeat(50),
			description: 'y'.repeat(200),
			color: 'teal'
		});

		expect(outcome.ok).toBe(true);
		expect(await listLabels(technician)).toMatchObject([{ color: 'teal', active: true }]);
	});

	it('lists alphabetically without regard to case, archived ones included', async () => {
		const { technician } = await desk();
		await label(technician, 'onboarding');
		const archived = await label(technician, 'Audit');
		await label(technician, 'vpn');
		await setLabelActive(technician, archived.id, false);

		const listed = await listLabels(technician);

		expect(listed.map((entry) => [entry.name, entry.active])).toEqual([
			['Audit', false],
			['onboarding', true],
			['vpn', true]
		]);
	});

	it('stores no description rather than an empty one', async () => {
		const { technician } = await desk();
		const created = await createLabel(technician, { name: 'vpn', description: '   ' });
		if (!created.ok) throw new Error(created.error);

		expect((await listLabels(technician))[0].description).toBeNull();
	});

	it('does not touch a label of another organisation', async () => {
		const { technician } = await desk();
		const elsewhere = await createOrganisation('Other', 'other');
		const stranger = await createViewer(elsewhere.id, 'technician', 'Olga Other');
		const foreign = await label(stranger, 'secret');

		expect(await updateLabel(technician, foreign.id, { name: 'mine' })).toEqual({
			ok: false,
			error: 'label_not_found'
		});
		expect(await setLabelActive(technician, foreign.id, false)).toEqual({
			ok: false,
			error: 'label_not_found'
		});
		expect(await deleteLabel(technician, foreign.id)).toEqual({
			ok: false,
			error: 'label_not_found'
		});
		expect(await listLabels(stranger)).toMatchObject([{ name: 'secret', active: true }]);
	});

	it('refuses deleting a label on a ticket and keeps it, then deletes an unused one', async () => {
		const { technician, ticket } = await desk();
		const used = await label(technician, 'vpn');
		const unused = await label(technician, 'audit');
		await setTicketLabels(technician, ticket.ticketTag, [used.id]);

		expect(await deleteLabel(technician, used.id)).toEqual({ ok: false, error: 'label_in_use' });
		expect((await listLabels(technician)).map((entry) => entry.name)).toContain('vpn');

		expect((await deleteLabel(technician, unused.id)).ok).toBe(true);
		expect((await listLabels(technician)).map((entry) => entry.name)).toEqual(['vpn']);
	});

	it('propagates a rename to the tickets that carry the label', async () => {
		const { technician, ticket } = await desk();
		const vpn = await label(technician, 'vpn');
		await setTicketLabels(technician, ticket.ticketTag, [vpn.id]);

		await updateLabel(technician, vpn.id, { name: 'VPN corporativa' });

		const onTicket = await ticketLabelsOf(technician.organisationId, ticket.id);
		expect(onTicket.map((entry) => entry.name)).toEqual(['VPN corporativa']);
	});
});

describe('setTicketLabels', () => {
	it('writes one activity for a save that adds two and removes one, with ids and names', async () => {
		const { technician, ticket } = await desk();
		const vpn = await label(technician, 'vpn');
		const audit = await label(technician, 'audit');
		const onboarding = await label(technician, 'onboarding');
		await setTicketLabels(technician, ticket.ticketTag, [vpn.id]);

		const outcome = await setTicketLabels(technician, ticket.ticketTag, [audit.id, onboarding.id]);

		expect(outcome.ok).toBe(true);
		const written = await changes(ticket.id);
		expect(written).toHaveLength(2);
		expect(written[1].payload).toEqual({
			added: expect.arrayContaining([audit, onboarding]),
			removed: [vpn]
		});
		expect((written[1].payload as { added: unknown[] }).added).toHaveLength(2);
		expect(
			(await ticketLabelsOf(technician.organisationId, ticket.id)).map((entry) => entry.name)
		).toEqual(['audit', 'onboarding']);
	});

	it('writes nothing for a save that changes nothing', async () => {
		const { technician, ticket } = await desk();
		const vpn = await label(technician, 'vpn');
		await setTicketLabels(technician, ticket.ticketTag, [vpn.id]);

		expect((await setTicketLabels(technician, ticket.ticketTag, [vpn.id, vpn.id])).ok).toBe(true);
		expect((await setTicketLabels(technician, ticket.ticketTag, [vpn.id])).ok).toBe(true);

		expect(await changes(ticket.id)).toHaveLength(1);
	});

	it('refuses adding an archived label, and removes one the ticket already has', async () => {
		const { technician, ticket, queue, employee } = await desk();
		const vpn = await label(technician, 'vpn');
		const old = await label(technician, 'old');
		await setTicketLabels(technician, ticket.ticketTag, [old.id]);
		await setLabelActive(technician, vpn.id, false);
		await setLabelActive(technician, old.id, false);
		const elsewhere = await createTicket(technician.organisationId, queue.id, employee.personId!);

		expect(await setTicketLabels(technician, elsewhere.ticketTag, [vpn.id])).toEqual({
			ok: false,
			error: 'label_archived'
		});
		expect(await ticketLabelsOf(technician.organisationId, elsewhere.id)).toHaveLength(0);

		// Keeping an archived label is not adding it; saving without it removes it.
		expect((await setTicketLabels(technician, ticket.ticketTag, [old.id])).ok).toBe(true);
		expect((await setTicketLabels(technician, ticket.ticketTag, [])).ok).toBe(true);
		expect(await ticketLabelsOf(technician.organisationId, ticket.id)).toHaveLength(0);
	});

	it('refuses a label of another organisation and applies nothing', async () => {
		const { technician, ticket } = await desk();
		const mine = await label(technician, 'mine');
		const elsewhere = await createOrganisation('Other', 'other');
		const stranger = await createViewer(elsewhere.id, 'technician', 'Olga Other');
		const foreign = await label(stranger, 'foreign');

		expect(await setTicketLabels(technician, ticket.ticketTag, [mine.id, foreign.id])).toEqual({
			ok: false,
			error: 'label_not_found'
		});
		expect(await ticketLabelsOf(technician.organisationId, ticket.id)).toHaveLength(0);
		expect(await changes(ticket.id)).toHaveLength(0);
	});

	it('answers ticket_not_found for another organisation ticket', async () => {
		const { ticket } = await desk();
		const elsewhere = await createOrganisation('Other', 'other');
		const stranger = await createViewer(elsewhere.id, 'technician', 'Olga Other');

		expect(await setTicketLabels(stranger, ticket.ticketTag, [])).toEqual({
			ok: false,
			error: 'ticket_not_found'
		});
	});

	it('applies to a ticket in any status, closed included', async () => {
		const { technician, organisation, queue, employee } = await desk();
		const closed = await createTicket(organisation.id, queue.id, employee.personId!, {
			status: 'closed'
		});
		const vpn = await label(technician, 'vpn');

		expect((await setTicketLabels(technician, closed.ticketTag, [vpn.id])).ok).toBe(true);
	});
});

describe('labels and the requester', () => {
	it('keeps labels out of what a requester is sent, thread and ticket alike', async () => {
		const { technician, employee, ticket } = await desk();
		const secret = await label(technician, 'usuario-conflictivo');
		await setTicketLabels(technician, ticket.ticketTag, [secret.id]);

		const staffThread = await ticketThread(technician, ticket.ticketTag);
		const portalThread = await ticketThread(employee, ticket.ticketTag);
		const portalTicket = await getTicketByTag(employee, ticket.ticketTag);
		if (!staffThread.ok || !portalThread.ok || !portalTicket.ok) throw new Error('fixture failed');

		expect(
			staffThread.value.some(
				(item) => item.kind === 'event' && item.entry.verb === 'ticket.labels.changed'
			)
		).toBe(true);
		expect(JSON.stringify(portalThread.value)).not.toContain('usuario-conflictivo');
		expect(JSON.stringify(portalThread.value)).not.toContain('labels');
		expect(JSON.stringify(portalTicket.value)).not.toContain('usuario-conflictivo');
	});
});
