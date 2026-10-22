import { describe, expect, it } from 'vitest';
import {
	createOrganisation,
	createPerson,
	createViewer
} from '#lib/server/assets/testing/fixtures.js';
import { recordActivity } from '#lib/server/activity/index.js';
import type { SessionUser } from '#lib/server/auth/guards.js';
import { getDb } from '#lib/server/db/index.js';
import { resolveSessionUser, setTechniciansEditDirectory } from '#lib/server/directory/index.js';
import { createQueue, createTicket } from '#lib/server/service-desk/testing/fixtures.js';
import { actions, load } from './+page.server';

const loadAs = (user: SessionUser, id: string, search = '') =>
	load({
		locals: { user },
		params: { id },
		url: new URL(`http://localhost/directory/${id}${search}`)
	} as never) as Promise<Exclude<Awaited<ReturnType<typeof load>>, void>>;

const post = (user: SessionUser | null, fields: Record<string, string> = {}) =>
	({
		locals: { user },
		request: new Request('http://localhost/directory/x', {
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

describe('/directory/[id] actions', () => {
	it('refuses a technician every write but offers take back its own permission', async () => {
		const organisation = await createOrganisation();
		const technician = await createViewer(organisation.id, 'technician', 'Tom Technician');
		const person = await createPerson(organisation.id, 'Grace Hopper');

		for (const name of [
			'updatePerson',
			'deactivatePerson',
			'reactivatePerson',
			'grantAccess',
			'changeRole',
			'resetPassword',
			'revokeAccess'
		] as const) {
			expect(await statusOf(() => actions[name](post(technician, { id: person.id })))).toBe(404);
		}

		// A technician may take back; the empty form is refused as invalid, not as forbidden.
		const reply = (await actions.takeBack(post(technician, { personId: person.id }))) as {
			status?: number;
		};
		expect(reply.status).toBe(400);
	});

	it('lends a technician editing but never access, roles or the sign-in email', async () => {
		const organisation = await createOrganisation();
		const admin = await createViewer(organisation.id, 'admin');
		const technician = await createViewer(organisation.id, 'technician', 'Tom Technician');
		const person = await createPerson(organisation.id, 'Grace Hopper');
		const holder = await createViewer(organisation.id, 'admin', 'Hal Holder');
		await setTechniciansEditDirectory(admin, true);
		const lent = (await resolveSessionUser(technician.id))!;

		// Editing data works.
		const edited = (await actions.updatePerson(
			post(lent, { id: person.id, fullName: 'Grace M. Hopper', email: person.email })
		)) as { status?: number; action?: string };
		expect(edited.action).toBe('updatePerson');

		// Moving a credential holder's email would be an account takeover.
		const moved = (await actions.updatePerson(
			post(lent, { id: holder.personId!, fullName: 'Hal Holder', email: 'attacker@evil.test' })
		)) as { status?: number };
		expect(moved.status).toBe(400);
		expect((await resolveSessionUser(holder.id))?.email).toBe(holder.email);

		for (const name of [
			'deactivatePerson',
			'reactivatePerson',
			'grantAccess',
			'changeRole',
			'resetPassword',
			'revokeAccess'
		] as const) {
			expect(await statusOf(() => actions[name](post(lent, { id: person.id })))).toBe(404);
		}
	});

	it('refuses an employee take back', async () => {
		const organisation = await createOrganisation();
		const employee = await createViewer(organisation.id, 'employee', 'Eve Employee');
		expect(await statusOf(() => actions.takeBack(post(employee)))).toBe(404);
	});
});

describe('/directory/[id] load', () => {
	it('lists at most five open tickets the person requested, and only with tickets.view', async () => {
		const organisation = await createOrganisation();
		const technician = await createViewer(organisation.id, 'technician', 'Tom Technician');
		const person = await createPerson(organisation.id, 'Grace Hopper');
		const other = await createPerson(organisation.id, 'Ada Lovelace');
		const queue = await createQueue(organisation.id);
		for (let index = 0; index < 6; index += 1) {
			await createTicket(organisation.id, queue.id, person.id, { subject: `open ${index}` });
		}
		await createTicket(organisation.id, queue.id, person.id, { subject: 'done', status: 'closed' });
		await createTicket(organisation.id, queue.id, other.id, { subject: 'not hers' });

		const data = await loadAs(technician, person.id);
		expect(data.tickets).toHaveLength(5);
		expect(
			data.tickets?.every((ticket: { subject: string }) => ticket.subject.startsWith('open'))
		).toBe(true);
	});

	it('shows the person activity newest first', async () => {
		const organisation = await createOrganisation();
		const admin = await createViewer(organisation.id, 'admin');
		const person = await createPerson(organisation.id, 'Grace Hopper');
		await getDb().transaction(async (tx) => {
			await recordActivity(tx, {
				organisationId: organisation.id,
				target: { personId: person.id },
				verb: 'person.deactivated',
				payload: {},
				actorPersonId: admin.personId,
				occurredAt: new Date('2026-01-01T10:00:00Z')
			});
			await recordActivity(tx, {
				organisationId: organisation.id,
				target: { personId: person.id },
				verb: 'person.reactivated',
				payload: {},
				actorPersonId: admin.personId,
				occurredAt: new Date('2026-02-01T10:00:00Z')
			});
		});

		const data = await loadAs(admin, person.id);
		expect(data.timeline.map((item: { entry: { verb: string } }) => item.entry.verb)).toEqual([
			'person.reactivated',
			'person.deactivated'
		]);
	});

	it('opens the take back only for someone who can check out and when the person holds assets', async () => {
		const organisation = await createOrganisation();
		const admin = await createViewer(organisation.id, 'admin');
		const person = await createPerson(organisation.id, 'Grace Hopper');

		const data = await loadAs(admin, person.id, '?takeBack=1');
		expect(data.openTakeBack).toBe(false);
	});
});
