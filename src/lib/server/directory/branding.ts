import { and, asc, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';
import { brandCss, deriveBrand, parseHex, type Hex } from '#lib/domain/brand-color.js';
import {
	DEFAULT_BRAND,
	DEFAULT_PRODUCT_NAME,
	PRODUCT_NAME_MAX,
	UPLOAD_SLOTS,
	graphemeCount,
	type BrandAssetSlot,
	type BrandView,
	type UploadSlot
} from '#lib/domain/brand.js';
import { can } from '../access/permissions';
import type { SessionUser } from '../auth/guards';
import { getDb } from '../db';
import { failure, success, type Outcome } from '../shared/outcome';
import { deriveIcons, processUpload, type ImageFailure } from './branding/image';
import { organisationBrandAssets, organisationBranding, organisations } from './schema';

/**
 * Per-organisation branding (ADR 0026). The brand is stored 1:1 with the
 * organisation and read on every request, so reads are cached in this process.
 * That assumes a single Node process; several replicas would need invalidation
 * across processes, or a short TTL (see the ADR's consequences).
 */

const brands = new Map<string, BrandView>();
let installationOrganisationId: string | null = null;

/** Tests only: forget everything a previous test cached. */
export function resetBrandCache(): void {
	brands.clear();
	installationOrganisationId = null;
}

/**
 * The one N=1 assumption in the public resolver (ADR 0004, ADR 0026): login and
 * setup have no session, so the brand they show is the installation's single
 * organisation, the first row. Revisit with #42 when a second organisation can
 * exist.
 *
 * Cached only once it exists, so setup is never served a stale "no organisation".
 */
async function installationOrganisation(): Promise<string | null> {
	if (installationOrganisationId) return installationOrganisationId;

	const [row] = await getDb()
		.select({ id: organisations.id })
		.from(organisations)
		.orderBy(asc(organisations.createdAt), asc(organisations.id))
		.limit(1);

	installationOrganisationId = row?.id ?? null;
	return installationOrganisationId;
}

interface BrandingRow {
	productName: string;
	brandColor: string | null;
}

/** Customised means the brand differs from Unitati's default: a name, a colour or an uploaded image. */
function isCustomised(row: BrandingRow, assets: BrandView['assets']): boolean {
	return (
		row.productName !== DEFAULT_PRODUCT_NAME ||
		row.brandColor !== null ||
		UPLOAD_SLOTS.some((slot) => assets[slot] !== undefined)
	);
}

/** Metadata only: the bytes are read per request by `getBrandAsset`, never cached here. */
async function loadAssets(organisationId: string): Promise<BrandView['assets']> {
	const rows = await getDb()
		.select({
			slot: organisationBrandAssets.slot,
			sha256: organisationBrandAssets.sha256,
			contentType: organisationBrandAssets.contentType
		})
		.from(organisationBrandAssets)
		.where(eq(organisationBrandAssets.organisationId, organisationId));

	const assets: BrandView['assets'] = {};
	for (const row of rows) assets[row.slot] = { sha256: row.sha256, contentType: row.contentType };
	return assets;
}

/** The stylesheet is derived here, once, and cached with the view: never per request. */
function viewOf(row: BrandingRow, assets: BrandView['assets']): BrandView {
	const brandColor = row.brandColor as Hex | null;
	return {
		productName: row.productName,
		customised: isCustomised(row, assets),
		brandColor,
		css: brandColor ? brandCss(deriveBrand(brandColor)) : null,
		assets
	};
}

/**
 * The brand a page renders. `null` resolves the installation's organisation, for
 * the screens that have no session. Before setup, or without a saved row, it is
 * Unitati's default.
 */
export async function getBrand(organisationId: string | null): Promise<BrandView> {
	const id = organisationId ?? (await installationOrganisation());
	if (!id) return DEFAULT_BRAND;

	const cached = brands.get(id);
	if (cached) return cached;

	const [row] = await getDb()
		.select({
			productName: organisationBranding.productName,
			brandColor: organisationBranding.brandColor
		})
		.from(organisationBranding)
		.where(eq(organisationBranding.organisationId, id))
		.limit(1);

	const view = row ? viewOf(row, await loadAssets(id)) : DEFAULT_BRAND;
	brands.set(id, view);
	return view;
}

const productName = z
	.string()
	.trim()
	.refine((value) => graphemeCount(value) >= 1 && graphemeCount(value) <= PRODUCT_NAME_MAX)
	.refine((value) => !/\p{Cc}/u.test(value));

const brandingInput = z.object({ productName });

export type UpdateBrandingFailure = 'forbidden' | 'invalid-product-name' | 'invalid-brand-color';

/**
 * Saves the brand. Takes an object so each new field is an optional key rather
 * than another function. `brandColor`: a hex sets it, `null` clears it, and
 * leaving it out keeps what is stored.
 */
export async function updateBranding(
	user: SessionUser,
	input: { productName: string; brandColor?: string | null }
): Promise<Outcome<BrandView, UpdateBrandingFailure>> {
	if (!can(user, 'organisation.manage')) return failure('forbidden');

	const parsed = brandingInput.safeParse({ productName: input.productName });
	if (!parsed.success) return failure('invalid-product-name');

	let brandColor: Hex | null | undefined;
	if (input.brandColor === undefined || input.brandColor === null) {
		brandColor = input.brandColor;
	} else {
		const hex = parseHex(input.brandColor);
		if (!hex) return failure('invalid-brand-color');
		brandColor = hex;
	}

	const colour = brandColor === undefined ? {} : { brandColor };
	await getDb()
		.insert(organisationBranding)
		.values({
			organisationId: user.organisationId,
			productName: parsed.data.productName,
			...colour
		})
		.onConflictDoUpdate({
			target: organisationBranding.organisationId,
			set: { productName: parsed.data.productName, ...colour, updatedAt: new Date() }
		});

	brands.delete(user.organisationId);
	return success(await getBrand(user.organisationId));
}

export type SetBrandAssetFailure = ImageFailure | 'forbidden';

/**
 * Stores an uploaded image in `slot`. A new `mark` also regenerates the favicon and
 * the apple-touch icon from it (Q11). Processing runs before the transaction opens,
 * so a slow or refused image never holds a connection.
 */
export async function setBrandAsset(
	user: SessionUser,
	slot: UploadSlot,
	bytes: Uint8Array
): Promise<Outcome<BrandView, SetBrandAssetFailure>> {
	if (!can(user, 'organisation.manage')) return failure('forbidden');

	const processed = await processUpload(slot, bytes);
	if (!processed.ok) return failure(processed.error);

	const images: [BrandAssetSlot, typeof processed.value][] = [[slot, processed.value]];
	if (slot === 'mark') {
		try {
			const icons = await deriveIcons(processed.value);
			images.push(['favicon', icons.favicon], ['apple_touch', icons.apple_touch]);
		} catch {
			// The mark passed processing but cannot be rasterised (e.g. an SVG librsvg refuses).
			return failure('invalid-image');
		}
	}

	await getDb().transaction(async (tx) => {
		await tx
			.insert(organisationBranding)
			.values({ organisationId: user.organisationId, productName: DEFAULT_PRODUCT_NAME })
			.onConflictDoNothing();

		for (const [assetSlot, image] of images) {
			const values = {
				contentType: image.contentType,
				data: image.data,
				sha256: image.sha256,
				width: image.width,
				height: image.height
			};
			await tx
				.insert(organisationBrandAssets)
				.values({ organisationId: user.organisationId, slot: assetSlot, ...values })
				.onConflictDoUpdate({
					target: [organisationBrandAssets.organisationId, organisationBrandAssets.slot],
					set: { ...values, updatedAt: new Date() }
				});
		}
	});

	brands.delete(user.organisationId);
	return success(await getBrand(user.organisationId));
}

/** Idempotent. Removing the mark removes the icons derived from it. */
export async function removeBrandAsset(
	user: SessionUser,
	slot: UploadSlot
): Promise<Outcome<BrandView, 'forbidden'>> {
	if (!can(user, 'organisation.manage')) return failure('forbidden');

	const slots: BrandAssetSlot[] = slot === 'mark' ? ['mark', 'favicon', 'apple_touch'] : [slot];
	await getDb()
		.delete(organisationBrandAssets)
		.where(
			and(
				eq(organisationBrandAssets.organisationId, user.organisationId),
				inArray(organisationBrandAssets.slot, slots)
			)
		);

	brands.delete(user.organisationId);
	return success(await getBrand(user.organisationId));
}

/**
 * The stored bytes of one image, resolved like `getBrand` (`null` is the
 * installation's organisation). Not cached in memory: the HTTP cache does that.
 */
export async function getBrandAsset(
	organisationId: string | null,
	slot: BrandAssetSlot
): Promise<{ contentType: string; data: Uint8Array; sha256: string } | null> {
	const id = organisationId ?? (await installationOrganisation());
	if (!id) return null;

	const [row] = await getDb()
		.select({
			contentType: organisationBrandAssets.contentType,
			data: organisationBrandAssets.data,
			sha256: organisationBrandAssets.sha256
		})
		.from(organisationBrandAssets)
		.where(
			and(eq(organisationBrandAssets.organisationId, id), eq(organisationBrandAssets.slot, slot))
		)
		.limit(1);

	return row ?? null;
}
