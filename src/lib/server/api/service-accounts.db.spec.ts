import { eq, sql } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { listActivity } from '../activity';
import { activity } from '../activity/schema';
import {
	createAsset,
	createCatalogue,
	createOrganisation,
	createPerson,
	createViewer
} from '../assets/testing/fixtures';
import { assetTimeline, listAssets, registerAsset } from '../assets';
import { users } from '../auth/schema';
import { constraintViolation } from '../db/errors';
import { getDb } from '../db';
import { listTickets } from '../service-desk';
import { createQueue, createTicket } from '../service-desk/testing/fixtures';
import { authenticateRequest } from './authenticate-request';
import { handleApiRequest } from './dispatch';
import { authenticateApiKey, createApiKey, listApiKeys, revokeApiKey } from './keys';
import { apiKeys, serviceAccounts } from './schema';
import {
	createServiceAccount,
	createServiceAccountKey,
	listServiceAccounts,
	setServiceAccountDisabled
} from './service-accounts';

/**
 * Service accounts (#135): the lifecycle through the public functions, the
 * principal a key resolves to, attribution in the activity log, and the three
 * invariants the database itself enforces.
 */

async function workspace() {
	const organisation = await createOrganisation();
	return {
		organisation,
		admin: await createViewer(organisation.id, 'admin', 'Ada Admin'),
		technician: await createViewer(organisation.id, 'technician', 'Tom Technician')
	};
}

async function account(
	admin: Awaited<ReturnType<typeof workspace>>['admin'],
	name = 'MDM',
	role = 'technician'
) {
	const outcome = await createServiceAccount(admin, { name, role });
	if (!outcome.ok) throw new Error(`could not create the account: ${outcome.error}`);
	return outcome.value;
}

async function keyOf(
	admin: Awaited<ReturnType<typeof workspace>>['admin'],
	serviceAccountId: string,
	scopes: string[],
	name = 'integration'
) {
	const outcome = await createServiceAccountKey(admin, serviceAccountId, {
		name,
		scopes,
		expiresInDays: null
	});
	if (!outcome.ok) throw new Error(`could not create the key: ${outcome.error}`);
	return outcome.value.key;
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

async function principalOf(key: string) {
	const outcome = await authenticateApiKey(key);
	if (!outcome.ok) throw new Error(`the key did not authenticate: ${outcome.error}`);
	return outcome.value;
}

describe('createServiceAccount', () => {
	it('creates a technician account, recording who set it up', async () => {
		const { admin } = await workspace();
		const created = await account(admin);

		expect(created).toMatchObject({ name: 'MDM', role: 'technician', createdByName: 'Ada Admin' });
		expect((await listServiceAccounts(admin)).map((a) => a.name)).toEqual(['MDM']);
	});

	it('refuses the admin role, an unknown role, and a blank or long name', async () => {
		const { admin } = await workspace();

		expect(await createServiceAccount(admin, { name: 'X', role: 'admin' })).toEqual({
			ok: false,
			error: 'role_not_allowed'
		});
		expect(await createServiceAccount(admin, { name: 'X', role: 'root' })).toEqual({
			ok: false,
			error: 'role_not_allowed'
		});
		expect(await createServiceAccount(admin, { name: '  ', role: 'employee' })).toEqual({
			ok: false,
			error: 'invalid_name'
		});
		expect(await createServiceAccount(admin, { name: 'x'.repeat(81), role: 'employee' })).toEqual({
			ok: false,
			error: 'invalid_name'
		});
	});

	it('refuses a name that differs only in case, within an organisation', async () => {
		const { admin } = await workspace();
		await account(admin, 'MDM');

		expect(await createServiceAccount(admin, { name: 'mdm', role: 'employee' })).toEqual({
			ok: false,
			error: 'duplicate_name'
		});
	});

	it('throws for someone who cannot manage every key: the route should have gated it', async () => {
		const { technician } = await workspace();

		await expect(
			createServiceAccount(technician, { name: 'MDM', role: 'technician' })
		).rejects.toThrow();
		await expect(listServiceAccounts(technician)).rejects.toThrow();
	});
});

describe('service-account keys', () => {
	it('authenticates as the account: its id and role, no person, no email', async () => {
		const { admin, organisation } = await workspace();
		const mdm = await account(admin);
		const principal = await principalOf(await keyOf(admin, mdm.id, ['assets.manage']));

		expect(principal).toMatchObject({
			id: mdm.id,
			serviceAccountId: mdm.id,
			name: 'MDM',
			email: '',
			role: 'technician',
			organisationId: organisation.id,
			personId: null,
			scopes: ['assets.manage']
		});
	});

	it('offers the account’s scopes, not the admin’s', async () => {
		const { admin } = await workspace();
		const reader = await account(admin, 'Reader', 'employee');

		// An employee holds neither of these, whatever the admin holds.
		for (const scope of ['assets.manage', 'tickets.manage']) {
			expect(
				await createServiceAccountKey(admin, reader.id, {
					name: 'k',
					scopes: [scope],
					expiresInDays: 90
				})
			).toEqual({ ok: false, error: 'scope_not_allowed' });
		}
	});

	it('keeps working after the admin who set it up is deleted', async () => {
		const { admin } = await workspace();
		const mdm = await account(admin);
		const key = await keyOf(admin, mdm.id, ['tickets.view']);

		await getDb().delete(users).where(eq(users.id, admin.id));

		expect((await principalOf(key)).serviceAccountId).toBe(mdm.id);
		const [row] = await getDb()
			.select()
			.from(serviceAccounts)
			.where(eq(serviceAccounts.id, mdm.id));
		expect(row.createdByUserId).toBeNull();
	});

	it('answers 401 while the account is disabled, and again 200 once it is enabled', async () => {
		const { admin } = await workspace();
		const mdm = await account(admin);
		const key = await keyOf(admin, mdm.id, ['tickets.view']);

		expect((await send('GET', '/api/v1/queues', key)).response.status).toBe(200);

		await setServiceAccountDisabled(admin, mdm.id, true);
		expect(await authenticateApiKey(key)).toEqual({ ok: false, error: 'disabled' });
		expect((await send('GET', '/api/v1/queues', key)).response.status).toBe(401);

		await setServiceAccountDisabled(admin, mdm.id, false);
		expect((await send('GET', '/api/v1/queues', key)).response.status).toBe(200);
	});

	it('refuses to issue a key for a disabled or unknown account', async () => {
		const { admin } = await workspace();
		const mdm = await account(admin);
		await setServiceAccountDisabled(admin, mdm.id, true);

		const input = { name: 'k', scopes: ['tickets.view'], expiresInDays: 90 };
		expect(await createServiceAccountKey(admin, mdm.id, input)).toEqual({
			ok: false,
			error: 'account_disabled'
		});
		expect(await createServiceAccountKey(admin, crypto.randomUUID(), input)).toEqual({
			ok: false,
			error: 'not_found'
		});
	});

	it('does not leak across organisations', async () => {
		const { admin } = await workspace();
		const other = await createOrganisation('Other', 'other');
		const otherAdmin = await createViewer(other.id, 'admin', 'Olga Other');
		const mdm = await account(admin);

		expect(await setServiceAccountDisabled(otherAdmin, mdm.id, true)).toEqual({
			ok: false,
			error: 'not_found'
		});
		expect(
			await createServiceAccountKey(otherAdmin, mdm.id, {
				name: 'k',
				scopes: ['tickets.view'],
				expiresInDays: 90
			})
		).toEqual({ ok: false, error: 'not_found' });
		expect(await listServiceAccounts(otherAdmin)).toEqual([]);
	});

	it('are listed, counted and revocable by the admin, never by a technician', async () => {
		const { admin, technician } = await workspace();
		const mdm = await account(admin);
		await keyOf(admin, mdm.id, ['tickets.view'], 'one');
		await keyOf(admin, mdm.id, ['tickets.view'], 'two');
		await createApiKey(technician, { name: 'mine', scopes: ['tickets.view'], expiresInDays: 30 });

		const listed = await listApiKeys(admin);
		expect(listed.filter((k) => k.serviceAccountId === mdm.id).map((k) => k.ownerName)).toEqual([
			'MDM',
			'MDM'
		]);
		expect((await listServiceAccounts(admin))[0].activeKeys).toBe(2);
		// A personal list never shows the account's keys.
		expect((await listApiKeys(technician)).every((k) => k.serviceAccountId === null)).toBe(true);

		const target = listed.find((k) => k.serviceAccountId === mdm.id)!;
		expect(await revokeApiKey(technician, target.id)).toEqual({ ok: false, error: 'not_found' });
		expect((await revokeApiKey(admin, target.id)).ok).toBe(true);
		expect((await listServiceAccounts(admin))[0].activeKeys).toBe(1);
	});

	it('refuses a duplicate active name on the same account, but not across accounts', async () => {
		const { admin } = await workspace();
		const first = await account(admin, 'First');
		const second = await account(admin, 'Second');
		await keyOf(admin, first.id, ['tickets.view'], 'ci');

		expect(
			await createServiceAccountKey(admin, first.id, {
				name: 'CI',
				scopes: ['tickets.view'],
				expiresInDays: 90
			})
		).toEqual({ ok: false, error: 'duplicate_name' });
		expect(await keyOf(admin, second.id, ['tickets.view'], 'ci')).toMatch(/^unt_/);
	});
});

describe('attribution', () => {
	it('names the service account, not a person, as the actor of what its key does', async () => {
		const { admin, organisation } = await workspace();
		const mdm = await account(admin);
		const catalogue = await createCatalogue(organisation.id);
		const principal = await principalOf(await keyOf(admin, mdm.id, ['assets.manage']));

		const registered = await registerAsset(principal, {
			name: 'Managed laptop',
			assetModelId: catalogue.modelId
		});
		if (!registered.ok) throw new Error(registered.error);

		const timeline = await assetTimeline(
			{ ...principal, scopes: undefined },
			registered.value.assetTag
		);
		if (!timeline.ok) throw new Error(timeline.error);
		expect(timeline.value[0]).toMatchObject({
			verb: 'asset.created',
			actorPersonId: null,
			actorServiceAccountId: mdm.id,
			actorName: 'MDM'
		});

		const [row] = await listActivity({
			organisationId: organisation.id,
			target: { assetId: registered.value.id }
		});
		expect(row.actorName).toBe('MDM');
	});

	it('attributes a ticket opened over the API to the account', async () => {
		const { admin, organisation } = await workspace();
		const mdm = await account(admin);
		const queue = await createQueue(organisation.id, 'General');
		const requester = await createPerson(organisation.id, 'Rita Requester');
		const key = await keyOf(admin, mdm.id, ['tickets.create', 'tickets.manage']);

		const { response, body } = await send('POST', '/api/v1/tickets', key, {
			subject: 'Device out of compliance',
			body: 'Reported by the MDM.',
			queueId: queue.id,
			requesterPersonId: requester.id
		});
		expect(response.status).toBe(201);

		const [ticket] = await getDb().query.tickets.findMany({
			where: (t, { eq: is }) => is(t.ticketTag, body.data.tag)
		});
		const history = await listActivity({
			organisationId: organisation.id,
			target: { ticketId: ticket.id }
		});
		expect(history.map((entry) => [entry.actorServiceAccountId, entry.actorName])).toEqual([
			[mdm.id, 'MDM']
		]);
	});
});

describe('a principal with no person', () => {
	it('is refused a ticket without a requester, as a 400 on requesterPersonId', async () => {
		const { admin, organisation } = await workspace();
		const mdm = await account(admin);
		const queue = await createQueue(organisation.id, 'General');
		const key = await keyOf(admin, mdm.id, ['tickets.create', 'tickets.manage']);

		const { response, body } = await send('POST', '/api/v1/tickets', key, {
			subject: 'Nobody to ask',
			body: 'No requester.',
			queueId: queue.id
		});

		expect(response.status).toBe(400);
		expect(body.error.issues).toEqual([expect.objectContaining({ path: ['requesterPersonId'] })]);
	});

	it('as an employee, sees no tickets and only the shared assets', async () => {
		const { admin, organisation } = await workspace();
		const reader = await account(admin, 'Reader', 'employee');
		const principal = await principalOf(
			await keyOf(admin, reader.id, ['tickets.view.own', 'assets.view.own', 'assets.view.shared'])
		);

		const catalogue = await createCatalogue(organisation.id);
		const requester = await createPerson(organisation.id, 'Rita Requester');
		const queue = await createQueue(organisation.id, 'General');
		await createTicket(organisation.id, queue.id, requester.id);
		const shared = await createAsset(organisation.id, catalogue.modelId, { shared: true });
		await createAsset(organisation.id, catalogue.modelId, { custodianPersonId: requester.id });
		await createAsset(organisation.id, catalogue.modelId);

		expect((await listTickets(principal)).rows).toEqual([]);
		expect((await listAssets(principal)).rows.map((a) => a.assetTag)).toEqual([shared.assetTag]);
	});

	it('cannot manage API keys: a service account has no keys of its own', async () => {
		const { admin } = await workspace();
		const mdm = await account(admin);
		const principal = await principalOf(await keyOf(admin, mdm.id, ['tickets.view']));

		await expect(
			createApiKey(principal, { name: 'k', scopes: ['tickets.view'], expiresInDays: 30 })
		).rejects.toThrow();
	});
});

const NOT_ONE_PRINCIPAL = { code: '23514', constraint: 'api_keys_exactly_one_principal' };

/** The constraint a failed statement trips, read off Drizzle's wrapped error. */
async function violation(statement: PromiseLike<unknown>) {
	return constraintViolation(await Promise.resolve(statement).catch((error: unknown) => error));
}

describe('the database refuses', () => {
	it('a service account with the admin role', async () => {
		const { organisation } = await workspace();

		await expect(
			violation(
				getDb()
					.insert(serviceAccounts)
					.values({ organisationId: organisation.id, name: 'Root', role: 'admin' })
			)
		).resolves.toEqual({ code: '23514', constraint: 'service_accounts_not_admin' });
	});

	it('a key with both owners or with neither', async () => {
		const { admin, organisation } = await workspace();
		const mdm = await account(admin);
		const base = {
			organisationId: organisation.id,
			name: 'k',
			start: 'abcdefgh',
			scopes: ['tickets.view']
		};

		await expect(
			violation(
				getDb()
					.insert(apiKeys)
					.values({
						...base,
						keyHash: 'a'.repeat(64),
						ownerUserId: admin.id,
						serviceAccountId: mdm.id
					})
			)
		).resolves.toEqual(NOT_ONE_PRINCIPAL);
		await expect(
			violation(
				getDb()
					.insert(apiKeys)
					.values({ ...base, keyHash: 'b'.repeat(64) })
			)
		).resolves.toEqual(NOT_ONE_PRINCIPAL);
	});

	it('an activity row with both actors', async () => {
		const { admin, organisation } = await workspace();
		const mdm = await account(admin);
		const catalogue = await createCatalogue(organisation.id);
		const asset = await createAsset(organisation.id, catalogue.modelId);

		await expect(
			violation(
				getDb()
					.insert(activity)
					.values({
						organisationId: organisation.id,
						actorPersonId: admin.personId,
						actorServiceAccountId: mdm.id,
						verb: 'note.added',
						payload: { text: 'both' },
						assetId: asset.id
					})
			)
		).resolves.toEqual({ code: '23514', constraint: 'activity_at_most_one_actor' });
	});

	it('deleting a service account that has acted', async () => {
		const { admin, organisation } = await workspace();
		const mdm = await account(admin);
		const catalogue = await createCatalogue(organisation.id);
		const asset = await createAsset(organisation.id, catalogue.modelId);
		await getDb()
			.insert(activity)
			.values({
				organisationId: organisation.id,
				actorServiceAccountId: mdm.id,
				verb: 'note.added',
				payload: { text: 'hello' },
				assetId: asset.id
			});

		await expect(
			getDb().execute(sql`delete from service_accounts where id = ${mdm.id}`)
		).rejects.toThrow();
	});
});
