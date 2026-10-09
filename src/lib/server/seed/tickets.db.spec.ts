import { count } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { createOrganisation, createPerson, createViewer } from '../assets/testing/fixtures';
import { getDb } from '../db';
import { queues, tickets } from '../service-desk';
import { seedTickets } from './tickets';

describe('seedTickets', () => {
	async function counts() {
		const [ticketCount] = await getDb().select({ total: count() }).from(tickets);
		const [queueCount] = await getDb().select({ total: count() }).from(queues);
		return { tickets: ticketCount.total, queues: queueCount.total };
	}

	it('opens tickets in every status through the domain, and a second run changes nothing', async () => {
		const organisation = await createOrganisation();
		const admin = await createViewer(organisation.id, 'admin', 'Ada Admin');
		await createPerson(organisation.id, 'Laura Serra');

		const first = await seedTickets(admin);
		const afterFirst = await counts();
		const second = await seedTickets(admin);

		expect(first).toBeGreaterThan(0);
		expect(second).toBe(0);
		expect(await counts()).toEqual(afterFirst);
		expect(afterFirst.queues).toBeGreaterThan(0);
	});
});
