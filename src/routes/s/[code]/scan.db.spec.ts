import { describe, expect, it } from 'vitest';
import {
	createAsset,
	createCatalogue,
	createOrganisation,
	createViewer
} from '#lib/server/assets/testing/fixtures.js';
import type { SessionUser } from '#lib/server/auth/guards.js';
import { GET } from './+server';

type Event = Parameters<typeof GET>[0];

/** Runs the handler; `redirect()` and `error()` throw, so the outcome is what was thrown. */
async function scan(user: SessionUser | null, code: string) {
	const headers: Record<string, string> = {};
	const event = {
		locals: { user },
		params: { code },
		url: new URL(`http://localhost/s/${encodeURIComponent(code)}`),
		setHeaders: (h: Record<string, string>) => Object.assign(headers, h)
	} as unknown as Event;

	try {
		await GET(event);
	} catch (thrown) {
		const { status, location, body } = thrown as {
			status: number;
			location?: string;
			body?: { message: string };
		};
		return { status, location, message: body?.message, headers };
	}
	throw new Error('the scan route must always redirect or fail');
}

async function floor() {
	const organisation = await createOrganisation();
	const technician = await createViewer(organisation.id, 'technician', 'Tess Technician');
	const eva = await createViewer(organisation.id, 'employee', 'Eva Employee');
	const { modelId } = await createCatalogue(organisation.id, 'LaserJet 400', 'HP', 'Printers');
	await createAsset(organisation.id, modelId, {
		name: 'Floor printer',
		assetTag: 'AST-0001',
		shared: true
	});
	await createAsset(organisation.id, modelId, {
		name: 'Eva laptop',
		assetTag: 'AST-0002',
		custodianPersonId: eva.personId
	});
	const other = await createCatalogue(organisation.id, 'ThinkPad', 'Lenovo', 'Laptops').then(
		({ modelId }) => modelId
	);
	await createAsset(organisation.id, other, { name: 'Nobody laptop', assetTag: 'AST-0003' });
	return { technician, eva };
}

describe('GET /s/[code]', () => {
	it('sends a technician to the asset', async () => {
		const { technician } = await floor();
		const result = await scan(technician, 'AST-0001');
		expect(result.status).toBe(303);
		expect(result.location).toBe('/assets/AST-0001');
	});

	it('sends the custodian employee to their asset', async () => {
		const { eva } = await floor();
		expect((await scan(eva, 'AST-0002')).location).toBe('/assets/AST-0002');
	});

	it('sends an employee to a shared asset', async () => {
		const { eva } = await floor();
		expect((await scan(eva, 'AST-0001')).location).toBe('/assets/AST-0001');
	});

	it('answers 404 for an asset an employee may not see, like a missing one', async () => {
		const { eva } = await floor();
		const hidden = await scan(eva, 'AST-0003');
		const missing = await scan(eva, 'AST-9999');
		expect(hidden.status).toBe(404);
		expect(missing.status).toBe(404);
		expect(hidden.message).toBe(missing.message);
	});

	it('sends a visitor without a session to the login, which returns here', async () => {
		const result = await scan(null, 'AST-0001');
		expect(result.status).toBe(303);
		expect(result.location).toBe('/login?redirectTo=%2Fs%2FAST-0001');
	});

	it('is never cached', async () => {
		const { technician } = await floor();
		expect((await scan(technician, 'AST-0001')).headers['Cache-Control']).toBe('no-store');
		expect((await scan(null, 'AST-0001')).headers['Cache-Control']).toBe('no-store');
	});
});
