import { describe, expect, it } from 'vitest';
import { createOrganisation, createViewer } from '#lib/server/assets/testing/fixtures.js';
import type { SessionUser } from '#lib/server/auth/guards.js';
import { actions, load } from './+page.server';

const CSV = 'Nombre completo,Correo electrónico\nAda Lovelace,ada@example.com\n';
const MAPPING = {
	fullName: { column: 'Nombre completo' },
	email: { column: 'Correo electrónico' }
};

function event(user: SessionUser | null, csv = CSV, withMapping = true) {
	const body = new FormData();
	body.set('file', new File([csv], 'people.csv', { type: 'text/csv' }));
	if (withMapping) body.set('mapping', JSON.stringify(MAPPING));
	return {
		locals: { user },
		request: new Request('http://localhost/directory/import', { method: 'POST', body })
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

describe('/directory/import', () => {
	it('answers 404 to a technician on the page and on every action', async () => {
		const organisation = await createOrganisation();
		const technician = await createViewer(organisation.id, 'technician', 'Tom Technician');

		expect(await statusOf(() => load({ locals: { user: technician } } as never))).toBe(404);
		for (const name of ['analyse', 'preview', 'commit'] as const) {
			expect(await statusOf(() => actions[name](event(technician)))).toBe(404);
		}
	});

	it('walks an admin through analyse, preview and commit', async () => {
		const organisation = await createOrganisation();
		const admin = await createViewer(organisation.id, 'admin');

		const analysed = (await actions.analyse(event(admin, CSV, false))) as Reply;
		expect(analysed.headers).toEqual(['Nombre completo', 'Correo electrónico']);
		expect(analysed.sample).toEqual([['Ada Lovelace'], ['ada@example.com']]);
		expect(analysed.suggested).toMatchObject(MAPPING);

		const previewed = (await actions.preview(event(admin))) as Reply;
		expect(previewed).toMatchObject({ step: 'preview', create: 1, skipped: 0, errorCount: 0 });

		const committed = (await actions.commit(event(admin))) as Reply;
		expect(committed).toEqual({ step: 'commit', created: 1, skipped: 0 });
	});

	it('refuses a bad file with a message and a bad commit with its errors', async () => {
		const organisation = await createOrganisation();
		const admin = await createViewer(organisation.id, 'admin');

		const empty = (await actions.analyse(event(admin, ''))) as Reply;
		expect(empty.status).toBe(400);
		expect(empty.data?.message).toBeTypeOf('string');

		const invalid = (await actions.commit(
			event(admin, 'Nombre completo,Correo electrónico\nAda,nope\n')
		)) as Reply;
		expect(invalid.status).toBe(409);
		expect(invalid.data).toMatchObject({ step: 'preview', errorCount: 1 });
	});
});
