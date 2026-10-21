import { describe, expect, it } from 'vitest';
import { createOrganisation, createViewer } from '#lib/server/assets/testing/fixtures.js';
import { assignTicket } from '#lib/server/service-desk/index.js';
import { createQueue, createTicket } from '#lib/server/service-desk/testing/fixtures.js';
import { GET as portalGet } from '../../../(portal)/portal/tickets/[tag]/mentions/+server';
import { GET as newGet } from '../new/mentions/+server';
import { GET as staffGet } from './mentions/+server';

async function workspace() {
	const organisation = await createOrganisation();
	const admin = await createViewer(organisation.id, 'admin', 'Ada Admin');
	const technician = await createViewer(organisation.id, 'technician', 'Tess Tech');
	const employee = await createViewer(organisation.id, 'employee', 'Eve Employee');
	const stranger = await createViewer(organisation.id, 'employee', 'Sam Stranger');
	const queue = await createQueue(organisation.id);
	const ticket = await createTicket(organisation.id, queue.id, employee.personId!);
	return { admin, technician, employee, stranger, ticket };
}

const call = async (handler: unknown, user: unknown, tag: string, search: string) => {
	const response = await (handler as (event: never) => Promise<Response>)({
		locals: { user },
		params: { tag },
		url: new URL(`http://localhost/x?${search}`)
	} as never);
	return (await response.json()) as { id: string; label: string; hint: string }[];
};

const labels = (rows: { label: string }[]) => rows.map((row) => row.label);

describe('GET /service-desk/[tag]/mentions', () => {
	it('offers staff to staff in an internal comment, with an email hint', async () => {
		const w = await workspace();
		const rows = await call(
			staffGet,
			w.technician,
			w.ticket.ticketTag,
			'visibility=internal&q=ada'
		);
		expect(rows).toEqual([
			{ id: w.admin.personId, label: 'Ada Admin', hint: 'ada.admin@acme.test' }
		]);
	});

	it('adds the requester to a public comment', async () => {
		const w = await workspace();
		const rows = await call(staffGet, w.technician, w.ticket.ticketTag, 'visibility=public');
		expect(labels(rows)).toEqual(['Ada Admin', 'Eve Employee']);
	});

	it('refuses an employee and a missing or unknown visibility', async () => {
		const w = await workspace();
		await expect(
			call(staffGet, w.employee, w.ticket.ticketTag, 'visibility=public')
		).rejects.toMatchObject({ status: 404 });
		await expect(call(staffGet, w.technician, w.ticket.ticketTag, '')).rejects.toMatchObject({
			status: 400
		});
		await expect(
			call(staffGet, w.technician, 'TCK-9999', 'visibility=public')
		).rejects.toMatchObject({ status: 404 });
	});
});

describe('GET /service-desk/new/mentions', () => {
	it('offers staff to staff and is closed to employees', async () => {
		const w = await workspace();
		expect(labels(await call(newGet, w.technician, '', 'q='))).toEqual(['Ada Admin']);
		await expect(call(newGet, w.employee, '', 'q=')).rejects.toMatchObject({ status: 404 });
	});
});

describe('GET /portal/tickets/[tag]/mentions', () => {
	it('offers nobody until somebody has the ticket, then the assignee only', async () => {
		const w = await workspace();
		expect(await call(portalGet, w.employee, w.ticket.ticketTag, 'q=')).toEqual([]);

		await assignTicket(w.admin, w.ticket.ticketTag, w.technician.personId);

		expect(labels(await call(portalGet, w.employee, w.ticket.ticketTag, 'q='))).toEqual([
			'Tess Tech'
		]);
	});

	it('does not leak a ticket that is not theirs', async () => {
		const w = await workspace();
		await expect(call(portalGet, w.stranger, w.ticket.ticketTag, 'q=')).rejects.toMatchObject({
			status: 404
		});
	});
});
