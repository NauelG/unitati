import { describe, expect, it } from 'vitest';
import {
	createOrganisation,
	createPerson,
	createViewer
} from '#lib/server/assets/testing/fixtures.js';
import type { SessionUser } from '#lib/server/auth/guards.js';
import { actions } from './+page.server';

const event = (user: SessionUser | null, fields: Record<string, string> = {}) =>
	({
		locals: { user },
		request: new Request('http://localhost/directory', {
			method: 'POST',
			body: new URLSearchParams(fields)
		})
	}) as never;

async function statusOf(run: () => unknown): Promise<number | undefined> {
	try {
		await run();
	} catch (thrown) {
		return (thrown as { status?: number }).status;
	}
	return undefined;
}

type Reply = { status?: number; data?: { message?: string }; action?: string };

describe('/directory writes', () => {
	it('answers 404 to a technician on every write action', async () => {
		const organisation = await createOrganisation();
		const technician = await createViewer(organisation.id, 'technician', 'Tom Technician');
		const person = await createPerson(organisation.id, 'Grace Hopper');

		for (const name of [
			'createPerson',
			'updatePerson',
			'deactivatePerson',
			'reactivatePerson'
		] as const) {
			expect(await statusOf(() => actions[name](event(technician, { id: person.id })))).toBe(404);
		}
	});

	it('lets an admin add, edit, deactivate and reactivate a person', async () => {
		const organisation = await createOrganisation();
		const admin = await createViewer(organisation.id, 'admin');

		const created = (await actions.createPerson(
			event(admin, {
				fullName: 'Grace Hopper',
				email: ' Grace@Acme.test ',
				departmentId: '',
				locationId: ''
			})
		)) as Reply;
		expect(created.action).toBe('createPerson');

		const duplicate = (await actions.createPerson(
			event(admin, { fullName: 'Other', email: 'grace@acme.test' })
		)) as Reply;
		expect(duplicate.status).toBe(400);

		const invalid = (await actions.createPerson(
			event(admin, { fullName: '', email: 'nope' })
		)) as Reply;
		expect(invalid.status).toBe(400);
	});

	it('refuses an admin deactivating themselves', async () => {
		const organisation = await createOrganisation();
		const admin = await createViewer(organisation.id, 'admin');

		const reply = (await actions.deactivatePerson(event(admin, { id: admin.personId! }))) as Reply;
		expect(reply.status).toBe(400);
	});
});
