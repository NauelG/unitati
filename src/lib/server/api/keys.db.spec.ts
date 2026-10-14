import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { createOrganisation, createViewer } from '../assets/testing/fixtures';
import { users } from '../auth/schema';
import { getDb } from '../db';
import { apiKeys } from './schema';
import {
	authenticateApiKey,
	createApiKey,
	listApiKeys,
	revokeApiKey,
	type CreateApiKeyInput
} from './keys';

/**
 * The key lifecycle through its public functions: create, list, revoke,
 * authenticate. Rows are only read back directly where the claim is about what
 * is *stored* (no plaintext), because that is not observable any other way.
 */

async function workspace() {
	const organisation = await createOrganisation();
	return {
		organisation,
		admin: await createViewer(organisation.id, 'admin', 'Ada Admin'),
		technician: await createViewer(organisation.id, 'technician', 'Tom Technician'),
		otherTechnician: await createViewer(organisation.id, 'technician', 'Tina Technician'),
		employee: await createViewer(organisation.id, 'employee', 'Eva Employee')
	};
}

const input = (overrides: Partial<CreateApiKeyInput> = {}): CreateApiKeyInput => ({
	name: 'CI',
	scopes: ['tickets.view'],
	expiresInDays: 90,
	...overrides
});

async function created(
	actor: Parameters<typeof createApiKey>[0],
	overrides: Partial<CreateApiKeyInput> = {}
) {
	const outcome = await createApiKey(actor, input(overrides));
	if (!outcome.ok) throw new Error(`could not create the key: ${outcome.error}`);
	return outcome.value;
}

describe('createApiKey', () => {
	it('returns the plaintext once, in the documented format', async () => {
		const { technician } = await workspace();
		const { key, record } = await created(technician);

		expect(key).toMatch(/^unt_[A-Za-z0-9_-]{43}$/);
		expect(record.start).toBe(key.slice(4, 12));
		expect(record.name).toBe('CI');
		expect(record.scopes).toEqual(['tickets.view']);
	});

	it('stores no column that contains the plaintext key', async () => {
		const { technician } = await workspace();
		const { key } = await created(technician);

		const [row] = await getDb().select().from(apiKeys);
		for (const value of Object.values(row)) {
			expect(JSON.stringify(value)).not.toContain(key);
		}
		expect(row.keyHash).toMatch(/^[0-9a-f]{64}$/);
	});

	it('expires after the chosen number of days, or never', async () => {
		const { technician, admin } = await workspace();
		const now = new Date('2026-01-01T00:00:00Z');

		const thirty = await createApiKey(technician, input({ expiresInDays: 30 }), now);
		expect(thirty.ok && thirty.value.record.expiresAt).toEqual(new Date('2026-01-31T00:00:00Z'));

		const never = await createApiKey(admin, input({ expiresInDays: null }), now);
		expect(never.ok && never.value.record.expiresAt).toBeNull();
	});

	it('refuses a scope the creator role does not hold', async () => {
		const { technician } = await workspace();

		const outcome = await createApiKey(
			technician,
			input({ scopes: ['tickets.view', 'people.manage'] })
		);
		expect(outcome).toEqual({ ok: false, error: 'scope_not_allowed' });
	});

	it('refuses an empty scope list', async () => {
		const { technician } = await workspace();

		expect(await createApiKey(technician, input({ scopes: [] }))).toEqual({
			ok: false,
			error: 'no_scopes'
		});
	});

	it('refuses "never" without api.keys.manage.all', async () => {
		const { technician } = await workspace();

		expect(await createApiKey(technician, input({ expiresInDays: null }))).toEqual({
			ok: false,
			error: 'never_not_allowed'
		});
	});

	it('refuses a blank name and an overlong one', async () => {
		const { technician } = await workspace();

		expect(await createApiKey(technician, input({ name: '   ' }))).toEqual({
			ok: false,
			error: 'invalid_name'
		});
		expect(await createApiKey(technician, input({ name: 'x'.repeat(81) }))).toEqual({
			ok: false,
			error: 'invalid_name'
		});
	});

	it('refuses a second active key with the same name, ignoring case, but not after a revoke', async () => {
		const { technician } = await workspace();
		const first = await created(technician, { name: 'Deploy' });

		expect(await createApiKey(technician, input({ name: 'deploy' }))).toEqual({
			ok: false,
			error: 'duplicate_name'
		});

		await revokeApiKey(technician, first.record.id);
		expect((await createApiKey(technician, input({ name: 'deploy' }))).ok).toBe(true);
	});

	it('throws for an employee: the route should never have let them reach it', async () => {
		const { employee } = await workspace();

		await expect(createApiKey(employee, input({ scopes: ['tickets.create'] }))).rejects.toThrow();
	});
});

describe('listApiKeys', () => {
	it("shows a technician only their own active keys, and never another person's", async () => {
		const { technician, otherTechnician, admin } = await workspace();
		await created(technician, { name: 'mine' });
		await created(otherTechnician, { name: 'theirs' });
		await created(admin, { name: 'admins' });

		const names = (await listApiKeys(technician)).map((key) => key.name);
		expect(names).toEqual(['mine']);
	});

	it('shows an admin every active key in the organisation, with its owner', async () => {
		const { technician, admin } = await workspace();
		await created(technician, { name: 'mine' });
		await created(admin, { name: 'admins' });

		const keys = await listApiKeys(admin);
		expect(keys.map((key) => [key.name, key.ownerName]).sort()).toEqual([
			['admins', 'Ada Admin'],
			['mine', 'Tom Technician']
		]);
	});

	it('does not leak keys across organisations', async () => {
		const { admin } = await workspace();
		const other = await createOrganisation('Other', 'other');
		const stranger = await createViewer(other.id, 'admin', 'Sam Stranger');
		await created(stranger, { name: 'foreign' });

		expect(await listApiKeys(admin)).toEqual([]);
	});

	it('leaves out revoked and expired keys', async () => {
		const { technician } = await workspace();
		const revoked = await created(technician, { name: 'revoked' });
		await created(technician, { name: 'live' });
		await revokeApiKey(technician, revoked.record.id);
		await getDb()
			.insert(apiKeys)
			.values({
				organisationId: technician.organisationId,
				ownerUserId: technician.id,
				name: 'old',
				start: 'aaaaaaaa',
				keyHash: 'f'.repeat(64),
				scopes: ['tickets.view'],
				expiresAt: new Date('2000-01-01T00:00:00Z')
			});

		expect((await listApiKeys(technician)).map((key) => key.name)).toEqual(['live']);
	});
});

describe('revokeApiKey', () => {
	it('lets the owner revoke their own key', async () => {
		const { technician } = await workspace();
		const { record } = await created(technician);

		expect(await revokeApiKey(technician, record.id)).toEqual({ ok: true, value: undefined });
		expect(await listApiKeys(technician)).toEqual([]);
	});

	it("lets an admin revoke a technician's key, and not the other way round", async () => {
		const { technician, admin } = await workspace();
		const theirs = await created(technician, { name: 'tech' });
		const adminKey = await created(admin, { name: 'admin' });

		expect(await revokeApiKey(technician, adminKey.record.id)).toEqual({
			ok: false,
			error: 'not_found'
		});
		expect((await revokeApiKey(admin, theirs.record.id)).ok).toBe(true);
	});

	it('answers not_found for an unknown id and for a key already revoked', async () => {
		const { technician } = await workspace();
		const { record } = await created(technician);
		await revokeApiKey(technician, record.id);

		expect(await revokeApiKey(technician, record.id)).toEqual({ ok: false, error: 'not_found' });
		expect(await revokeApiKey(technician, crypto.randomUUID())).toEqual({
			ok: false,
			error: 'not_found'
		});
	});
});

describe('authenticateApiKey', () => {
	it('returns the owner as a principal carrying the key scopes', async () => {
		const { technician } = await workspace();
		const { key } = await created(technician, { scopes: ['tickets.view.own'] });

		const outcome = await authenticateApiKey(key);
		expect(outcome.ok && outcome.value).toMatchObject({
			id: technician.id,
			role: 'technician',
			organisationId: technician.organisationId,
			personId: technician.personId,
			scopes: ['tickets.view.own']
		});
	});

	it.each([['nonsense'], ['unt_short'], [`unt_${'!'.repeat(43)}`], ['']])(
		'rejects %j as malformed',
		async (raw) => {
			expect(await authenticateApiKey(raw)).toEqual({ ok: false, error: 'malformed' });
		}
	);

	it('rejects a well-formed key nobody issued as unknown', async () => {
		expect(await authenticateApiKey(`unt_${'A'.repeat(43)}`)).toEqual({
			ok: false,
			error: 'unknown'
		});
	});

	it('rejects a revoked key', async () => {
		const { technician } = await workspace();
		const { key, record } = await created(technician);
		await revokeApiKey(technician, record.id);

		expect(await authenticateApiKey(key)).toEqual({ ok: false, error: 'revoked' });
	});

	it('rejects an expired key', async () => {
		const { technician } = await workspace();
		const issued = await createApiKey(
			technician,
			input({ expiresInDays: 30 }),
			new Date('2020-01-01T00:00:00Z')
		);
		if (!issued.ok) throw new Error('could not create the key');

		expect(await authenticateApiKey(issued.value.key)).toEqual({ ok: false, error: 'expired' });
	});

	it('follows the owner: demoting them narrows the key with no change to it', async () => {
		const { technician } = await workspace();
		const { key } = await created(technician, { scopes: ['tickets.view'] });

		await getDb().update(users).set({ role: 'employee' }).where(eq(users.id, technician.id));

		const outcome = await authenticateApiKey(key);
		expect(outcome.ok && outcome.value.role).toBe('employee');
	});

	it('stamps last_used_at at most once a minute', async () => {
		const { technician } = await workspace();
		const { key, record } = await created(technician);
		const lastUsed = async () =>
			(await getDb().select().from(apiKeys).where(eq(apiKeys.id, record.id)))[0].lastUsedAt;

		expect(await lastUsed()).toBeNull();

		const start = new Date('2026-01-01T00:00:00Z');
		await authenticateApiKey(key, start);
		expect(await lastUsed()).toEqual(start);

		await authenticateApiKey(key, new Date(start.getTime() + 30_000));
		expect(await lastUsed()).toEqual(start);

		const later = new Date(start.getTime() + 61_000);
		await authenticateApiKey(key, later);
		expect(await lastUsed()).toEqual(later);
	});
});
