import { describe, expect, it } from 'vitest';
import {
	createAsset,
	createCatalogue,
	createLocation,
	createOrganisation,
	createViewer
} from '../assets/testing/fixtures';
import { authenticateRequest } from './authenticate-request';
import { handleApiRequest } from './dispatch';
import { createApiKey } from './keys';
import type { ApiPrincipal } from './keys';

/**
 * The locations catalogue over HTTP (#180): a real `Request` through the
 * dispatcher against a real database, asserted as a `curl` would see it.
 */

async function workspace(name = 'Acme', slug = 'acme') {
	const organisation = await createOrganisation(name, slug);
	const technician = await createViewer(organisation.id, 'technician', `Tom ${name}`);
	return { organisation, technician };
}

async function keyFor(
	actor: Awaited<ReturnType<typeof workspace>>['technician'],
	scopes: Parameters<typeof createApiKey>[1]['scopes'] = ['assets.view', 'assets.manage']
) {
	const issued = await createApiKey(actor, {
		name: crypto.randomUUID(),
		scopes,
		expiresInDays: 90
	});
	if (!issued.ok) throw new Error(issued.error);
	return issued.value.key;
}

async function send(method: string, path: string, key: string, body?: Record<string, unknown>) {
	const request = new Request(`http://localhost${path}`, {
		method,
		headers: {
			authorization: `Bearer ${key}`,
			...(body ? { 'content-type': 'application/json' } : {})
		},
		body: body ? JSON.stringify(body) : undefined
	});
	const locals = { ...(await authenticateRequest(request)) } as unknown as App.Locals;
	const response = await handleApiRequest({ request, locals });
	const text = await response.text();
	return { response, body: text ? JSON.parse(text) : null };
}

/** An employee cannot own a key (slice A), so the principal is built by hand. */
async function sendAs(principal: ApiPrincipal, method: string, path: string) {
	const request = new Request(`http://localhost${path}`, { method });
	const locals = {
		user: principal,
		api: { ok: true, keyId: principal.keyId }
	} as unknown as App.Locals;
	const response = await handleApiRequest({ request, locals });
	const text = await response.text();
	return { response, body: text ? JSON.parse(text) : null };
}

async function make(key: string, body: Record<string, unknown>) {
	const { response, body: json } = await send('POST', '/api/v1/locations', key, body);
	expect(response.status).toBe(201);
	return json.data as { id: string };
}

describe('GET /api/v1/locations', () => {
	it('lists the tree ordered by path and reads one location by id', async () => {
		const { technician } = await workspace();
		const key = await keyFor(technician);
		const office = await make(key, { name: 'Barcelona office', code: 'BCN' });
		const floor = await make(key, { name: 'Floor 1', parentId: office.id, code: 'BCN-1' });
		await make(key, { name: 'Barcelona 2' });

		const list = await send('GET', '/api/v1/locations', key);
		expect(list.response.status).toBe(200);
		expect(list.body.data.map((item: { path: string }) => item.path)).toEqual([
			'Barcelona 2',
			'Barcelona office',
			'Barcelona office › Floor 1'
		]);

		const one = await send('GET', `/api/v1/locations/${floor.id}`, key);
		expect(one.response.status).toBe(200);
		expect(one.body.data).toEqual({
			id: floor.id,
			name: 'Floor 1',
			parentId: office.id,
			path: 'Barcelona office › Floor 1',
			code: 'BCN-1',
			address: null,
			notes: null,
			latitude: null,
			longitude: null
		});
	});

	it('answers an employee on every location endpoint as if it were not there', async () => {
		const { organisation, technician } = await workspace();
		const key = await keyFor(technician);
		const room = await make(key, { name: 'Room' });
		const employee = await createViewer(organisation.id, 'employee', 'Eve Employee');
		const principal: ApiPrincipal = {
			...employee,
			scopes: ['assets.view.shared', 'assets.view.own'],
			keyId: crypto.randomUUID()
		};

		for (const [method, path] of [
			['GET', '/api/v1/locations'],
			['GET', `/api/v1/locations/${room.id}`],
			['POST', '/api/v1/locations'],
			['PATCH', `/api/v1/locations/${room.id}`],
			['DELETE', `/api/v1/locations/${room.id}`]
		]) {
			const { response } = await sendAs(principal, method, path);
			expect(response.status, `${method} ${path}`).toBe(404);
		}
	});

	it('answers 404 for an id from another organisation on GET, PATCH and DELETE', async () => {
		const { technician } = await workspace();
		const other = await workspace('Other', 'other');
		const key = await keyFor(technician);
		const foreign = await createLocation(other.organisation.id, 'Elsewhere');

		for (const [method, body] of [
			['GET', undefined],
			['PATCH', { name: 'Hijacked' }],
			['DELETE', undefined]
		] as const) {
			const { response, body: json } = await send(
				method,
				`/api/v1/locations/${foreign.id}`,
				key,
				body
			);
			expect(response.status, method).toBe(404);
			expect(json.error.code).toBe('not_found');
		}
	});
});

describe('POST /api/v1/locations', () => {
	it('creates a location and points the Location header at it', async () => {
		const { technician } = await workspace();
		const key = await keyFor(technician);

		const { response, body } = await send('POST', '/api/v1/locations', key, {
			name: '  Barcelona office ',
			address: 'Carrer de Mallorca 1',
			latitude: 41.3874,
			longitude: 2.1686
		});

		expect(response.status).toBe(201);
		expect(body.data).toMatchObject({
			name: 'Barcelona office',
			parentId: null,
			path: 'Barcelona office',
			address: 'Carrer de Mallorca 1',
			latitude: 41.3874,
			longitude: 2.1686
		});
		expect(response.headers.get('location')).toBe(`/api/v1/locations/${body.data.id}`);
	});

	it('refuses a missing name, a lone coordinate and an out-of-range one with issues on the fields', async () => {
		const { technician } = await workspace();
		const key = await keyFor(technician);

		const lone = await send('POST', '/api/v1/locations', key, { name: 'A', latitude: 10 });
		expect(lone.response.status).toBe(400);
		expect(lone.body.error.code).toBe('invalid_input');
		expect(lone.body.error.issues.map((i: { path: string[] }) => i.path)).toContainEqual([
			'longitude'
		]);

		const range = await send('POST', '/api/v1/locations', key, {
			name: 'B',
			latitude: 91,
			longitude: 0
		});
		expect(range.response.status).toBe(400);
		expect(range.body.error.issues.map((i: { path: string[] }) => i.path)).toContainEqual([
			'latitude'
		]);

		const blank = await send('POST', '/api/v1/locations', key, { name: '   ' });
		expect(blank.response.status).toBe(400);
		expect(blank.body.error.issues.map((i: { path: string[] }) => i.path)).toContainEqual(['name']);
	});

	it('refuses a parent from another organisation as an issue on parentId', async () => {
		const { technician } = await workspace();
		const other = await workspace('Other', 'other');
		const key = await keyFor(technician);
		const foreign = await createLocation(other.organisation.id, 'Elsewhere');

		const { response, body } = await send('POST', '/api/v1/locations', key, {
			name: 'Child',
			parentId: foreign.id
		});

		expect(response.status).toBe(400);
		expect(body.error.code).toBe('invalid_input');
		expect(body.error.issues.map((i: { path: string[] }) => i.path)).toContainEqual(['parentId']);
	});

	it('answers 409 duplicate_name for a sibling name and 409 duplicate_code for a code', async () => {
		const { technician } = await workspace();
		const key = await keyFor(technician);
		await make(key, { name: 'Office', code: 'OFF' });

		const name = await send('POST', '/api/v1/locations', key, { name: 'Office' });
		expect(name.response.status).toBe(409);
		expect(name.body.error.code).toBe('duplicate_name');

		const code = await send('POST', '/api/v1/locations', key, { name: 'Other', code: 'OFF' });
		expect(code.response.status).toBe(409);
		expect(code.body.error.code).toBe('duplicate_code');
	});
});

describe('PATCH /api/v1/locations/{id}', () => {
	it('changes only the fields it names, moves to the root on parentId null and clears with null', async () => {
		const { technician } = await workspace();
		const key = await keyFor(technician);
		const office = await make(key, { name: 'Office' });
		const floor = await make(key, {
			name: 'Floor 1',
			parentId: office.id,
			address: 'Somewhere',
			notes: 'Keep',
			latitude: 1,
			longitude: 2
		});

		const code = await send('PATCH', `/api/v1/locations/${floor.id}`, key, { code: 'F1' });
		expect(code.response.status).toBe(200);
		expect(code.body.data).toMatchObject({
			name: 'Floor 1',
			parentId: office.id,
			code: 'F1',
			address: 'Somewhere',
			notes: 'Keep',
			latitude: 1,
			longitude: 2
		});

		const cleared = await send('PATCH', `/api/v1/locations/${floor.id}`, key, { address: null });
		expect(cleared.body.data).toMatchObject({ address: null, code: 'F1', notes: 'Keep' });

		const moved = await send('PATCH', `/api/v1/locations/${floor.id}`, key, { parentId: null });
		expect(moved.body.data).toMatchObject({ parentId: null, path: 'Floor 1' });
	});

	it('refuses a null name', async () => {
		const { technician } = await workspace();
		const key = await keyFor(technician);
		const office = await make(key, { name: 'Office' });

		const { response, body } = await send('PATCH', `/api/v1/locations/${office.id}`, key, {
			name: null
		});

		expect(response.status).toBe(400);
		expect(body.error.issues.map((i: { path: string[] }) => i.path)).toContainEqual(['name']);
	});

	it('refuses a cycle and a foreign parent as an issue on parentId', async () => {
		const { technician } = await workspace();
		const other = await workspace('Other', 'other');
		const key = await keyFor(technician);
		const office = await make(key, { name: 'Office' });
		const floor = await make(key, { name: 'Floor', parentId: office.id });
		const foreign = await createLocation(other.organisation.id, 'Elsewhere');

		for (const parentId of [office.id, floor.id, foreign.id]) {
			const { response, body } = await send('PATCH', `/api/v1/locations/${office.id}`, key, {
				parentId
			});
			expect(response.status, parentId).toBe(400);
			expect(body.error.code).toBe('invalid_input');
			expect(body.error.issues.map((i: { path: string[] }) => i.path)).toContainEqual(['parentId']);
		}
	});

	it('answers 409 for a duplicate name or code', async () => {
		const { technician } = await workspace();
		const key = await keyFor(technician);
		await make(key, { name: 'Taken', code: 'T' });
		const other = await make(key, { name: 'Other' });

		const name = await send('PATCH', `/api/v1/locations/${other.id}`, key, { name: 'Taken' });
		expect(name.response.status).toBe(409);
		expect(name.body.error.code).toBe('duplicate_name');

		const code = await send('PATCH', `/api/v1/locations/${other.id}`, key, { code: 'T' });
		expect(code.response.status).toBe(409);
		expect(code.body.error.code).toBe('duplicate_code');
	});
});

describe('DELETE /api/v1/locations/{id}', () => {
	it('deletes an unused leaf with 204', async () => {
		const { technician } = await workspace();
		const key = await keyFor(technician);
		const leaf = await make(key, { name: 'Leaf' });

		const { response, body } = await send('DELETE', `/api/v1/locations/${leaf.id}`, key);
		expect(response.status).toBe(204);
		expect(body).toBeNull();

		const gone = await send('GET', `/api/v1/locations/${leaf.id}`, key);
		expect(gone.response.status).toBe(404);
	});

	it('answers 409 in_use with the real counts and deletes nothing', async () => {
		const { organisation, technician } = await workspace();
		const key = await keyFor(technician);
		const office = await make(key, { name: 'Office' });
		await make(key, { name: 'Floor 1', parentId: office.id });
		await make(key, { name: 'Floor 2', parentId: office.id });
		const catalogue = await createCatalogue(organisation.id);
		await createAsset(organisation.id, catalogue.modelId, { locationId: office.id });

		const { response, body } = await send('DELETE', `/api/v1/locations/${office.id}`, key);

		expect(response.status).toBe(409);
		expect(body.error.code).toBe('in_use');
		expect(body.error.details).toEqual({ children: 2, assets: 1 });
		const list = await send('GET', '/api/v1/locations', key);
		expect(list.body.data).toHaveLength(3);
	});
});
