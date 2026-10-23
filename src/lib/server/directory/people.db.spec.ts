import { asc, eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { getDb } from '../db';
import { activity } from '../activity/schema';
import {
	createOrganisation,
	createPerson as fixturePerson,
	createViewer
} from '../assets/testing/fixtures';
import {
	addPersonComment,
	createDepartment,
	createLocation,
	createPerson,
	deactivatePerson,
	listPeople,
	listPersonComments,
	reactivatePerson,
	updatePerson
} from '.';
import { people } from './schema';

async function setup() {
	const organisation = await createOrganisation();
	const actor = await createViewer(organisation.id, 'admin');
	return { organisation, actor };
}

const draft = (overrides: Partial<Parameters<typeof createPerson>[1]> = {}) => ({
	fullName: 'Grace Hopper',
	email: 'grace@acme.test',
	departmentId: null,
	locationId: null,
	...overrides
});

const entries = (personId: string) =>
	getDb()
		.select()
		.from(activity)
		.where(eq(activity.personId, personId))
		.orderBy(asc(activity.occurredAt), asc(activity.id));

async function department(actor: Parameters<typeof createDepartment>[0], name: string) {
	const outcome = await createDepartment(actor, { name });
	if (!outcome.ok) throw new Error('fixture failed');
	return outcome.value.id;
}

describe('createPerson', () => {
	it('creates the person with department and location and records person.created', async () => {
		const { actor } = await setup();
		const departmentId = await department(actor, 'Finance');
		const location = await createLocation(actor, {
			name: 'HQ',
			parentId: null,
			code: null,
			address: null,
			notes: null,
			latitude: null,
			longitude: null
		});
		if (!location.ok) throw new Error('fixture failed');

		const created = await createPerson(
			actor,
			draft({ departmentId, locationId: location.value.id })
		);
		if (!created.ok) throw new Error(created.error);

		const [row] = await getDb().select().from(people).where(eq(people.id, created.value.id));
		expect(row).toMatchObject({
			fullName: 'Grace Hopper',
			departmentId,
			active: true,
			userId: null
		});
		expect(row.locationId).toBe(location.value.id);
		const [entry] = await entries(created.value.id);
		expect(entry).toMatchObject({
			verb: 'person.created',
			actorPersonId: actor.personId,
			payload: { fullName: 'Grace Hopper', email: 'grace@acme.test' }
		});
	});

	it('refuses a duplicate email within the organisation, and allows it in another', async () => {
		const { actor } = await setup();
		await createPerson(actor, draft());

		expect(await createPerson(actor, draft({ fullName: 'Other' }))).toEqual({
			ok: false,
			error: 'duplicate_email'
		});

		const other = await createOrganisation('Globex', 'globex');
		const outsider = await createViewer(other.id, 'admin', 'Hank Scorpio');
		expect((await createPerson(outsider, draft())).ok).toBe(true);
	});

	it("rejects another organisation's department and location", async () => {
		const { actor } = await setup();
		const other = await createOrganisation('Globex', 'globex');
		const outsider = await createViewer(other.id, 'admin', 'Hank Scorpio');
		const foreign = await department(outsider, 'Sales');

		expect(await createPerson(actor, draft({ departmentId: foreign }))).toEqual({
			ok: false,
			error: 'department_not_found'
		});
		expect(await createPerson(actor, draft({ locationId: crypto.randomUUID() }))).toEqual({
			ok: false,
			error: 'location_not_found'
		});
	});
});

describe('updatePerson', () => {
	it('is partial: absent keys are untouched, and a rename records nothing', async () => {
		const { organisation, actor } = await setup();
		const person = await fixturePerson(organisation.id, 'Grace Hopper', 'grace@acme.test');

		expect(await updatePerson(actor, person.id, { fullName: 'Grace B. Hopper' })).toEqual({
			ok: true,
			value: undefined
		});

		const [row] = await getDb().select().from(people).where(eq(people.id, person.id));
		expect(row).toMatchObject({ fullName: 'Grace B. Hopper', email: 'grace@acme.test' });
		expect(await entries(person.id)).toHaveLength(0);
	});

	it('records the department change with both names, and nothing for a no-op', async () => {
		const { organisation, actor } = await setup();
		const person = await fixturePerson(organisation.id, 'Grace Hopper');
		const finance = await department(actor, 'Finance');
		const legal = await department(actor, 'Legal');

		await updatePerson(actor, person.id, { departmentId: finance });
		await updatePerson(actor, person.id, { departmentId: finance });
		await updatePerson(actor, person.id, { departmentId: legal });
		await updatePerson(actor, person.id, { departmentId: null });

		const [first, second, third, ...rest] = await entries(person.id);
		expect(rest).toHaveLength(0);
		expect(first).toMatchObject({
			verb: 'person.department.changed',
			payload: {
				fromDepartmentId: null,
				fromDepartmentName: null,
				toDepartmentId: finance,
				toDepartmentName: 'Finance'
			}
		});
		expect(second.payload).toMatchObject({
			fromDepartmentName: 'Finance',
			toDepartmentName: 'Legal'
		});
		expect(third.payload).toMatchObject({ fromDepartmentName: 'Legal', toDepartmentId: null });
	});

	it('refuses a duplicate email, a foreign department and an unknown person', async () => {
		const { organisation, actor } = await setup();
		await fixturePerson(organisation.id, 'Ada Byron', 'ada@acme.test');
		const person = await fixturePerson(organisation.id, 'Grace Hopper');

		expect(await updatePerson(actor, person.id, { email: 'ada@acme.test' })).toEqual({
			ok: false,
			error: 'duplicate_email'
		});
		expect(await updatePerson(actor, person.id, { departmentId: crypto.randomUUID() })).toEqual({
			ok: false,
			error: 'department_not_found'
		});
		expect(await updatePerson(actor, crypto.randomUUID(), { fullName: 'X' })).toEqual({
			ok: false,
			error: 'not_found'
		});
	});

	it('locks the email of a person with access, but still takes other changes', async () => {
		const { actor } = await setup();
		const withAccess = await createViewer(actor.organisationId, 'employee', 'Eva Employee');

		expect(await updatePerson(actor, withAccess.personId!, { email: 'new@acme.test' })).toEqual({
			ok: false,
			error: 'email_locked'
		});
		expect(await updatePerson(actor, withAccess.personId!, { email: withAccess.email })).toEqual({
			ok: true,
			value: undefined
		});
		expect((await updatePerson(actor, withAccess.personId!, { fullName: 'Eva E.' })).ok).toBe(true);
	});
});

describe('deactivatePerson and reactivatePerson', () => {
	it('deactivates, hides them from the default list and records it; reactivates again', async () => {
		const { organisation, actor } = await setup();
		const person = await fixturePerson(organisation.id, 'Grace Hopper');

		expect(await deactivatePerson(actor, person.id)).toEqual({ ok: true, value: undefined });
		expect(await deactivatePerson(actor, person.id)).toEqual({
			ok: false,
			error: 'already_inactive'
		});

		const names = async (includeInactive: boolean) =>
			(await listPeople(organisation.id, { includeInactive })).map((p) => p.fullName);
		expect(await names(false)).not.toContain('Grace Hopper');
		expect(await names(true)).toContain('Grace Hopper');

		expect(await reactivatePerson(actor, person.id)).toEqual({ ok: true, value: undefined });
		expect(await reactivatePerson(actor, person.id)).toEqual({
			ok: false,
			error: 'already_active'
		});
		expect(await names(false)).toContain('Grace Hopper');

		const log = await entries(person.id);
		expect(log.map((entry) => entry.verb)).toEqual(['person.deactivated', 'person.reactivated']);
	});

	it('refuses self-deactivation and an unknown or foreign person', async () => {
		const { actor } = await setup();
		const other = await createOrganisation('Globex', 'globex');
		const outsider = await fixturePerson(other.id, 'Hank Scorpio');

		expect(await deactivatePerson(actor, actor.personId!)).toEqual({ ok: false, error: 'self' });
		expect(await deactivatePerson(actor, outsider.id)).toEqual({ ok: false, error: 'not_found' });
		expect(await reactivatePerson(actor, crypto.randomUUID())).toEqual({
			ok: false,
			error: 'not_found'
		});
	});
});

describe('listPeople', () => {
	it('reports the department id and whether the person has access', async () => {
		const { organisation, actor } = await setup();
		await fixturePerson(organisation.id, 'No Access');

		const listed = await listPeople(organisation.id);
		expect(listed.find((p) => p.fullName === 'No Access')).toMatchObject({
			hasAccess: false,
			departmentId: null
		});
		expect(listed.find((p) => p.fullName === 'Ada Lovelace')?.hasAccess).toBe(true);
		expect(actor.personId).toBeTruthy();
	});
});

describe('person comments', () => {
	it('lists comments newest first and records note.added on the person', async () => {
		const { actor } = await setup();
		const created = await createPerson(actor, draft());
		if (!created.ok) throw new Error('fixture failed');
		const personId = created.value.id;

		await addPersonComment(actor, personId, 'Prefers email');
		await addPersonComment(actor, personId, 'On leave until May');

		const listed = await listPersonComments(actor.organisationId, personId);
		expect(listed.map(({ body }) => body)).toEqual(['On leave until May', 'Prefers email']);
		expect((await entries(personId)).map(({ verb }) => verb)).toContain('note.added');
	});

	it('refuses an empty body and a person of another organisation', async () => {
		const { actor } = await setup();
		const created = await createPerson(actor, draft());
		if (!created.ok) throw new Error('fixture failed');
		const otherOrganisation = await createOrganisation('Globex', 'globex');
		const outsider = await createViewer(otherOrganisation.id, 'admin', 'Olga Outsider');

		expect(await addPersonComment(actor, created.value.id, ' ')).toEqual({
			ok: false,
			error: 'empty_comment'
		});
		expect(await addPersonComment(outsider, created.value.id, 'Hi')).toEqual({
			ok: false,
			error: 'not_found'
		});
	});
});
