import { describe, expect, it } from 'vitest';
import { createOrganisation, createPerson, createViewer } from '../assets/testing/fixtures';
import { createQueue, createTicket } from './testing/fixtures';
import { countOpen, hasPortalActivity, myOpenTickets, ticketSummary } from './index';

describe('countOpen', () => {
	it('counts every ticket not resolved or closed, scoped to the organisation', async () => {
		const acme = await createOrganisation('Acme', 'acme-ticket-counts');
		const globex = await createOrganisation('Globex', 'globex-ticket-counts');
		const acmeQueue = await createQueue(acme.id, 'General');
		const globexQueue = await createQueue(globex.id, 'General');
		const acmeRequester = await createPerson(acme.id, 'Ada Lovelace');
		const globexRequester = await createPerson(globex.id, 'Grace Hopper');

		await createTicket(acme.id, acmeQueue.id, acmeRequester.id, { status: 'new' });
		await createTicket(acme.id, acmeQueue.id, acmeRequester.id, { status: 'in_progress' });
		await createTicket(acme.id, acmeQueue.id, acmeRequester.id, { status: 'waiting_on_user' });
		await createTicket(acme.id, acmeQueue.id, acmeRequester.id, { status: 'resolved' });
		await createTicket(acme.id, acmeQueue.id, acmeRequester.id, { status: 'closed' });
		await createTicket(globex.id, globexQueue.id, globexRequester.id, { status: 'new' });

		expect(await countOpen(acme.id)).toBe(3);
		expect(await countOpen(globex.id)).toBe(1);
	});

	it('returns zero for an organisation with no tickets', async () => {
		const acme = await createOrganisation('Acme', 'acme-ticket-counts-empty');
		expect(await countOpen(acme.id)).toBe(0);
	});
});

describe('ticketSummary', () => {
	it('counts open and waiting-on-user tickets, scoped to the organisation and the viewer', async () => {
		const acme = await createOrganisation('Acme', 'acme-ticket-summary');
		const globex = await createOrganisation('Globex', 'globex-ticket-summary');
		const acmeQueue = await createQueue(acme.id, 'General');
		const globexQueue = await createQueue(globex.id, 'General');
		const acmeRequester = await createPerson(acme.id, 'Ada Lovelace');
		const globexRequester = await createPerson(globex.id, 'Grace Hopper');
		const acmeTechnician = await createViewer(acme.id, 'technician', 'Marie Curie');

		await createTicket(acme.id, acmeQueue.id, acmeRequester.id, { status: 'new' });
		await createTicket(acme.id, acmeQueue.id, acmeRequester.id, { status: 'waiting_on_user' });
		await createTicket(acme.id, acmeQueue.id, acmeRequester.id, { status: 'resolved' });
		await createTicket(globex.id, globexQueue.id, globexRequester.id, { status: 'new' });

		expect(await ticketSummary(acmeTechnician)).toEqual({ open: 2, waitingOnUser: 1 });
	});

	it('narrows to the viewer’s own requested tickets when they hold no whole-queue permission', async () => {
		const acme = await createOrganisation('Acme', 'acme-ticket-summary-scoped');
		const queue = await createQueue(acme.id, 'General');
		const employee = await createViewer(acme.id, 'employee', 'Ada Lovelace');
		const other = await createPerson(acme.id, 'Alan Turing');

		await createTicket(acme.id, queue.id, employee.personId!, { status: 'new' });
		await createTicket(acme.id, queue.id, other.id, { status: 'waiting_on_user' });

		expect(await ticketSummary(employee)).toEqual({ open: 1, waitingOnUser: 0 });
	});
});

describe('hasPortalActivity', () => {
	it('is false until a ticket arrives through the portal channel', async () => {
		const acme = await createOrganisation('Acme', 'acme-portal-activity');
		const queue = await createQueue(acme.id, 'General');
		const requester = await createPerson(acme.id, 'Ada Lovelace');

		await createTicket(acme.id, queue.id, requester.id, { channel: 'agent' });
		expect(await hasPortalActivity(acme.id)).toBe(false);

		await createTicket(acme.id, queue.id, requester.id, { channel: 'portal' });
		expect(await hasPortalActivity(acme.id)).toBe(true);
	});

	it('does not see another organisation’s portal tickets', async () => {
		const acme = await createOrganisation('Acme', 'acme-portal-activity-scoped');
		const globex = await createOrganisation('Globex', 'globex-portal-activity-scoped');
		const globexQueue = await createQueue(globex.id, 'General');
		const globexRequester = await createPerson(globex.id, 'Grace Hopper');

		await createTicket(globex.id, globexQueue.id, globexRequester.id, { channel: 'portal' });

		expect(await hasPortalActivity(acme.id)).toBe(false);
	});
});

describe('myOpenTickets', () => {
	it('returns the viewer’s own open assignment, newest-updated first', async () => {
		const acme = await createOrganisation('Acme', 'acme-my-tickets');
		const queue = await createQueue(acme.id, 'General');
		const technician = await createViewer(acme.id, 'technician', 'Marie Curie');
		const requester = await createPerson(acme.id, 'Ada Lovelace');

		await createTicket(acme.id, queue.id, requester.id, {
			status: 'resolved',
			assigneePersonId: technician.personId
		});
		const open = await createTicket(acme.id, queue.id, requester.id, {
			status: 'in_progress',
			assigneePersonId: technician.personId
		});
		await createTicket(acme.id, queue.id, requester.id, { status: 'new' });

		const mine = await myOpenTickets(technician);
		expect(mine.map((ticket) => ticket.id)).toEqual([open.id]);
	});

	it('returns nothing for a viewer with no directory record', async () => {
		const acme = await createOrganisation('Acme', 'acme-my-tickets-no-person');
		const queue = await createQueue(acme.id, 'General');
		const requester = await createPerson(acme.id, 'Ada Lovelace');
		const technician = await createViewer(acme.id, 'technician', 'Marie Curie');

		await createTicket(acme.id, queue.id, requester.id, {
			status: 'new',
			assigneePersonId: technician.personId
		});

		expect(await myOpenTickets({ ...technician, personId: null })).toEqual([]);
	});
});
