import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import {
	createRequestForm,
	deleteQueue,
	deleteRequestForm,
	getActiveRequestForm,
	listActiveRequestForms,
	listRequestForms,
	listTickets,
	submitEquipmentRequest,
	updateRequestForm
} from '.';
import { createCatalogue, createOrganisation, createViewer } from '../assets/testing/fixtures';
import { getDb } from '../db';
import { requestedCategory } from '../links';
import { ticketCategory } from '../links/schema';
import { ticketComments, tickets } from './schema';
import { createQueue, createTicket } from './testing/fixtures';

/** #271: an employee asks for equipment through a request form. */

async function desk() {
	const organisation = await createOrganisation();
	const first = await createQueue(organisation.id, 'General');
	const hardware = await createQueue(organisation.id, 'Hardware');
	const technician = await createViewer(organisation.id, 'technician', 'Tess Tech');
	const employee = await createViewer(organisation.id, 'employee', 'Eve Employee');
	const laptops = await createCatalogue(organisation.id);
	const created = await createRequestForm(technician, {
		name: 'Request a laptop',
		kind: 'equipment',
		queueId: hardware.id
	});
	if (!created.ok) throw new Error(created.error);
	return { organisation, first, hardware, technician, employee, laptops, formId: created.value.id };
}

describe('submitEquipmentRequest', () => {
	it('files the ticket in the form queue, with the form, the category and the justification', async () => {
		const { employee, hardware, laptops, formId } = await desk();

		const outcome = await submitEquipmentRequest(employee, {
			formId,
			categoryId: laptops.categoryId,
			justification: 'My laptop died.',
			neededBy: '2026-11-03'
		});
		if (!outcome.ok) throw new Error(outcome.error);

		const [ticket] = await getDb().select().from(tickets).where(eq(tickets.id, outcome.value.id));
		expect(ticket).toMatchObject({
			queueId: hardware.id,
			requestFormId: formId,
			requesterPersonId: employee.personId,
			channel: 'portal',
			subject: 'Request a laptop: Laptops'
		});
		const [comment] = await getDb()
			.select()
			.from(ticketComments)
			.where(eq(ticketComments.ticketId, ticket.id));
		expect(comment.body).toContain('My laptop died.');
		expect(comment.body).toContain('2026-11-03');
		expect(await requestedCategory(employee.organisationId, ticket.id)).toEqual({
			id: laptops.categoryId,
			name: 'Laptops'
		});
	});

	it.each([
		['missing', ''],
		['blank', '   '],
		['too long', 'x'.repeat(2001)]
	])('refuses a %s justification and writes nothing', async (_name, justification) => {
		const { employee, laptops, formId } = await desk();

		const outcome = await submitEquipmentRequest(employee, {
			formId,
			categoryId: laptops.categoryId,
			justification
		});

		expect(outcome).toEqual({ ok: false, error: 'invalid_request' });
		expect(await getDb().select().from(tickets)).toHaveLength(0);
		expect(await getDb().select().from(ticketCategory)).toHaveLength(0);
	});

	it('accepts a justification of exactly 2000 characters', async () => {
		const { employee, laptops, formId } = await desk();
		const outcome = await submitEquipmentRequest(employee, {
			formId,
			categoryId: laptops.categoryId,
			justification: 'x'.repeat(2000)
		});
		expect(outcome.ok).toBe(true);
	});

	it('refuses an inactive form', async () => {
		const { technician, employee, laptops, formId, hardware } = await desk();
		await updateRequestForm(technician, formId, {
			name: 'Request a laptop',
			queueId: hardware.id,
			active: false
		});

		const outcome = await submitEquipmentRequest(employee, {
			formId,
			categoryId: laptops.categoryId,
			justification: 'Needed'
		});

		expect(outcome).toEqual({ ok: false, error: 'request_form_not_found' });
		expect(await getDb().select().from(tickets)).toHaveLength(0);
	});

	it("refuses another organisation's category and rolls the ticket back", async () => {
		const { employee, formId } = await desk();
		const other = await createOrganisation('Other', 'other');
		const foreign = await createCatalogue(other.id);

		const outcome = await submitEquipmentRequest(employee, {
			formId,
			categoryId: foreign.categoryId,
			justification: 'Needed'
		});

		expect(outcome).toEqual({ ok: false, error: 'category_not_found' });
		expect(await getDb().select().from(tickets)).toHaveLength(0);
	});

	it("refuses another organisation's form", async () => {
		const { laptops, formId } = await desk();
		const other = await createOrganisation('Other', 'other');
		const stranger = await createViewer(other.id, 'employee', 'Stan Stranger');

		const outcome = await submitEquipmentRequest(stranger, {
			formId,
			categoryId: laptops.categoryId,
			justification: 'Needed'
		});

		expect(outcome).toEqual({ ok: false, error: 'request_form_not_found' });
	});
});

describe('request form catalogue', () => {
	it('offers only active forms in the portal, and filters the list by form', async () => {
		const { technician, employee, hardware, first, laptops, formId } = await desk();
		const retired = await createRequestForm(technician, {
			name: 'Request a phone',
			kind: 'equipment',
			queueId: first.id
		});
		if (!retired.ok) throw new Error(retired.error);
		await updateRequestForm(technician, retired.value.id, {
			name: 'Request a phone',
			queueId: first.id,
			active: false
		});

		expect((await listActiveRequestForms(employee)).map((f) => f.name)).toEqual([
			'Request a laptop'
		]);
		expect((await listRequestForms(technician)).map((f) => f.name)).toEqual([
			'Request a laptop',
			'Request a phone'
		]);
		expect(await getActiveRequestForm(employee, retired.value.id)).toBeNull();

		await submitEquipmentRequest(employee, {
			formId,
			categoryId: laptops.categoryId,
			justification: 'Needed'
		});
		await createTicket(employee.organisationId, hardware.id, employee.personId!);

		const filtered = await listTickets(technician, { requestFormId: formId });
		expect(filtered.rows.map((t) => t.requestFormName)).toEqual(['Request a laptop']);
	});

	it('refuses a duplicate name', async () => {
		const { technician, hardware } = await desk();
		expect(
			await createRequestForm(technician, {
				name: 'Request a laptop',
				kind: 'equipment',
				queueId: hardware.id
			})
		).toEqual({ ok: false, error: 'duplicate_request_form_name' });
	});

	it('refuses to delete a form that has tickets, and deletes one that has none', async () => {
		const { technician, employee, laptops, formId, hardware } = await desk();
		await submitEquipmentRequest(employee, {
			formId,
			categoryId: laptops.categoryId,
			justification: 'Needed'
		});
		const spare = await createRequestForm(technician, {
			name: 'Spare',
			kind: 'equipment',
			queueId: hardware.id
		});
		if (!spare.ok) throw new Error(spare.error);

		expect(await deleteRequestForm(technician, formId)).toEqual({
			ok: false,
			error: 'request_form_in_use'
		});
		expect(await deleteRequestForm(technician, spare.value.id)).toEqual({
			ok: true,
			value: undefined
		});
	});

	it('refuses to delete a queue that a form targets', async () => {
		const { technician, hardware, first } = await desk();

		expect(await deleteQueue(technician, hardware.id)).toEqual({
			ok: false,
			error: 'queue_in_use'
		});
		expect((await deleteQueue(technician, first.id)).ok).toBe(true);
	});

	it('keeps a deactivated form routable: its queue still cannot be deleted', async () => {
		const { technician, hardware, formId } = await desk();
		await updateRequestForm(technician, formId, {
			name: 'Request a laptop',
			queueId: hardware.id,
			active: false
		});

		expect(await deleteQueue(technician, hardware.id)).toEqual({
			ok: false,
			error: 'queue_in_use'
		});
	});
});
