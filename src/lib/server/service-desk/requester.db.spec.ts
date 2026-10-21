import { describe, expect, it } from 'vitest';
import { createOrganisation, createPerson, createViewer } from '../assets/testing/fixtures';
import { createQueue, createTicket } from './testing/fixtures';
import { listTickets, openTicketsRequestedBy } from './index';

async function seed(slug: string) {
	const org = await createOrganisation('Acme', slug);
	const queue = await createQueue(org.id, 'General');
	const ada = await createPerson(org.id, 'Ada Lovelace');
	const grace = await createPerson(org.id, 'Grace Hopper');
	const viewer = await createViewer(org.id, 'technician', 'Marie Curie');
	return { org, queue, ada, grace, viewer };
}

describe('listTickets requester filter', () => {
	it('keeps only the tickets the person opened', async () => {
		const { org, queue, ada, grace, viewer } = await seed('requester-filter');
		await createTicket(org.id, queue.id, ada.id, { subject: 'ada one' });
		await createTicket(org.id, queue.id, grace.id, { subject: 'grace one' });

		const { rows } = await listTickets(viewer, { requesterPersonId: ada.id });
		expect(rows.map((row) => row.subject)).toEqual(['ada one']);
	});

	it('yields nothing for a person of another organisation', async () => {
		const { org, queue, ada, viewer } = await seed('requester-foreign');
		await createTicket(org.id, queue.id, ada.id);
		const other = await createOrganisation('Other', 'requester-foreign-other');
		const stranger = await createPerson(other.id, 'Eve');

		const { rows } = await listTickets(viewer, { requesterPersonId: stranger.id });
		expect(rows).toEqual([]);
	});
});

describe('openTicketsRequestedBy', () => {
	it('returns only open tickets, newest first, at most the limit', async () => {
		const { org, queue, ada, grace, viewer } = await seed('requested-open');
		await createTicket(org.id, queue.id, ada.id, {
			subject: 'oldest',
			updatedAt: new Date('2026-01-01T10:00:00Z')
		});
		await createTicket(org.id, queue.id, ada.id, {
			subject: 'middle',
			updatedAt: new Date('2026-02-01T10:00:00Z')
		});
		await createTicket(org.id, queue.id, ada.id, {
			subject: 'newest',
			updatedAt: new Date('2026-03-01T10:00:00Z')
		});
		await createTicket(org.id, queue.id, ada.id, { subject: 'done', status: 'resolved' });
		await createTicket(org.id, queue.id, ada.id, { subject: 'shut', status: 'closed' });
		await createTicket(org.id, queue.id, grace.id, { subject: 'not hers' });

		const rows = await openTicketsRequestedBy(viewer, ada.id, 2);
		expect(rows.map((row) => row.subject)).toEqual(['newest', 'middle']);
	});
});
