import { describe, expect, it } from 'vitest';
import { listTicketChoices } from '.';
import { createOrganisation, createPerson, createViewer } from '../assets/testing/fixtures';
import { createQueue, createTicket } from './testing/fixtures';

/**
 * `listTicketChoices` feeds the "Vincular ticket" picker on the asset record
 * (#168). Unlike the lists a person works from, it offers every status: the
 * ticket that explains last month's fault is usually closed.
 */

async function desk() {
	const organisation = await createOrganisation();
	const queue = await createQueue(organisation.id);
	const technician = await createViewer(organisation.id, 'technician', 'Tess Tech');
	const employee = await createViewer(organisation.id, 'employee', 'Eve Employee');
	const colleague = await createPerson(organisation.id, 'Colin Colleague');

	return { organisation, queue, technician, employee, colleague };
}

describe('listTicketChoices', () => {
	it('offers every status, closed ones included, with the id a link needs', async () => {
		const { organisation, queue, technician, employee } = await desk();
		const open = await createTicket(organisation.id, queue.id, employee.personId!, {
			ticketTag: 'TCK-0001',
			subject: 'Screen flickers'
		});
		const closed = await createTicket(organisation.id, queue.id, employee.personId!, {
			ticketTag: 'TCK-0002',
			subject: 'Battery swollen',
			status: 'closed'
		});
		const resolved = await createTicket(organisation.id, queue.id, employee.personId!, {
			ticketTag: 'TCK-0003',
			subject: 'Dock unplugged',
			status: 'resolved'
		});

		const choices = await listTicketChoices(technician);

		expect(
			choices.map(({ id, ticketTag, subject, status }) => ({ id, ticketTag, subject, status }))
		).toEqual(
			expect.arrayContaining([
				{ id: open.id, ticketTag: 'TCK-0001', subject: 'Screen flickers', status: 'new' },
				{ id: closed.id, ticketTag: 'TCK-0002', subject: 'Battery swollen', status: 'closed' },
				{ id: resolved.id, ticketTag: 'TCK-0003', subject: 'Dock unplugged', status: 'resolved' }
			])
		);
		expect(choices).toHaveLength(3);
	});

	it('stays inside the viewer organisation and their own scope', async () => {
		const { organisation, queue, technician, employee, colleague } = await desk();
		const globex = await createOrganisation('Globex', 'globex');
		const foreignQueue = await createQueue(globex.id);
		const foreigner = await createPerson(globex.id, 'Gina Globex');
		await createTicket(globex.id, foreignQueue.id, foreigner.id, { ticketTag: 'TCK-0001' });
		const mine = await createTicket(organisation.id, queue.id, employee.personId!, {
			ticketTag: 'TCK-0002'
		});
		await createTicket(organisation.id, queue.id, colleague.id, { ticketTag: 'TCK-0003' });

		const staff = await listTicketChoices(technician);
		const requester = await listTicketChoices(employee);

		expect(staff.map((choice) => choice.ticketTag).sort()).toEqual(['TCK-0002', 'TCK-0003']);
		expect(requester.map((choice) => choice.id)).toEqual([mine.id]);
	});

	it('searches the tag and the subject, accent and case aside from the pattern characters', async () => {
		const { organisation, queue, technician, employee } = await desk();
		await createTicket(organisation.id, queue.id, employee.personId!, {
			ticketTag: 'TCK-0001',
			subject: 'Printer jammed'
		});
		await createTicket(organisation.id, queue.id, employee.personId!, {
			ticketTag: 'TCK-0002',
			subject: 'Discount 50% off'
		});

		const bySubject = await listTicketChoices(technician, { search: 'PRINT' });
		const byTag = await listTicketChoices(technician, { search: 'tck-0002' });
		const percent = await listTicketChoices(technician, { search: '%' });

		expect({
			bySubject: bySubject.map((choice) => choice.ticketTag),
			byTag: byTag.map((choice) => choice.ticketTag),
			percent: percent.map((choice) => choice.ticketTag)
		}).toEqual({ bySubject: ['TCK-0001'], byTag: ['TCK-0002'], percent: ['TCK-0002'] });
	});

	it('answers with the most recently updated first, and ten at most', async () => {
		const { organisation, queue, technician, employee } = await desk();
		for (let n = 1; n <= 12; n++) {
			await createTicket(organisation.id, queue.id, employee.personId!, {
				ticketTag: `TCK-${String(n).padStart(4, '0')}`,
				updatedAt: new Date(Date.UTC(2026, 0, n))
			});
		}

		const choices = await listTicketChoices(technician);

		expect(choices).toHaveLength(10);
		expect(choices[0]?.ticketTag).toBe('TCK-0012');
		expect(choices[9]?.ticketTag).toBe('TCK-0003');
	});
});
