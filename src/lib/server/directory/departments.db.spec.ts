import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { getDb } from '../db';
import { createOrganisation, createPerson, createViewer } from '../assets/testing/fixtures';
import {
	createDepartment,
	deleteDepartment,
	listDepartments,
	renameDepartment,
	departmentInput
} from '.';
import { departments, people } from './schema';

async function setup(slug = 'acme') {
	const organisation = await createOrganisation(slug, slug);
	const actor = await createViewer(organisation.id, 'admin', `Admin ${slug}`);
	return { organisation, actor };
}

/** Creates and unwraps: a fixture that fails should fail loudly. */
async function make(actor: Awaited<ReturnType<typeof setup>>['actor'], name: string) {
	const outcome = await createDepartment(actor, { name });
	if (!outcome.ok) throw new Error(`fixture failed: ${outcome.error}`);
	return outcome.value.id;
}

async function assign(personId: string, departmentId: string) {
	await getDb().update(people).set({ departmentId }).where(eq(people.id, personId));
}

describe('the departments catalogue', () => {
	it('creates departments and lists them by name with their head count', async () => {
		const { organisation, actor } = await setup();
		const support = await make(actor, 'Soporte');
		await make(actor, 'Contabilidad');
		const grace = await createPerson(organisation.id, 'Grace Hopper');
		const alan = await createPerson(organisation.id, 'Alan Turing');
		await assign(grace.id, support);
		await assign(alan.id, support);

		expect(await listDepartments(organisation.id)).toEqual([
			{ id: expect.any(String), name: 'Contabilidad', peopleCount: 0 },
			{ id: support, name: 'Soporte', peopleCount: 2 }
		]);
	});

	it('refuses a duplicate name in the same organisation', async () => {
		const { actor } = await setup();
		await make(actor, 'Soporte');

		expect(await createDepartment(actor, { name: 'Soporte' })).toEqual({
			ok: false,
			error: 'duplicate_name'
		});
	});

	it('lets two organisations use the same name', async () => {
		const { actor } = await setup();
		const other = await setup('globex');
		await make(actor, 'Soporte');

		expect((await createDepartment(other.actor, { name: 'Soporte' })).ok).toBe(true);
	});

	it('renames a department, and refuses a name another department holds', async () => {
		const { organisation, actor } = await setup();
		const id = await make(actor, 'Soporte');
		await make(actor, 'Contabilidad');

		expect(await renameDepartment(actor, id, { name: 'Atención' })).toEqual({
			ok: true,
			value: undefined
		});
		expect((await listDepartments(organisation.id)).map((entry) => entry.name)).toEqual([
			'Atención',
			'Contabilidad'
		]);

		expect(await renameDepartment(actor, id, { name: 'Contabilidad' })).toEqual({
			ok: false,
			error: 'duplicate_name'
		});
	});

	it('treats renaming to the same name as a success that touches nothing', async () => {
		const { actor } = await setup();
		const id = await make(actor, 'Soporte');
		const [before] = await getDb().select().from(departments).where(eq(departments.id, id));

		expect(await renameDepartment(actor, id, { name: 'Soporte' })).toEqual({
			ok: true,
			value: undefined
		});

		const [after] = await getDb().select().from(departments).where(eq(departments.id, id));
		expect(after.updatedAt).toEqual(before.updatedAt);
	});

	it('answers not_found for a department that does not exist', async () => {
		const { actor } = await setup();
		const missing = crypto.randomUUID();

		expect(await renameDepartment(actor, missing, { name: 'X' })).toEqual({
			ok: false,
			error: 'not_found'
		});
		expect(await deleteDepartment(actor, missing)).toEqual({ ok: false, error: 'not_found' });
	});

	it('deletes an empty department', async () => {
		const { organisation, actor } = await setup();
		const id = await make(actor, 'Soporte');

		expect(await deleteDepartment(actor, id)).toEqual({ ok: true, value: undefined });
		expect(await listDepartments(organisation.id)).toEqual([]);
	});

	it('refuses to delete a department with people, reporting how many, and keeps the row', async () => {
		const { organisation, actor } = await setup();
		const id = await make(actor, 'Soporte');
		const grace = await createPerson(organisation.id, 'Grace Hopper');
		const alan = await createPerson(organisation.id, 'Alan Turing');
		await assign(grace.id, id);
		await assign(alan.id, id);

		expect(await deleteDepartment(actor, id)).toEqual({
			ok: false,
			error: { kind: 'in_use', people: 2 }
		});
		expect(await listDepartments(organisation.id)).toEqual([
			{ id, name: 'Soporte', peopleCount: 2 }
		]);
		const [person] = await getDb().select().from(people).where(eq(people.id, grace.id));
		expect(person.departmentId).toBe(id);
	});

	it("never reads, renames or deletes another organisation's departments", async () => {
		const mine = await setup();
		const theirs = await setup('globex');
		const foreign = await make(theirs.actor, 'Soporte');
		const stranger = await createPerson(theirs.organisation.id, 'Grace Hopper');
		await assign(stranger.id, foreign);

		expect(await listDepartments(mine.organisation.id)).toEqual([]);
		expect(await renameDepartment(mine.actor, foreign, { name: 'Mío' })).toEqual({
			ok: false,
			error: 'not_found'
		});
		expect(await deleteDepartment(mine.actor, foreign)).toEqual({
			ok: false,
			error: 'not_found'
		});
		expect(await listDepartments(theirs.organisation.id)).toEqual([
			{ id: foreign, name: 'Soporte', peopleCount: 1 }
		]);
	});
});

describe('departmentInput', () => {
	it('trims the name and bounds it to 1-80 characters', () => {
		expect(departmentInput.parse({ name: '  Soporte  ' })).toEqual({ name: 'Soporte' });
		expect(departmentInput.safeParse({ name: '   ' }).success).toBe(false);
		expect(departmentInput.safeParse({ name: 'a'.repeat(80) }).success).toBe(true);
		expect(departmentInput.safeParse({ name: 'a'.repeat(81) }).success).toBe(false);
	});
});
