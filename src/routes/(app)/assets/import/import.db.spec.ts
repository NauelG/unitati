import { describe, expect, it } from 'vitest';
import { createOrganisation, createViewer } from '#lib/server/assets/testing/fixtures.js';
import type { SessionUser } from '#lib/server/auth/guards.js';
import { actions, load } from './+page.server';

const CSV =
	'Tag,Name,Model,Manufacturer,Category,Status\nT-1,Laptop,Air,Apple,Laptops,Ready to Deploy (deployable)\n';
const MAPPING = {
	fields: {
		assetTag: { column: 'Tag' },
		name: { column: 'Name' },
		model: { column: 'Model' },
		manufacturer: { column: 'Manufacturer' },
		category: { column: 'Category' },
		state: { column: 'Status' }
	},
	stateValues: { 'Ready to Deploy (deployable)': 'in_stock' }
};

function event(user: SessionUser | null, csv = CSV, mapping: unknown = MAPPING) {
	const body = new FormData();
	body.set('file', new File([csv], 'assets.csv', { type: 'text/csv' }));
	if (mapping) body.set('mapping', JSON.stringify(mapping));
	return {
		locals: { user },
		request: new Request('http://localhost/assets/import', { method: 'POST', body })
	} as never;
}

async function statusOf(run: () => unknown): Promise<number | undefined> {
	try {
		await run();
	} catch (thrown) {
		return (thrown as { status?: number }).status;
	}
	return undefined;
}

type Reply = Record<string, unknown> & { status?: number; data?: Record<string, unknown> };

describe('/assets/import', () => {
	it('is closed to an employee on the page and on every action (the app answers 404)', async () => {
		const organisation = await createOrganisation();
		const employee = await createViewer(organisation.id, 'employee', 'Eve Employee');

		expect(await statusOf(() => load({ locals: { user: employee } } as never))).toBe(404);
		for (const name of ['analyse', 'preview', 'commit'] as const) {
			expect(await statusOf(() => actions[name](event(employee)))).toBe(404);
		}
	});

	it('walks a technician through analyse, preview and commit', async () => {
		const organisation = await createOrganisation();
		const technician = await createViewer(organisation.id, 'technician', 'Tom Technician');

		const analysed = (await actions.analyse(event(technician, CSV, null))) as Reply;
		expect(analysed.headers).toEqual([
			'Tag',
			'Name',
			'Model',
			'Manufacturer',
			'Category',
			'Status'
		]);
		expect(analysed.suggested).toMatchObject(MAPPING.fields);
		expect(analysed.stateValues).toMatchObject({
			Status: [{ value: 'Ready to Deploy (deployable)', suggested: 'in_stock' }]
		});

		const previewed = (await actions.preview(event(technician))) as Reply;
		expect(previewed).toMatchObject({
			step: 'preview',
			create: 1,
			newModels: ['Apple · Air (Laptops)'],
			errorCount: 0
		});

		const committed = (await actions.commit(event(technician))) as Reply;
		expect(committed).toEqual({ step: 'commit', created: 1, skipped: 0 });
	});

	it('refuses a bad file with a message and a bad commit with its errors', async () => {
		const organisation = await createOrganisation();
		const technician = await createViewer(organisation.id, 'technician', 'Tom Technician');

		const empty = (await actions.analyse(event(technician, ''))) as Reply;
		expect(empty.status).toBe(400);

		const invalid = (await actions.commit(
			event(technician, 'Tag,Name,Model,Manufacturer,Category,Status\nT-1,L,Air,,,\n')
		)) as Reply;
		expect(invalid.status).toBe(409);
		expect(invalid.data).toMatchObject({ step: 'preview', errorCount: 1 });
	});
});
