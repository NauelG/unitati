import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { ensureDefaultHandoverTemplates } from '../assets';
import { categories, handovers } from '../assets/schema';
import {
	createAsset,
	createCatalogue,
	createLocation,
	createOrganisation,
	createPerson,
	createViewer
} from '../assets/testing/fixtures';
import { listActivity } from '../activity';
import { getDb } from '../db';
import { authenticateRequest } from './authenticate-request';
import { handleApiRequest } from './dispatch';
import { createApiKey } from './keys';
import type { ApiPrincipal } from './keys';

/**
 * The asset use cases over HTTP (#137): a real `Request` through the dispatcher
 * against a real database, asserted as a `curl` would see it.
 */

async function workspace() {
	const organisation = await createOrganisation();
	const technician = await createViewer(organisation.id, 'technician', 'Tom Technician');
	const catalogue = await createCatalogue(organisation.id);
	return { organisation, technician, catalogue };
}

async function keyFor(
	actor: Awaited<ReturnType<typeof workspace>>['technician'],
	scopes: Parameters<typeof createApiKey>[1]['scopes']
) {
	const issued = await createApiKey(actor, {
		name: crypto.randomUUID(),
		scopes,
		expiresInDays: 90
	});
	if (!issued.ok) throw new Error(issued.error);
	return issued.value.key;
}

async function respond(response: Response) {
	const text = await response.text();
	return { response, body: text ? JSON.parse(text) : null };
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
	return respond(await handleApiRequest({ request, locals }));
}

/** A principal built by hand: an employee cannot own a key, and a scope list is not needed to prove a row rule. */
async function sendAs(principal: ApiPrincipal, method: string, path: string) {
	const request = new Request(`http://localhost${path}`, { method });
	const locals = {
		user: principal,
		api: { ok: true, keyId: principal.keyId }
	} as unknown as App.Locals;
	return respond(await handleApiRequest({ request, locals }));
}

const SHARED_ONLY_FORBIDDEN = ['serial', 'custodian', 'state', 'cost', 'purchase', 'modelName'];

describe('POST /api/v1/assets', () => {
	it('lets a technician key scoped to assets.manage register an asset with an explicit tag, attributed to the owner', async () => {
		const { organisation, technician, catalogue } = await workspace();
		const key = await keyFor(technician, ['assets.manage']);

		const { response, body } = await send('POST', '/api/v1/assets', key, {
			name: 'MacBook Pro',
			assetTag: 'LAP-0042',
			serial: 'C02XK0ABJGH5',
			assetModelId: catalogue.modelId
		});

		expect(response.status).toBe(201);
		expect(response.headers.get('location')).toBe('/api/v1/assets/LAP-0042');
		expect(body.data).toMatchObject({
			visibility: 'full',
			tag: 'LAP-0042',
			name: 'MacBook Pro',
			serial: 'C02XK0ABJGH5',
			state: 'in_stock',
			custodian: null
		});
		expect(body.data.id).toBeUndefined();

		const [asset] = await getDb().query.assets.findMany({
			where: (a, { eq }) => eq(a.assetTag, 'LAP-0042')
		});
		const history = await listActivity({
			organisationId: organisation.id,
			target: { assetId: asset.id }
		});
		expect(history).toHaveLength(1);
		expect(history[0]).toMatchObject({
			verb: 'asset.created',
			actorPersonId: technician.personId
		});
	});

	it('generates a tag when none is sent', async () => {
		const { technician, catalogue } = await workspace();
		const key = await keyFor(technician, ['assets.manage']);

		const { response, body } = await send('POST', '/api/v1/assets', key, {
			name: 'Dock',
			assetModelId: catalogue.modelId
		});

		expect(response.status).toBe(201);
		expect(body.data.tag).toMatch(/^AST-\d{4}$/);
	});

	it('answers 409 with the domain code for a duplicate tag and for a duplicate serial', async () => {
		const { organisation, technician, catalogue } = await workspace();
		const existing = await createAsset(organisation.id, catalogue.modelId, { serial: 'SER-1' });
		const key = await keyFor(technician, ['assets.manage']);

		const tag = await send('POST', '/api/v1/assets', key, {
			name: 'Copy',
			assetTag: existing.assetTag,
			assetModelId: catalogue.modelId
		});
		const serial = await send('POST', '/api/v1/assets', key, {
			name: 'Copy',
			serial: 'SER-1',
			assetModelId: catalogue.modelId
		});

		expect(tag.response.status).toBe(409);
		expect(tag.body.error.code).toBe('duplicate_asset_tag');
		expect(serial.response.status).toBe(409);
		expect(serial.body.error.code).toBe('duplicate_serial');
	});

	it('answers 400 on the field for a model or a location that does not exist', async () => {
		const { technician, catalogue } = await workspace();
		const key = await keyFor(technician, ['assets.manage']);

		const model = await send('POST', '/api/v1/assets', key, {
			name: 'x',
			assetModelId: crypto.randomUUID()
		});
		const location = await send('POST', '/api/v1/assets', key, {
			name: 'x',
			assetModelId: catalogue.modelId,
			locationId: crypto.randomUUID()
		});

		expect(model.response.status).toBe(400);
		expect(model.body.error.issues[0].path).toEqual(['assetModelId']);
		expect(location.response.status).toBe(400);
		expect(location.body.error.issues[0].path).toEqual(['locationId']);
	});

	it('does not let the body set custody: that is an event with its own endpoint', async () => {
		const { organisation, technician, catalogue } = await workspace();
		const holder = await createPerson(organisation.id, 'Ada Lovelace');
		const key = await keyFor(technician, ['assets.manage']);

		const { body } = await send('POST', '/api/v1/assets', key, {
			name: 'x',
			assetModelId: catalogue.modelId,
			custodianPersonId: holder.id
		});

		expect(body.data.custodian).toBeNull();
	});

	it('answers 404 for a key that lacks assets.manage', async () => {
		const { technician, catalogue } = await workspace();
		const key = await keyFor(technician, ['assets.view']);

		const { response } = await send('POST', '/api/v1/assets', key, {
			name: 'x',
			assetModelId: catalogue.modelId
		});

		expect(response.status).toBe(404);
	});
});

describe('GET /api/v1/assets', () => {
	it('lists the full view, paged, with meta', async () => {
		const { organisation, technician, catalogue } = await workspace();
		await createAsset(organisation.id, catalogue.modelId, { assetTag: 'AST-0001' });
		await createAsset(organisation.id, catalogue.modelId, { assetTag: 'AST-0002' });
		const key = await keyFor(technician, ['assets.view']);

		const { response, body } = await send('GET', '/api/v1/assets?perPage=1&page=2', key);

		expect(response.status).toBe(200);
		expect(body.data.map((a: { tag: string }) => a.tag)).toEqual(['AST-0002']);
		expect(body.data[0].visibility).toBe('full');
		expect(body.meta).toMatchObject({ page: 2, perPage: 1, total: 2, pageCount: 2 });
	});

	it('does not list another organisation’s assets', async () => {
		const { technician } = await workspace();
		const other = await createOrganisation('Other', 'other');
		const catalogue = await createCatalogue(other.id);
		await createAsset(other.id, catalogue.modelId);
		const key = await keyFor(technician, ['assets.view']);

		const { body } = await send('GET', '/api/v1/assets', key);

		expect(body.data).toEqual([]);
	});
});

describe('visibility', () => {
	async function shared() {
		const { organisation, technician, catalogue } = await workspace();
		const employee = await createViewer(organisation.id, 'employee', 'Eve Employee');
		const location = await createLocation(organisation.id, 'Floor 2');
		const printer = await createAsset(organisation.id, catalogue.modelId, {
			name: 'Floor printer',
			shared: true,
			serial: 'SECRET-SERIAL',
			locationId: location.id
		});
		const laptop = await createAsset(organisation.id, catalogue.modelId, {
			name: 'Somebody else’s laptop'
		});
		// Scopes are the principal's own: only the shared read.
		const principal: ApiPrincipal = {
			...employee,
			keyId: crypto.randomUUID(),
			scopes: ['assets.view.shared']
		} as ApiPrincipal;
		return { technician, printer, laptop, principal };
	}

	it('gives a principal holding only assets.view.shared the shared view, with nothing beyond name and location', async () => {
		const { printer, principal } = await shared();

		const { response, body } = await sendAs(principal, 'GET', `/api/v1/assets/${printer.assetTag}`);

		expect(response.status).toBe(200);
		expect(body.data).toEqual({
			visibility: 'shared',
			tag: printer.assetTag,
			name: 'Floor printer',
			locationPath: 'Floor 2'
		});
		for (const field of SHARED_ONLY_FORBIDDEN) expect(body.data).not.toHaveProperty(field);
		expect(JSON.stringify(body)).not.toContain('SECRET-SERIAL');
	});

	it('gives the same shared view in a list', async () => {
		const { printer, principal } = await shared();

		const { body } = await sendAs(principal, 'GET', '/api/v1/assets');

		expect(body.data).toHaveLength(1);
		expect(body.data[0]).toMatchObject({ visibility: 'shared', tag: printer.assetTag });
		expect(JSON.stringify(body)).not.toContain('SECRET-SERIAL');
	});

	it('answers 404 on an asset that is neither shared nor in its custody', async () => {
		const { laptop, principal } = await shared();

		const { response } = await sendAs(principal, 'GET', `/api/v1/assets/${laptop.assetTag}`);

		expect(response.status).toBe(404);
	});

	it('answers 404 on the timeline of a shared asset: history is not part of the shared view', async () => {
		const { printer, principal } = await shared();

		const { response } = await sendAs(
			principal,
			'GET',
			`/api/v1/assets/${printer.assetTag}/timeline`
		);

		expect(response.status).toBe(404);
	});
});

describe('PATCH /api/v1/assets/{tag}', () => {
	it('returns the new Location when the tag changes, and the old URL is 404 from then on', async () => {
		const { organisation, technician, catalogue } = await workspace();
		const asset = await createAsset(organisation.id, catalogue.modelId, { assetTag: 'OLD-1' });
		const key = await keyFor(technician, ['assets.manage', 'assets.view']);

		const patched = await send('PATCH', `/api/v1/assets/${asset.assetTag}`, key, {
			assetTag: 'NEW-1'
		});
		const oldUrl = await send('GET', '/api/v1/assets/OLD-1', key);
		const newUrl = await send('GET', '/api/v1/assets/NEW-1', key);

		expect(patched.response.status).toBe(200);
		expect(patched.body.data.tag).toBe('NEW-1');
		expect(patched.response.headers.get('location')).toBe('/api/v1/assets/NEW-1');
		expect(oldUrl.response.status).toBe(404);
		expect(newUrl.response.status).toBe(200);
	});

	it('edits fields without a Location header, and writes nothing to the history', async () => {
		const { organisation, technician, catalogue } = await workspace();
		const asset = await createAsset(organisation.id, catalogue.modelId, { name: 'Typo' });
		const key = await keyFor(technician, ['assets.manage']);

		const { response, body } = await send('PATCH', `/api/v1/assets/${asset.assetTag}`, key, {
			name: 'Fixed'
		});

		expect(response.status).toBe(200);
		expect(response.headers.get('location')).toBeNull();
		expect(body.data.name).toBe('Fixed');
		expect(
			await listActivity({ organisationId: organisation.id, target: { assetId: asset.id } })
		).toEqual([]);
	});

	it('answers 409 when the new tag is taken', async () => {
		const { organisation, technician, catalogue } = await workspace();
		const first = await createAsset(organisation.id, catalogue.modelId);
		const second = await createAsset(organisation.id, catalogue.modelId);
		const key = await keyFor(technician, ['assets.manage']);

		const { response, body } = await send('PATCH', `/api/v1/assets/${first.assetTag}`, key, {
			assetTag: second.assetTag
		});

		expect(response.status).toBe(409);
		expect(body.error.code).toBe('duplicate_asset_tag');
	});

	it('answers 404 for a key without assets.manage, and for an unknown tag', async () => {
		const { organisation, technician, catalogue } = await workspace();
		const asset = await createAsset(organisation.id, catalogue.modelId);
		const viewOnly = await keyFor(technician, ['assets.view']);
		const manage = await keyFor(technician, ['assets.manage']);

		const denied = await send('PATCH', `/api/v1/assets/${asset.assetTag}`, viewOnly, { name: 'x' });
		const unknown = await send('PATCH', '/api/v1/assets/NOPE-1', manage, { name: 'x' });

		expect(denied.response.status).toBe(404);
		expect(unknown.response.status).toBe(404);
	});
});

describe('custody, state, location and notes', () => {
	it('assigns custody, refuses a second assignment with 409, and returns it', async () => {
		const { organisation, technician, catalogue } = await workspace();
		const asset = await createAsset(organisation.id, catalogue.modelId);
		const ada = await createPerson(organisation.id, 'Ada Lovelace');
		const alan = await createPerson(organisation.id, 'Alan Turing');
		const key = await keyFor(technician, ['assets.checkout']);
		const path = `/api/v1/assets/${asset.assetTag}/custody`;

		const assigned = await send('POST', path, key, { personId: ada.id });
		const again = await send('POST', path, key, { personId: alan.id });
		const returned = await send('DELETE', path, key);
		const returnedTwice = await send('DELETE', path, key);

		expect(assigned.response.status).toBe(200);
		expect(assigned.body.handoverCode).toBeNull();
		expect(assigned.body.data.custodian).toEqual({ id: ada.id, name: 'Ada Lovelace' });
		expect(again.response.status).toBe(409);
		expect(again.body.error.code).toBe('already_in_custody');
		expect(returned.response.status).toBe(200);
		expect(returned.body.data.custodian).toBeNull();
		expect(returnedTwice.response.status).toBe(409);
		expect(returnedTwice.body.error.code).toBe('not_in_custody');
	});

	it('issues a handover for an asset whose category requires one, and returns its code', async () => {
		const { organisation, technician, catalogue } = await workspace();
		await ensureDefaultHandoverTemplates(getDb(), organisation.id);
		await getDb()
			.update(categories)
			.set({ requiresHandover: true })
			.where(eq(categories.id, catalogue.categoryId));
		const asset = await createAsset(organisation.id, catalogue.modelId);
		const ada = await createPerson(organisation.id, 'Ada Lovelace');
		const key = await keyFor(technician, ['assets.checkout']);

		const { response, body } = await send('POST', `/api/v1/assets/${asset.assetTag}/custody`, key, {
			personId: ada.id
		});

		expect(response.status).toBe(200);
		expect(body.handoverCode).toMatch(/^HND-\d{4}$/);
		expect(JSON.stringify(body)).not.toContain('/handover/');
		const [row] = await getDb().select().from(handovers);
		expect(row.code).toBe(body.handoverCode);
		// A personal key acts as its owner; only a service-account key is the issuer itself.
		expect(row.issuedByPersonId).toBe(technician.personId);
		expect(row.issuedByServiceAccountId).toBeNull();
	});

	it('answers 400 on personId for a person who does not exist', async () => {
		const { organisation, technician, catalogue } = await workspace();
		const asset = await createAsset(organisation.id, catalogue.modelId);
		const key = await keyFor(technician, ['assets.checkout']);

		const { response, body } = await send('POST', `/api/v1/assets/${asset.assetTag}/custody`, key, {
			personId: crypto.randomUUID()
		});

		expect(response.status).toBe(400);
		expect(body.error.issues[0].path).toEqual(['personId']);
	});

	it('changes state and location, and records both on the timeline attributed to the key owner', async () => {
		const { organisation, technician, catalogue } = await workspace();
		const asset = await createAsset(organisation.id, catalogue.modelId);
		const room = await createLocation(organisation.id, 'Server room');
		const key = await keyFor(technician, ['assets.manage', 'assets.view']);
		const base = `/api/v1/assets/${asset.assetTag}`;

		const state = await send('POST', `${base}/state`, key, { state: 'in_repair' });
		const location = await send('POST', `${base}/location`, key, { locationId: room.id });
		const timeline = await send('GET', `${base}/timeline`, key);

		expect(state.response.status).toBe(200);
		expect(state.body.data.state).toBe('in_repair');
		expect(location.body.data).toMatchObject({ locationId: room.id, locationPath: 'Server room' });
		expect(timeline.response.status).toBe(200);
		expect(timeline.body.data.map((e: { verb: string }) => e.verb)).toEqual([
			'location.changed',
			'state.changed'
		]);
		expect(timeline.body.data[0].actor).toMatchObject({
			kind: 'person',
			id: technician.personId,
			name: 'Tom Technician'
		});
	});

	it('clears a location with null, and refuses an unknown state and location', async () => {
		const { organisation, technician, catalogue } = await workspace();
		const room = await createLocation(organisation.id, 'Server room');
		const asset = await createAsset(organisation.id, catalogue.modelId, { locationId: room.id });
		const key = await keyFor(technician, ['assets.manage']);
		const base = `/api/v1/assets/${asset.assetTag}`;

		const cleared = await send('POST', `${base}/location`, key, { locationId: null });
		const unknown = await send('POST', `${base}/location`, key, {
			locationId: crypto.randomUUID()
		});
		const badState = await send('POST', `${base}/state`, key, { state: 'lost' });

		expect(cleared.body.data.locationId).toBeNull();
		expect(unknown.response.status).toBe(400);
		expect(unknown.body.error.issues[0].path).toEqual(['locationId']);
		expect(badState.response.status).toBe(400);
	});

	it('adds a note with 201, and answers 400 on text for an empty one', async () => {
		const { organisation, technician, catalogue } = await workspace();
		const asset = await createAsset(organisation.id, catalogue.modelId);
		const key = await keyFor(technician, ['assets.manage', 'assets.view']);
		const base = `/api/v1/assets/${asset.assetTag}`;

		const added = await send('POST', `${base}/notes`, key, { text: 'Keyboard replaced.' });
		const empty = await send('POST', `${base}/notes`, key, { text: '   ' });
		const timeline = await send('GET', `${base}/timeline`, key);

		expect(added.response.status).toBe(201);
		expect(timeline.body.data[0]).toMatchObject({
			verb: 'note.added',
			payload: { text: 'Keyboard replaced.' }
		});
		expect(empty.response.status).toBe(400);
		expect(empty.body.error.issues[0].path).toEqual(['text']);
	});

	it('answers 404 to each write when the key lacks its permission', async () => {
		const { organisation, technician, catalogue } = await workspace();
		const asset = await createAsset(organisation.id, catalogue.modelId);
		const ada = await createPerson(organisation.id, 'Ada Lovelace');
		const readOnly = await keyFor(technician, ['assets.view']);
		const checkoutOnly = await keyFor(technician, ['assets.checkout']);
		const base = `/api/v1/assets/${asset.assetTag}`;

		const attempts = [
			await send('POST', `${base}/state`, readOnly, { state: 'retired' }),
			await send('POST', `${base}/location`, readOnly, { locationId: null }),
			await send('POST', `${base}/notes`, readOnly, { text: 'x' }),
			await send('POST', `${base}/custody`, readOnly, { personId: ada.id }),
			await send('DELETE', `${base}/custody`, readOnly),
			// `assets.checkout` opens custody and nothing else.
			await send('POST', `${base}/state`, checkoutOnly, { state: 'retired' })
		];

		expect(attempts.map((a) => a.response.status)).toEqual([404, 404, 404, 404, 404, 404]);
	});

	it('answers 404 on a write to an asset of another organisation', async () => {
		const { technician } = await workspace();
		const other = await createOrganisation('Other', 'other');
		const catalogue = await createCatalogue(other.id);
		const foreign = await createAsset(other.id, catalogue.modelId);
		const key = await keyFor(technician, ['assets.manage']);

		const { response } = await send('POST', `/api/v1/assets/${foreign.assetTag}/state`, key, {
			state: 'retired'
		});

		expect(response.status).toBe(404);
	});
});
