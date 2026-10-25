import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createOrganisation, createViewer } from '../assets/testing/fixtures';
import { registerPorts } from '../ports';
import { InMemoryStorage } from '../shared/storage';
import { addComment, createTicket, editComment } from './index';
import { clearTicketPorts } from './ports';
import { createComment, createQueue, createTicket as insertTicket } from './testing/fixtures';

/**
 * ADR 0049: a port nobody registered is a wiring bug, and it must fail loudly.
 * Skipping the link or the citation would let a ticket be written without the
 * relation it was supposed to carry.
 */

const deps = { storage: new InMemoryStorage(), mailer: null };

async function workspace() {
	const organisation = await createOrganisation();
	const technician = await createViewer(organisation.id, 'technician', 'Tess Tech');
	const queue = await createQueue(organisation.id, 'Hardware');
	const ticket = await insertTicket(organisation.id, queue.id, technician.personId!);
	const comment = await createComment(organisation.id, ticket.id, technician.personId, 'first');
	return { technician, queue, ticket, comment };
}

describe('service-desk without its ports', () => {
	beforeEach(() => clearTicketPorts());
	// The harness registers them once per process: put them back for the next file.
	afterEach(() => registerPorts());

	it('refuses to open a ticket', async () => {
		const { technician, queue } = await workspace();

		await expect(
			createTicket(technician, { subject: 'No ports', body: 'Body', queueId: queue.id }, [], deps)
		).rejects.toThrow(/ticket ports/i);
	});

	it('refuses to add a comment', async () => {
		const { technician, ticket } = await workspace();

		await expect(
			addComment(technician, ticket.ticketTag, { body: 'Hello', visibility: 'public' }, [], deps)
		).rejects.toThrow(/ticket ports/i);
	});

	it('refuses to edit a comment', async () => {
		const { technician, comment } = await workspace();

		await expect(editComment(technician, comment.id, 'Edited', deps)).rejects.toThrow(
			/ticket ports/i
		);
	});
});
