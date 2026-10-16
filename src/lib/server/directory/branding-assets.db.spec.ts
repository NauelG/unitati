import { eq } from 'drizzle-orm';
import sharp from 'sharp';
import { beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_BRAND } from '#lib/domain/brand.js';
import type { SessionUser } from '../auth/guards';
import { getDb } from '../db';
import {
	getBrand,
	getBrandAsset,
	removeBrandAsset,
	resetBranding,
	resetBrandCache,
	setBrandAsset,
	updateBranding
} from '.';
import { organisationBrandAssets, organisationBranding, organisations } from './schema';

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

const png = () =>
	sharp({ create: { width: 200, height: 60, channels: 3, background: '#1d5cf0' } })
		.png()
		.toBuffer();

const svg = new TextEncoder().encode(
	'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><circle cx="5" cy="5" r="5" fill="#c81e1e"/></svg>'
);

async function slotsOf(organisationId: string) {
	const rows = await getDb()
		.select({ slot: organisationBrandAssets.slot })
		.from(organisationBrandAssets)
		.where(eq(organisationBrandAssets.organisationId, organisationId));
	return rows.map((row) => row.slot).sort();
}

beforeEach(() => resetBrandCache());

describe('setBrandAsset', () => {
	it('creates the branding row when missing, stores the asset and customises the brand', async () => {
		const acme = await createOrganisation('Acme', 'acme');

		const outcome = await setBrandAsset(userOf(acme.id, 'admin'), 'lockup', await png());

		expect(outcome.ok).toBe(true);
		const [branding] = await getDb().select().from(organisationBranding);
		expect(branding.productName).toBe('Unitati');
		expect(await slotsOf(acme.id)).toEqual(['lockup']);
		const view = await getBrand(acme.id);
		expect(view.customised).toBe(true);
		expect(view.assets.lockup).toMatchObject({ contentType: 'image/webp' });
		expect(view.assets.lockup?.sha256).toMatch(/^[0-9a-f]{64}$/);
	});

	it('stores the mark together with the favicon and the apple-touch icon derived from it', async () => {
		const acme = await createOrganisation('Acme', 'acme');

		await setBrandAsset(userOf(acme.id, 'admin'), 'mark', svg);

		expect(await slotsOf(acme.id)).toEqual(['apple_touch', 'favicon', 'mark']);
		const favicon = await getBrandAsset(acme.id, 'favicon');
		expect(favicon?.contentType).toBe('image/png');
		expect((await sharp(favicon!.data).metadata()).width).toBe(64);
	});

	it('replaces the image in a slot instead of adding a second one', async () => {
		const acme = await createOrganisation('Acme', 'acme');
		const admin = userOf(acme.id, 'admin');

		await setBrandAsset(admin, 'lockup', await png());
		const before = (await getBrand(acme.id)).assets.lockup?.sha256;
		await setBrandAsset(admin, 'lockup', svg);

		expect(await slotsOf(acme.id)).toEqual(['lockup']);
		expect((await getBrand(acme.id)).assets.lockup?.sha256).not.toBe(before);
	});

	it('hands the bytes back through getBrandAsset, for the installation too', async () => {
		const acme = await createOrganisation('Acme', 'acme');
		await setBrandAsset(userOf(acme.id, 'admin'), 'lockup_dark', svg);

		const byId = await getBrandAsset(acme.id, 'lockup_dark');
		const anonymous = await getBrandAsset(null, 'lockup_dark');

		expect(byId?.contentType).toBe('image/svg+xml');
		expect(byId?.data).toBeInstanceOf(Uint8Array);
		expect(anonymous?.sha256).toBe(byId?.sha256);
		expect(await getBrandAsset(acme.id, 'lockup')).toBeNull();
	});

	it('refuses a technician and writes nothing', async () => {
		const acme = await createOrganisation('Acme', 'acme');

		const outcome = await setBrandAsset(userOf(acme.id, 'technician'), 'lockup', await png());

		expect(outcome).toEqual({ ok: false, error: 'forbidden' });
		expect(await getDb().select().from(organisationBranding)).toHaveLength(0);
		expect(await getDb().select().from(organisationBrandAssets)).toHaveLength(0);
	});

	it('returns the image failure and writes nothing for a file it cannot use', async () => {
		const acme = await createOrganisation('Acme', 'acme');

		const outcome = await setBrandAsset(
			userOf(acme.id, 'admin'),
			'mark',
			new TextEncoder().encode('GIF89a nope')
		);

		expect(outcome).toEqual({ ok: false, error: 'unsupported-type' });
		expect(await getDb().select().from(organisationBranding)).toHaveLength(0);
	});

	it('keeps the uploads when the product name is saved afterwards', async () => {
		const acme = await createOrganisation('Acme', 'acme');
		const admin = userOf(acme.id, 'admin');
		await setBrandAsset(admin, 'lockup', await png());

		const outcome = await updateBranding(admin, { productName: 'Acme Desk' });

		expect(outcome.ok && Object.keys(outcome.value.assets)).toEqual(['lockup']);
	});

	it('never reads one organisation’s image as another’s', async () => {
		const acme = await createOrganisation('Acme', 'acme');
		const globex = await createOrganisation('Globex', 'globex');
		await setBrandAsset(userOf(acme.id, 'admin'), 'lockup', await png());

		expect(await getBrandAsset(globex.id, 'lockup')).toBeNull();
		expect((await getBrand(globex.id)).assets).toEqual({});
	});
});

describe('removeBrandAsset', () => {
	it('removes the mark with the icons derived from it', async () => {
		const acme = await createOrganisation('Acme', 'acme');
		const admin = userOf(acme.id, 'admin');
		await setBrandAsset(admin, 'mark', svg);
		await setBrandAsset(admin, 'lockup', await png());

		const outcome = await removeBrandAsset(admin, 'mark');

		expect(outcome.ok).toBe(true);
		expect(await slotsOf(acme.id)).toEqual(['lockup']);
		expect((await getBrand(acme.id)).assets.mark).toBeUndefined();
	});

	it('is idempotent', async () => {
		const acme = await createOrganisation('Acme', 'acme');
		const admin = userOf(acme.id, 'admin');
		await setBrandAsset(admin, 'lockup', await png());

		expect((await removeBrandAsset(admin, 'lockup')).ok).toBe(true);
		expect((await removeBrandAsset(admin, 'lockup')).ok).toBe(true);
		expect((await getBrand(acme.id)).customised).toBe(false);
	});

	it('refuses a technician', async () => {
		const acme = await createOrganisation('Acme', 'acme');
		await setBrandAsset(userOf(acme.id, 'admin'), 'lockup', await png());

		const outcome = await removeBrandAsset(userOf(acme.id, 'technician'), 'lockup');

		expect(outcome).toEqual({ ok: false, error: 'forbidden' });
		expect(await slotsOf(acme.id)).toEqual(['lockup']);
	});
});

describe('the table', () => {
	it('cascades every asset when the branding row goes', async () => {
		const acme = await createOrganisation('Acme', 'acme');
		await setBrandAsset(userOf(acme.id, 'admin'), 'mark', svg);

		await getDb().delete(organisationBranding);

		expect(await getDb().select().from(organisationBrandAssets)).toHaveLength(0);
	});

	it('rejects a 300 KiB image at the database, whatever the application did', async () => {
		const acme = await createOrganisation('Acme', 'acme');
		await getDb()
			.insert(organisationBranding)
			.values({ organisationId: acme.id, productName: 'Acme' });

		await expect(
			getDb()
				.insert(organisationBrandAssets)
				.values({
					organisationId: acme.id,
					slot: 'lockup',
					contentType: 'image/webp',
					data: new Uint8Array(300 * 1024),
					sha256: 'a'.repeat(64)
				})
		).rejects.toThrow();
	});
});

describe('resetBranding', () => {
	it('wipes the name, the colour and every upload, leaving the default brand', async () => {
		const acme = await createOrganisation('Acme', 'acme');
		const admin = userOf(acme.id, 'admin');
		await updateBranding(admin, { productName: 'Acme Desk', brandColor: '#c81e1e' });
		await setBrandAsset(admin, 'lockup', await png());
		await setBrandAsset(admin, 'mark', await png());

		const outcome = await resetBranding(admin);

		expect(outcome).toEqual({ ok: true, value: DEFAULT_BRAND });
		expect(await getDb().select().from(organisationBranding)).toEqual([]);
		expect(await slotsOf(acme.id)).toEqual([]);
		resetBrandCache();
		expect(await getBrand(acme.id)).toEqual(DEFAULT_BRAND);
	});

	it('is idempotent: a second call, with no row left, is still OK', async () => {
		const acme = await createOrganisation('Acme', 'acme');
		const admin = userOf(acme.id, 'admin');
		await updateBranding(admin, { productName: 'Acme Desk' });

		expect((await resetBranding(admin)).ok).toBe(true);
		expect((await resetBranding(admin)).ok).toBe(true);
	});

	it('refuses a technician and deletes nothing', async () => {
		const acme = await createOrganisation('Acme', 'acme');
		await updateBranding(userOf(acme.id, 'admin'), { productName: 'Acme Desk' });
		await setBrandAsset(userOf(acme.id, 'admin'), 'lockup', await png());

		const outcome = await resetBranding(userOf(acme.id, 'technician'));

		expect(outcome).toEqual({ ok: false, error: 'forbidden' });
		expect(await getDb().select().from(organisationBranding)).toHaveLength(1);
		expect(await slotsOf(acme.id)).toEqual(['lockup']);
	});

	it("does not touch another organisation's brand", async () => {
		const acme = await createOrganisation('Acme', 'acme');
		const globex = await createOrganisation('Globex', 'globex');
		await updateBranding(userOf(globex.id, 'admin'), { productName: 'Globex Desk' });

		await resetBranding(userOf(acme.id, 'admin'));

		expect((await getBrand(globex.id)).productName).toBe('Globex Desk');
	});
});
