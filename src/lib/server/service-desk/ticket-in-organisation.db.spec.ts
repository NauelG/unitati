import { describe, expect, it } from 'vitest';
import { getDb } from '../db';
import { createOrganisation, createViewer } from '../assets/testing/fixtures';
import { createQueue, createTicket } from './testing/fixtures';
import { ticketInOrganisation } from './index';

/** Tenancy only: who may write to a ticket is the caller's rule, not this one's. */
describe('ticketInOrganisation', () => {
	it('finds a ticket of the actor’s organisation, whatever their role', async () => {
		const organisation = await createOrganisation();
		const queue = await createQueue(organisation.id);
		const employee = await createViewer(organisation.id, 'employee', 'Eve Employee');
		const ticket = await createTicket(organisation.id, queue.id, employee.personId!);
		const colleague = await createViewer(organisation.id, 'employee', 'Olga Other');

		expect(await ticketInOrganisation(getDb(), colleague, ticket.id)).toEqual({ id: ticket.id });
	});

	it('returns null for a ticket of another organisation', async () => {
		const organisation = await createOrganisation();
		const queue = await createQueue(organisation.id);
		const employee = await createViewer(organisation.id, 'employee', 'Eve Employee');
		const ticket = await createTicket(organisation.id, queue.id, employee.personId!);
		const globex = await createOrganisation('Globex', 'globex');
		const foreign = await createViewer(globex.id, 'admin', 'Gina Globex');

		expect(await ticketInOrganisation(getDb(), foreign, ticket.id)).toBeNull();
	});
});
