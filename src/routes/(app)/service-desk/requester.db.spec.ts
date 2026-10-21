import { describe, expect, it } from 'vitest';
import {
	createOrganisation,
	createPerson,
	createViewer
} from '#lib/server/assets/testing/fixtures.js';
import { createQueue, createTicket } from '#lib/server/service-desk/testing/fixtures.js';
import { load } from './+page.server';

const loadWith = (user: unknown, search: string) =>
	load({
		locals: { user },
		url: new URL(`http://localhost/service-desk${search}`)
	} as never) as Promise<Exclude<Awaited<ReturnType<typeof load>>, void>>;

describe('/service-desk?requester=', () => {
	it('filters to the requester and names them for the chip', async () => {
		const organisation = await createOrganisation();
		const technician = await createViewer(organisation.id, 'technician', 'Tom Technician');
		const ada = await createPerson(organisation.id, 'Ada Lovelace');
		const grace = await createPerson(organisation.id, 'Grace Hopper');
		const queue = await createQueue(organisation.id);
		await createTicket(organisation.id, queue.id, ada.id, { subject: 'ada one' });
		await createTicket(organisation.id, queue.id, grace.id, { subject: 'grace one' });

		const data = await loadWith(technician, `?requester=${ada.id}`);
		expect(data.result.rows.map((row: { subject: string }) => row.subject)).toEqual(['ada one']);
		expect(data.requester).toEqual({ id: ada.id, name: 'Ada Lovelace' });
	});

	it('yields nothing for an unknown id and ignores a malformed one', async () => {
		const organisation = await createOrganisation();
		const technician = await createViewer(organisation.id, 'technician', 'Tom Technician');
		const ada = await createPerson(organisation.id, 'Ada Lovelace');
		const queue = await createQueue(organisation.id);
		await createTicket(organisation.id, queue.id, ada.id);

		const unknown = await loadWith(technician, `?requester=${crypto.randomUUID()}`);
		expect(unknown.result.rows).toEqual([]);

		const malformed = await loadWith(technician, '?requester=nope');
		expect(malformed.requester).toBeNull();
		expect(malformed.result.rows).toHaveLength(1);
	});
});
