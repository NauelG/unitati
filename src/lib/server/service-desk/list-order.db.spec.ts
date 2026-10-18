import { describe, expect, it } from 'vitest';
import { createOrganisation, createPerson, createViewer } from '../assets/testing/fixtures';
import { createQueue, createTicket } from './testing/fixtures';
import { listTickets } from './index';

async function seed(slug: string) {
	const org = await createOrganisation('Acme', slug);
	const queue = await createQueue(org.id, 'General');
	const requester = await createPerson(org.id, 'Ada Lovelace');
	const viewer = await createViewer(org.id, 'technician', 'Marie Curie');
	return { org, queue, requester, viewer };
}

describe('listTickets order', () => {
	it('lists the most recently touched ticket first by default', async () => {
		const { org, queue, requester, viewer } = await seed('list-order-default');
		await createTicket(org.id, queue.id, requester.id, {
			subject: 'old',
			updatedAt: new Date('2026-01-01T10:00:00Z')
		});
		await createTicket(org.id, queue.id, requester.id, {
			subject: 'fresh',
			updatedAt: new Date('2026-03-01T10:00:00Z')
		});

		const { rows } = await listTickets(viewer);
		expect(rows.map((row) => row.subject)).toEqual(['fresh', 'old']);
		expect(rows[0].updatedAt).toEqual(new Date('2026-03-01T10:00:00Z'));
	});

	it('orders by priority in either direction', async () => {
		const { org, queue, requester, viewer } = await seed('list-order-priority');
		await createTicket(org.id, queue.id, requester.id, { subject: 'low one', priority: 'low' });
		await createTicket(org.id, queue.id, requester.id, {
			subject: 'urgent one',
			priority: 'urgent'
		});

		const asc = await listTickets(viewer, { order: { key: 'priority', direction: 'asc' } });
		const desc = await listTickets(viewer, { order: { key: 'priority', direction: 'desc' } });
		expect(asc.rows.map((row) => row.subject)).toEqual(['low one', 'urgent one']);
		expect(desc.rows.map((row) => row.subject)).toEqual(['urgent one', 'low one']);
	});
});
