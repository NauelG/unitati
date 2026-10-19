import { describe, expect, it } from 'vitest';
import { createWorkspace } from '#lib/server/projects/testing/fixtures.js';
import { createQueue, createTicket } from '#lib/server/service-desk/testing/fixtures.js';
import { createLocation, setPersonLocation } from '#lib/server/directory/index.js';
import { load } from './+page.server';

async function scene() {
	const base = await createWorkspace();
	const { organisation, admin, employee, technician } = base;
	const queue = await createQueue(organisation.id);
	const ticket = await createTicket(organisation.id, queue.id, employee.personId!);
	return { ...base, admin, technician, employee, params: { tag: ticket.ticketTag } };
}

const pageFor = async (user: unknown, params: { tag: string }) =>
	(await load({ locals: { user }, params } as never)) as Record<string, unknown>;

describe('the requester location on the ticket record', () => {
	it('gives staff the path of the requester location, or null when there is none', async () => {
		const { admin, technician, employee, params } = await scene();

		expect((await pageFor(technician, params)).requesterLocation).toBeNull();

		const created = await createLocation(admin, {
			name: 'Barcelona office',
			parentId: null,
			code: null,
			address: null,
			notes: null,
			latitude: null,
			longitude: null
		});
		if (!created.ok) throw new Error('fixture failed');
		await setPersonLocation(admin, employee.personId!, created.value.id);

		expect((await pageFor(technician, params)).requesterLocation).toEqual({
			path: 'Barcelona office'
		});
		expect((await pageFor(admin, params)).requesterLocation).toEqual({ path: 'Barcelona office' });
	});

	it('is out of reach for the requester: this page needs tickets.view, employees use the portal', async () => {
		const { admin, employee, params } = await scene();
		const created = await createLocation(admin, {
			name: 'Barcelona office',
			parentId: null,
			code: null,
			address: null,
			notes: null,
			latitude: null,
			longitude: null
		});
		if (!created.ok) throw new Error('fixture failed');
		await setPersonLocation(admin, employee.personId!, created.value.id);

		await expect(pageFor(employee, params)).rejects.toMatchObject({ status: 404 });
	});
});
