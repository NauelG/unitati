import { beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_BRAND } from '#lib/domain/brand.js';
import type { SessionUser } from '../auth/guards';
import { getDb } from '../db';
import { getBrand, resetBrandCache, updateBranding } from '.';
import { organisationBranding, organisations } from './schema';

async function createOrganisation(name: string, slug: string) {
	const [organisation] = await getDb().insert(organisations).values({ name, slug }).returning();
	return organisation;
}

function userOf(organisationId: string, role: SessionUser['role']): SessionUser {
	return {
		id: `${role}-id`,
		name: role,
		email: `${role}@acme.test`,
		role,
		organisationId,
		personId: null
	};
}

beforeEach(() => resetBrandCache());

describe('getBrand', () => {
	it('is the default brand before setup, when no organisation exists', async () => {
		expect(await getBrand(null)).toEqual(DEFAULT_BRAND);
	});

	it('is the default brand for an organisation without a branding row', async () => {
		const acme = await createOrganisation('Acme', 'acme');

		expect(await getBrand(acme.id)).toEqual(DEFAULT_BRAND);
		expect(await getBrand(null)).toEqual(DEFAULT_BRAND);
	});

	it('is not served a stale "no organisation" once setup has created one', async () => {
		expect(await getBrand(null)).toEqual(DEFAULT_BRAND);

		const acme = await createOrganisation('Acme', 'acme');
		await updateBranding(userOf(acme.id, 'admin'), { productName: 'Acme Desk' });

		expect(await getBrand(null)).toEqual({ productName: 'Acme Desk', customised: true });
	});

	it('never leaks one organisation’s branding into another', async () => {
		const acme = await createOrganisation('Acme', 'acme');
		const globex = await createOrganisation('Globex', 'globex');

		await updateBranding(userOf(acme.id, 'admin'), { productName: 'Acme Desk' });

		expect(await getBrand(acme.id)).toEqual({ productName: 'Acme Desk', customised: true });
		expect(await getBrand(globex.id)).toEqual(DEFAULT_BRAND);
	});
});

describe('updateBranding', () => {
	it('stores the trimmed name and returns the customised view, visible to later reads', async () => {
		const acme = await createOrganisation('Acme', 'acme');

		const outcome = await updateBranding(userOf(acme.id, 'admin'), {
			productName: '  Acme Desk  '
		});

		expect(outcome).toEqual({ ok: true, value: { productName: 'Acme Desk', customised: true } });
		const [row] = await getDb().select().from(organisationBranding);
		expect(row.productName).toBe('Acme Desk');
		expect(await getBrand(acme.id)).toEqual({ productName: 'Acme Desk', customised: true });
		expect(await getBrand(null)).toEqual({ productName: 'Acme Desk', customised: true });
	});

	it('is not customised again once the name goes back to the default', async () => {
		const acme = await createOrganisation('Acme', 'acme');
		const admin = userOf(acme.id, 'admin');

		await updateBranding(admin, { productName: 'Acme Desk' });
		const outcome = await updateBranding(admin, { productName: 'Unitati' });

		expect(outcome).toEqual({ ok: true, value: { productName: 'Unitati', customised: false } });
		expect(await getDb().select().from(organisationBranding)).toHaveLength(1);
	});

	it('refuses a technician and writes nothing', async () => {
		const acme = await createOrganisation('Acme', 'acme');

		const outcome = await updateBranding(userOf(acme.id, 'technician'), {
			productName: 'Acme Desk'
		});

		expect(outcome).toEqual({ ok: false, error: 'forbidden' });
		expect(await getDb().select().from(organisationBranding)).toHaveLength(0);
	});

	it.each([
		['empty', ''],
		['blank', '   '],
		['41 graphemes', 'a'.repeat(41)],
		['a control character', 'Acme\u0007Desk']
	])('rejects a name that is %s', async (_label, productName) => {
		const acme = await createOrganisation('Acme', 'acme');

		const outcome = await updateBranding(userOf(acme.id, 'admin'), { productName });

		expect(outcome).toEqual({ ok: false, error: 'invalid-product-name' });
		expect(await getDb().select().from(organisationBranding)).toHaveLength(0);
	});

	it('counts graphemes, not UTF-16 units: 40 emoji are accepted', async () => {
		const acme = await createOrganisation('Acme', 'acme');
		const name = '👩‍💻'.repeat(40);

		const outcome = await updateBranding(userOf(acme.id, 'admin'), { productName: name });

		expect(outcome.ok).toBe(true);
		expect(await getBrand(acme.id)).toEqual({ productName: name, customised: true });
	});
});
