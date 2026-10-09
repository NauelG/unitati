import { describe, expect, it } from 'vitest';
import { createOrganisation, createPerson } from '../assets/testing/fixtures';
import { createQueue, createTicket } from './testing/fixtures';
import { countOpen } from './index';

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
