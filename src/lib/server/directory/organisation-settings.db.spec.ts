import { describe, expect, it } from 'vitest';
import { createOrganisation, createViewer } from '../assets/testing/fixtures';
import { can } from '../access/permissions';
import {
	getTechniciansEditDirectory,
	resolveSessionUser,
	setTechniciansEditDirectory
} from './index';

describe('technicians edit the directory (ADR 0044)', () => {
	it('is off for a new organisation', async () => {
		const organisation = await createOrganisation();
		expect(await getTechniciansEditDirectory(organisation.id)).toBe(false);
	});

	it('lets an admin switch it on and off', async () => {
		const organisation = await createOrganisation();
		const admin = await createViewer(organisation.id, 'admin');

		expect(await setTechniciansEditDirectory(admin, true)).toEqual({ ok: true, value: true });
		expect(await getTechniciansEditDirectory(organisation.id)).toBe(true);

		await setTechniciansEditDirectory(admin, false);
		expect(await getTechniciansEditDirectory(organisation.id)).toBe(false);
	});

	it('refuses a technician and an employee', async () => {
		const organisation = await createOrganisation();
		const technician = await createViewer(organisation.id, 'technician', 'Tom Technician');
		const employee = await createViewer(organisation.id, 'employee', 'Eve Employee');

		expect(await setTechniciansEditDirectory(technician, true)).toMatchObject({
			ok: false,
			error: 'forbidden'
		});
		expect(await setTechniciansEditDirectory(employee, true)).toMatchObject({ ok: false });
		expect(await getTechniciansEditDirectory(organisation.id)).toBe(false);
	});

	it('lends people.edit to the technician of that organisation on the next request', async () => {
		const organisation = await createOrganisation();
		const admin = await createViewer(organisation.id, 'admin');
		const technician = await createViewer(organisation.id, 'technician', 'Tom Technician');

		expect(can(await resolveSessionUser(technician.id), 'people.edit')).toBe(false);

		await setTechniciansEditDirectory(admin, true);
		const lent = await resolveSessionUser(technician.id);
		expect(can(lent, 'people.edit')).toBe(true);
		// Editing data is not administering access.
		expect(can(lent, 'people.manage')).toBe(false);
		expect(can(lent, 'organisation.manage')).toBe(false);

		await setTechniciansEditDirectory(admin, false);
		expect(can(await resolveSessionUser(technician.id), 'people.edit')).toBe(false);
	});

	it('does not lend anything to an employee, nor across organisations', async () => {
		const acme = await createOrganisation();
		const other = await createOrganisation('Other', 'other');
		const admin = await createViewer(acme.id, 'admin');
		const employee = await createViewer(acme.id, 'employee', 'Eve Employee');
		const outsider = await createViewer(other.id, 'technician', 'Olga Outsider');

		await setTechniciansEditDirectory(admin, true);

		expect(can(await resolveSessionUser(employee.id), 'people.edit')).toBe(false);
		expect(can(await resolveSessionUser(outsider.id), 'people.edit')).toBe(false);
	});
});
