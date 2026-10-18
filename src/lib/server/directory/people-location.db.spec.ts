import { asc, eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { getDb } from '../db';
import { activity } from '../activity/schema';
import { createOrganisation, createPerson, createViewer } from '../assets/testing/fixtures';
import { createLocation, listPeople, people, setPersonLocation } from '.';
import type { SessionUser } from '../auth/guards';

async function setup() {
	const organisation = await createOrganisation();
	const actor = await createViewer(organisation.id, 'admin');
	const person = await createPerson(organisation.id, 'Grace Hopper');
	return { organisation, actor, person };
}

async function place(actor: SessionUser, name: string, parentId: string | null = null) {
	const outcome = await createLocation(actor, {
		name,
		parentId,
		code: null,
		address: null,
		notes: null,
		latitude: null,
		longitude: null
	});
	if (!outcome.ok) throw new Error(`fixture failed: ${outcome.error}`);
	return outcome.value.id;
}

const personEntries = (personId: string) =>
	getDb()
		.select()
		.from(activity)
		.where(eq(activity.personId, personId))
		.orderBy(asc(activity.occurredAt), asc(activity.id));

describe('setPersonLocation', () => {
	it('sets, changes and clears a location, recording from and to each time', async () => {
		const { actor, person } = await setup();
		const bcn = await place(actor, 'Barcelona office');
		const floor = await place(actor, 'Floor 1', bcn);
		const gi = await place(actor, 'Girona office');

		expect(await setPersonLocation(actor, person.id, floor)).toEqual({
			ok: true,
			value: undefined
		});
		await setPersonLocation(actor, person.id, gi);
		await setPersonLocation(actor, person.id, null);

		const [set, change, clear] = await personEntries(person.id);
		expect(set).toMatchObject({
			verb: 'person.location.changed',
			actorPersonId: actor.personId,
			payload: {
				from: null,
				to: { id: floor, path: 'Barcelona office › Floor 1' },
				reason: 'edited'
			}
		});
		expect(change.payload).toEqual({
			from: { id: floor, path: 'Barcelona office › Floor 1' },
			to: { id: gi, path: 'Girona office' },
			reason: 'edited'
		});
		expect(clear.payload).toEqual({
			from: { id: gi, path: 'Girona office' },
			to: null,
			reason: 'edited'
		});
	});

	it('records nothing when the value does not change', async () => {
		const { actor, person } = await setup();
		const bcn = await place(actor, 'Barcelona office');

		await setPersonLocation(actor, person.id, null);
		expect(await personEntries(person.id)).toHaveLength(0);

		await setPersonLocation(actor, person.id, bcn);
		const outcome = await setPersonLocation(actor, person.id, bcn);

		expect(outcome.ok).toBe(true);
		expect(await personEntries(person.id)).toHaveLength(1);
	});

	it('refuses a person or a location of another organisation and changes nothing', async () => {
		const { actor, person } = await setup();
		const other = await createOrganisation('Other', 'other');
		const otherActor = await createViewer(other.id, 'admin', 'Other Admin');
		const foreignLocation = await place(otherActor, 'Elsewhere');
		const foreignPerson = await createPerson(other.id, 'Foreign Person');

		expect(await setPersonLocation(actor, person.id, foreignLocation)).toEqual({
			ok: false,
			error: 'location_not_found'
		});
		expect(await setPersonLocation(actor, foreignPerson.id, null)).toEqual({
			ok: false,
			error: 'not_found'
		});

		const [row] = await getDb().select().from(people).where(eq(people.id, person.id));
		expect(row.locationId).toBeNull();
		expect(await personEntries(person.id)).toHaveLength(0);
	});

	it('allows an inactive person', async () => {
		const { actor, person } = await setup();
		await getDb().update(people).set({ active: false }).where(eq(people.id, person.id));
		const bcn = await place(actor, 'Barcelona office');

		expect((await setPersonLocation(actor, person.id, bcn)).ok).toBe(true);
	});
});

describe('listPeople location', () => {
	it('carries the id and the path of each person, null for none', async () => {
		const { organisation, actor, person } = await setup();
		const bcn = await place(actor, 'Barcelona office');
		const floor = await place(actor, 'Floor 1', bcn);
		await setPersonLocation(actor, person.id, floor);

		const listed = await listPeople(organisation.id);

		expect(listed.find((p) => p.id === person.id)).toMatchObject({
			locationId: floor,
			locationPath: 'Barcelona office › Floor 1'
		});
		expect(listed.find((p) => p.id === actor.personId)).toMatchObject({
			locationId: null,
			locationPath: null
		});
	});
});
