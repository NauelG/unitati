import { asc, eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import type { Mapping } from '#lib/domain/imports.js';
import { activity } from '../activity/schema';
import { createOrganisation, createViewer } from '../assets/testing/fixtures';
import { getDb } from '../db';
import { createDepartment, createLocation, createPerson, listLocations } from '../directory';
import { departments, locations, people } from '../directory/schema';
import { commitPeopleImport, planPeopleImport } from '.';

const utf8 = (text: string) => new TextEncoder().encode(text);

const MAPPING: Mapping = {
	fullName: { column: 'Nombre completo' },
	firstName: null,
	lastName: null,
	email: { column: 'Correo electrónico' },
	department: { column: 'Departamento' },
	location: { column: 'Ubicación' }
};

const HEADER = 'Nombre completo,Correo electrónico,Departamento,Ubicación\n';

async function setup() {
	const organisation = await createOrganisation();
	const actor = await createViewer(organisation.id, 'admin');
	const root = await createLocation(actor, {
		name: 'Barcelona office',
		parentId: null,
		code: 'BCN',
		address: null,
		notes: null,
		latitude: null,
		longitude: null
	});
	if (!root.ok) throw new Error('fixture failed');
	return { organisation, actor, rootId: root.value.id };
}

async function addLocation(
	actor: Awaited<ReturnType<typeof setup>>['actor'],
	name: string,
	parentId: string | null
) {
	const outcome = await createLocation(actor, {
		name,
		parentId,
		code: null,
		address: null,
		notes: null,
		latitude: null,
		longitude: null
	});
	if (!outcome.ok) throw new Error('fixture failed');
	return outcome.value.id;
}

const counts = async () => ({
	people: (await getDb().select().from(people)).length,
	departments: (await getDb().select().from(departments)).length,
	locations: (await getDb().select().from(locations)).length,
	activity: (await getDb().select().from(activity)).length
});

const THREE_NEW = utf8(
	HEADER +
		[
			'Ada Lovelace,ada@example.com,Ingeniería,Barcelona office',
			'Grace Hopper,grace@example.com,Ingeniería,Nueva sede › Planta 2',
			'Alan Turing,alan@example.com,,',
			'Existing Person,existing@example.com,,'
		].join('\n')
);

describe('the people import', () => {
	it('previews exactly what it will create, and creating does exactly that', async () => {
		const { organisation, actor } = await setup();
		await getDb().insert(people).values({
			organisationId: organisation.id,
			fullName: 'Existing',
			email: 'EXISTING@example.com'.toLowerCase()
		});
		const before = await counts();

		const plan = await planPeopleImport(actor, THREE_NEW, MAPPING);
		expect(plan.errors).toEqual([]);
		expect(plan.toCreate.map((person) => person.email)).toEqual([
			'ada@example.com',
			'grace@example.com',
			'alan@example.com'
		]);
		expect(plan.skipped).toEqual([{ row: 5, email: 'existing@example.com' }]);
		expect(plan.newDepartments).toEqual(['Ingeniería']);
		expect(plan.newLocations).toEqual(['Nueva sede', 'Nueva sede › Planta 2']);
		expect(await counts()).toEqual(before);

		const outcome = await commitPeopleImport(actor, THREE_NEW, MAPPING);
		expect(outcome).toEqual({ ok: true, value: { created: 3, skipped: 1 } });

		const after = await counts();
		expect(after.people - before.people).toBe(3);
		expect(after.departments - before.departments).toBe(1);
		expect(after.locations - before.locations).toBe(2);

		const entries = await getDb().select().from(activity).orderBy(asc(activity.occurredAt));
		const created = entries.filter((entry) => entry.verb === 'person.created');
		expect(created).toHaveLength(3);
		expect(created.every((entry) => (entry.payload as { via?: string }).via === 'import')).toBe(
			true
		);
		const placed = entries.filter((entry) => entry.verb === 'person.location.changed');
		expect(placed).toHaveLength(2);
		expect(
			placed.map((entry) => (entry.payload as { to: { path: string } }).to.path).sort()
		).toEqual(['Barcelona office', 'Nueva sede › Planta 2']);
		expect(
			placed.every((entry) => (entry.payload as { reason: string }).reason === 'imported')
		).toBe(true);

		const [grace] = await getDb()
			.select()
			.from(people)
			.where(eq(people.email, 'grace@example.com'));
		const [floor] = await getDb()
			.select()
			.from(locations)
			.where(eq(locations.id, grace.locationId!));
		expect(floor.name).toBe('Planta 2');
		expect(grace.departmentId).not.toBeNull();
	});

	it('creates nothing the second time and reports every row as skipped', async () => {
		const { actor } = await setup();
		await commitPeopleImport(actor, THREE_NEW, MAPPING);
		const before = await counts();

		const again = await commitPeopleImport(actor, THREE_NEW, MAPPING);
		expect(again).toEqual({ ok: true, value: { created: 0, skipped: 4 } });
		expect(await counts()).toEqual(before);
	});

	it('writes nothing at all when one row is invalid, catalogue values included', async () => {
		const { actor } = await setup();
		const file = utf8(
			HEADER + 'Ada Lovelace,ada@example.com,Ingeniería,Nueva sede\nGrace Hopper,not-an-email,,\n'
		);
		const before = await counts();

		const outcome = await commitPeopleImport(actor, file, MAPPING);
		expect(outcome.ok).toBe(false);
		if (!outcome.ok) {
			expect(outcome.error.plan.errors).toEqual([
				{ row: 3, column: 'Correo electrónico', value: 'not-an-email', kind: 'email_invalid' }
			]);
		}
		expect(await counts()).toEqual(before);
	});

	it('rolls everything back when a write fails after the plan was valid', async () => {
		const { actor } = await setup();
		const before = await counts();

		const outcome = await commitPeopleImport(actor, THREE_NEW, MAPPING, {
			// Somebody registers an address between the plan and the writes.
			afterPlan: async () => {
				await getDb().insert(people).values({
					organisationId: actor.organisationId,
					fullName: 'Racer',
					email: 'grace@example.com'
				});
			}
		});

		expect(outcome.ok).toBe(false);
		if (!outcome.ok) {
			expect(outcome.error.plan.errors).toEqual([
				{ row: 3, column: null, value: 'grace@example.com', kind: 'duplicate_email' }
			]);
		}
		// Only the racer's row survives; the department, locations and Ada are gone.
		const after = await counts();
		expect(after.people).toBe(before.people + 1);
		expect(after.departments).toBe(before.departments);
		expect(after.locations).toBe(before.locations);
	});

	it('reports a duplicate email inside the file on every occurrence after the first', async () => {
		const { actor } = await setup();
		const plan = await planPeopleImport(
			actor,
			utf8(HEADER + 'A,a@example.com,,\nB,A@example.com,,\nC,a@example.com,,\n'),
			MAPPING
		);
		expect(plan.toCreate).toHaveLength(1);
		expect(plan.errors.map((error) => [error.row, error.kind])).toEqual([
			[3, 'duplicate_in_file'],
			[4, 'duplicate_in_file']
		]);
	});

	it('skips an email that belongs to a deactivated person', async () => {
		const { organisation, actor } = await setup();
		await getDb().insert(people).values({
			organisationId: organisation.id,
			fullName: 'Gone',
			email: 'gone@example.com',
			active: false
		});
		const plan = await planPeopleImport(actor, utf8(HEADER + 'Gone,gone@example.com,,\n'), MAPPING);
		expect(plan.skipped).toEqual([{ row: 2, email: 'gone@example.com' }]);
	});

	it('refuses an ambiguous location name, and resolves a code and a full path', async () => {
		const { actor, rootId } = await setup();
		const girona = await addLocation(actor, 'Girona office', null);
		await addLocation(actor, 'Floor 1', rootId);
		await addLocation(actor, 'Floor 1', girona);

		const plan = await planPeopleImport(
			actor,
			utf8(
				HEADER +
					'A,a@example.com,,Floor 1\nB,b@example.com,,BCN\nC,c@example.com,,Girona office › Floor 1\n'
			),
			MAPPING
		);
		expect(plan.errors).toEqual([
			{ row: 2, column: 'Ubicación', value: 'Floor 1', kind: 'location_ambiguous' }
		]);
		expect(plan.toCreate.map((person) => person.email)).toEqual(['b@example.com', 'c@example.com']);
		expect(plan.newLocations).toEqual([]);
	});

	it('creates a new location under an existing ancestor and only once across rows', async () => {
		const { actor } = await setup();
		const file = utf8(
			HEADER +
				'A,a@example.com,,Barcelona office › Floor 9\nB,b@example.com,,barcelona office/floor 9\n'
		);
		expect(await commitPeopleImport(actor, file, MAPPING)).toEqual({
			ok: true,
			value: { created: 2, skipped: 0 }
		});
		const catalogue = await listLocations(actor.organisationId);
		expect(catalogue.map((location) => location.path)).toEqual([
			'Barcelona office',
			'Barcelona office › Floor 9'
		]);
	});

	it('matches an existing department by name regardless of case and accents', async () => {
		const { actor } = await setup();
		await createDepartment(actor, { name: 'Ingeniería' });
		const plan = await planPeopleImport(
			actor,
			utf8(
				HEADER + 'A,a@example.com,INGENIERIA,\nB,b@example.com,Ventas,\nC,c@example.com,ventas,\n'
			),
			MAPPING
		);
		expect(plan.newDepartments).toEqual(['Ventas']);
	});

	it('builds the name from first and last name, and takes a fixed department', async () => {
		const { actor } = await setup();
		const mapping: Mapping = {
			fullName: null,
			firstName: { column: 'N' },
			lastName: { column: 'A' },
			email: { column: 'E' },
			department: { fixed: 'Soporte' },
			location: null
		};
		const plan = await planPeopleImport(
			actor,
			utf8('N,A,E,Extra\nAda,Lovelace,a@example.com,x\n'),
			mapping
		);
		expect(plan.toCreate[0]).toMatchObject({
			fullName: 'Ada Lovelace',
			department: { newName: 'Soporte' }
		});
		expect(plan.ignoredColumns).toEqual(['Extra']);
	});

	it('reports a required field mapped to nothing before checking any row', async () => {
		const { actor } = await setup();
		const plan = await planPeopleImport(actor, THREE_NEW, { ...MAPPING, email: null });
		expect(plan.errors).toEqual([
			{ row: null, column: 'email', value: null, kind: 'mapping_missing' }
		]);
		expect(plan.toCreate).toEqual([]);
	});

	it('leaves createPerson without options exactly as it was', async () => {
		const { actor } = await setup();
		const created = await createPerson(actor, {
			fullName: 'Plain',
			email: 'plain@example.com',
			departmentId: null,
			locationId: null
		});
		expect(created.ok).toBe(true);
		const entries = await getDb()
			.select()
			.from(activity)
			.where(eq(activity.verb, 'person.created'));
		expect(entries.at(-1)?.payload).toEqual({ fullName: 'Plain', email: 'plain@example.com' });
	});
});
