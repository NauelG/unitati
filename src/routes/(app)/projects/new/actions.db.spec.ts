import { describe, expect, it } from 'vitest';
import { listProjects } from '#lib/server/projects/index.js';
import { createWorkspace } from '#lib/server/projects/testing/fixtures.js';
import { actionEvent, outcomeOf } from '#lib/server/projects/testing/action-event.js';
import { actions } from './+page.server';

describe('creating a project', () => {
	it('refuses a viewer who may only read assigned work with a 403 and writes nothing', async () => {
		const { employee, technician } = await createWorkspace();

		const { thrown } = await outcomeOf(() =>
			actions.create(actionEvent(employee, { name: 'Sneaky' }))
		);

		expect(thrown?.status).toBe(403);
		expect(await listProjects(technician)).toEqual([]);
	});

	it('answers a blank name with a message and creates nothing', async () => {
		const { technician } = await createWorkspace();

		const { returned } = await outcomeOf(() =>
			actions.create(actionEvent(technician, { name: '  ', ownerPersonId: '', dueDate: '' }))
		);

		expect(returned?.status).toBe(400);
		expect(returned?.data).toMatchObject({ action: 'create', field: 'name' });
		expect(await listProjects(technician)).toEqual([]);
	});

	it('creates the project and lands on its record', async () => {
		const { technician } = await createWorkspace();

		const { thrown } = await outcomeOf(() =>
			actions.create(
				actionEvent(technician, {
					name: 'Office move',
					description: 'Third floor',
					ownerPersonId: technician.personId!,
					dueDate: '2030-01-31'
				})
			)
		);

		const [project] = await listProjects(technician);
		expect(project).toMatchObject({ name: 'Office move', dueDate: '2030-01-31' });
		expect(project.ownerPersonId).toBe(technician.personId);
		expect(thrown?.status).toBe(303);
		expect(thrown?.location).toBe(`/projects/${project.projectTag}`);
	});

	it('says so when the owner is not a person of the organisation', async () => {
		const { technician } = await createWorkspace();

		const { returned } = await outcomeOf(() =>
			actions.create(
				actionEvent(technician, { name: 'Office move', ownerPersonId: crypto.randomUUID() })
			)
		);

		expect(returned?.status).toBe(400);
		expect(returned?.data).toMatchObject({ field: 'ownerPersonId' });
	});
});
