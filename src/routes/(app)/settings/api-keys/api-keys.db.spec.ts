import { describe, expect, it } from 'vitest';
import { createOrganisation, createViewer } from '#lib/server/assets/testing/fixtures.js';
import { authenticateApiKey, createApiKey, listApiKeys } from '#lib/server/api/index.js';
import type { SessionUser } from '#lib/server/auth/guards.js';
import { load as loadSettings } from '../+layout.server';
import { actions, load } from './+page.server';

/**
 * The API-keys screen's server seam, called with the slice of the event it
 * reads (as `settings.db.spec.ts` does): who gets in, what the page is sent,
 * and what each action answers. The key rules themselves are proved in
 * `api/keys.db.spec.ts`; here we prove the screen exposes them.
 */

const event = (user: SessionUser | null, fields: Record<string, string | string[]> = {}) => {
	const body = new URLSearchParams();
	for (const [name, value] of Object.entries(fields)) {
		for (const each of [value].flat()) body.append(name, each);
	}
	return {
		locals: { user },
		request: new Request('http://localhost/settings/api-keys', { method: 'POST', body })
	} as never;
};

async function workspace() {
	const organisation = await createOrganisation();
	return {
		admin: await createViewer(organisation.id, 'admin', 'Ada Admin'),
		technician: await createViewer(organisation.id, 'technician', 'Tom Technician'),
		employee: await createViewer(organisation.id, 'employee', 'Eva Employee')
	};
}

async function statusOf(run: () => unknown): Promise<number | undefined> {
	try {
		await run();
	} catch (thrown) {
		return (thrown as { status?: number }).status;
	}
	return undefined;
}

type Refusal = { status: number; data: { action: string; message: string; field: string } };
type Created = { action: string; key: string };

describe('/settings/api-keys access', () => {
	it('answers 403 to the employee, for the load and for every action', async () => {
		const { employee } = await workspace();

		expect(await statusOf(() => loadSettings(event(employee)))).toBe(403);
		expect(await statusOf(() => load(event(employee)))).toBe(403);
		for (const name of ['create', 'revoke'] as const) {
			expect(await statusOf(() => actions[name](event(employee)))).toBe(403);
		}
	});

	it('refuses to create a key when posted directly by an employee', async () => {
		const { employee } = await workspace();

		await expect(
			actions.create(
				event(employee, { name: 'sneaky', scopes: 'tickets.create', expiresInDays: '90' })
			)
		).rejects.toMatchObject({ status: 403 });
		expect(await listApiKeys(await createViewer(employee.organisationId, 'admin', 'Zed'))).toEqual(
			[]
		);
	});
});

describe('/settings/api-keys load', () => {
	it('sends a technician only the scopes their role holds, and no "never" option', async () => {
		const { technician } = await workspace();

		const data = (await load(event(technician))) as {
			grantable: string[];
			canManageAll: boolean;
		};

		expect(data.canManageAll).toBe(false);
		expect(data.grantable).toContain('tickets.view');
		expect(data.grantable).not.toContain('people.manage');
		expect(data.grantable.some((permission) => permission.startsWith('api.'))).toBe(false);
	});

	it('sends an admin every key with its owner', async () => {
		const { admin, technician } = await workspace();
		await createApiKey(technician, { name: 'tech', scopes: ['tickets.view'], expiresInDays: 30 });

		const data = (await load(event(admin))) as {
			canManageAll: boolean;
			keys: { name: string; ownerName: string }[];
		};

		expect(data.canManageAll).toBe(true);
		expect(data.keys.map((key) => [key.name, key.ownerName])).toEqual([['tech', 'Tom Technician']]);
	});

	it('never sends a hash or the plaintext', async () => {
		const { technician } = await workspace();
		const issued = await createApiKey(technician, {
			name: 'ci',
			scopes: ['tickets.view'],
			expiresInDays: 30
		});
		if (!issued.ok) throw new Error('setup');

		const data = await load(event(technician));

		expect(JSON.stringify(data)).not.toContain(issued.value.key);
		expect(JSON.stringify(data)).not.toMatch(/key_?hash/i);
	});
});

describe('/settings/api-keys create', () => {
	it('creates a key and returns the plaintext once, usable straight away', async () => {
		const { technician } = await workspace();

		const result = (await actions.create(
			event(technician, { name: 'CI', scopes: ['tickets.view'], expiresInDays: '90' })
		)) as Created;

		expect(result.action).toBe('create');
		expect(result.key).toMatch(/^unt_/);
		expect((await authenticateApiKey(result.key)).ok).toBe(true);
		expect((await listApiKeys(technician)).map((key) => key.name)).toEqual(['CI']);
	});

	it.each([
		['a blank name', { name: ' ', scopes: ['tickets.view'], expiresInDays: '90' }, 'name'],
		['no scope', { name: 'CI', expiresInDays: '90' }, 'scopes'],
		[
			'a scope outside the role',
			{ name: 'CI', scopes: ['people.manage'], expiresInDays: '90' },
			'scopes'
		],
		[
			'"never" for a technician',
			{ name: 'CI', scopes: ['tickets.view'], expiresInDays: 'never' },
			'expiresInDays'
		],
		[
			'an unknown expiry',
			{ name: 'CI', scopes: ['tickets.view'], expiresInDays: '7' },
			'expiresInDays'
		]
	])('refuses %s with a field error', async (_label, fields, field) => {
		const { technician } = await workspace();

		const failed = (await actions.create(event(technician, fields))) as unknown as Refusal;

		expect(failed.status).toBe(400);
		expect(failed.data.field).toBe(field);
		expect(await listApiKeys(technician)).toEqual([]);
	});

	it('lets an admin create a key that never expires', async () => {
		const { admin } = await workspace();

		const result = (await actions.create(
			event(admin, { name: 'forever', scopes: ['tickets.view'], expiresInDays: 'never' })
		)) as Created;

		expect(result.key).toMatch(/^unt_/);
	});
});

describe('/settings/api-keys revoke', () => {
	it("lets an admin revoke a technician's key, but not the other way round", async () => {
		const { admin, technician } = await workspace();
		const theirs = await createApiKey(technician, {
			name: 'tech',
			scopes: ['tickets.view'],
			expiresInDays: 30
		});
		const adminKey = await createApiKey(admin, {
			name: 'admin',
			scopes: ['tickets.view'],
			expiresInDays: 30
		});
		if (!theirs.ok || !adminKey.ok) throw new Error('setup');

		const refused = (await actions.revoke(
			event(technician, { id: adminKey.value.record.id })
		)) as unknown as Refusal;
		expect(refused.status).toBe(400);

		await actions.revoke(event(admin, { id: theirs.value.record.id }));
		expect(await listApiKeys(technician)).toEqual([]);
		expect((await authenticateApiKey(theirs.value.key)).ok).toBe(false);
	});
});

describe('/settings/api-keys service accounts', () => {
	it('sends them to an admin only, with the scopes of each account’s own role', async () => {
		const { admin, technician } = await workspace();
		await actions.createAccount(event(admin, { name: 'Reader', role: 'employee' }));

		const adminData = (await load(event(admin))) as {
			serviceAccounts: { name: string; grantable: string[] }[];
			serviceAccountRoles: string[];
		};
		expect(adminData.serviceAccountRoles).toEqual(['technician', 'employee']);
		expect(adminData.serviceAccounts.map((account) => account.name)).toEqual(['Reader']);
		// An employee-role account is offered what an employee holds, not what the admin does.
		expect(adminData.serviceAccounts[0].grantable).toContain('tickets.view.own');
		expect(adminData.serviceAccounts[0].grantable).not.toContain('assets.manage');

		const technicianData = (await load(event(technician))) as { serviceAccounts: unknown[] };
		expect(technicianData.serviceAccounts).toEqual([]);
	});

	it('refuses a technician posting any of the three actions directly', async () => {
		const { admin, technician } = await workspace();
		await actions.createAccount(event(admin, { name: 'MDM', role: 'technician' }));
		const [{ id }] = ((await load(event(admin))) as { serviceAccounts: { id: string }[] })
			.serviceAccounts;

		await expect(
			actions.createAccount(event(technician, { name: 'Mine', role: 'technician' }))
		).rejects.toMatchObject({ status: 403 });
		await expect(
			actions.setAccountDisabled(event(technician, { id, disabled: 'true' }))
		).rejects.toMatchObject({ status: 403 });
		await expect(
			actions.createAccountKey(
				event(technician, {
					serviceAccountId: id,
					name: 'k',
					scopes: 'tickets.view',
					expiresInDays: '90'
				})
			)
		).rejects.toMatchObject({ status: 403 });
	});

	it('creates an account, issues it a key, and disables it', async () => {
		const { admin } = await workspace();
		expect(
			await actions.createAccount(event(admin, { name: 'MDM', role: 'technician' }))
		).toMatchObject({ action: 'createAccount' });
		const [{ id }] = ((await load(event(admin))) as { serviceAccounts: { id: string }[] })
			.serviceAccounts;

		const issued = (await actions.createAccountKey(
			event(admin, {
				serviceAccountId: id,
				name: 'agent',
				scopes: 'assets.manage',
				expiresInDays: 'never'
			})
		)) as Created;
		expect(issued.key).toMatch(/^unt_/);
		expect((await authenticateApiKey(issued.key)).ok).toBe(true);

		await actions.setAccountDisabled(event(admin, { id, disabled: 'true' }));
		expect(await authenticateApiKey(issued.key)).toEqual({ ok: false, error: 'disabled' });
	});

	it('refuses an admin-role account and a duplicate name as field errors', async () => {
		const { admin } = await workspace();
		await actions.createAccount(event(admin, { name: 'MDM', role: 'technician' }));

		const role = (await actions.createAccount(
			event(admin, { name: 'Root', role: 'admin' })
		)) as unknown as Refusal;
		expect([role.status, role.data.field]).toEqual([400, 'role']);

		const duplicate = (await actions.createAccount(
			event(admin, { name: 'mdm', role: 'employee' })
		)) as unknown as Refusal;
		expect([duplicate.status, duplicate.data.field]).toEqual([400, 'name']);
	});
});
