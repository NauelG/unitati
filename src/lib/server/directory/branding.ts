import { asc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { brandCss, deriveBrand, parseHex, type Hex } from '#lib/domain/brand-color.js';
import {
	DEFAULT_BRAND,
	DEFAULT_PRODUCT_NAME,
	PRODUCT_NAME_MAX,
	graphemeCount,
	type BrandView
} from '#lib/domain/brand.js';
import { can } from '../access/permissions';
import type { SessionUser } from '../auth/guards';
import { getDb } from '../db';
import { failure, success, type Outcome } from '../shared/outcome';
import { organisationBranding, organisations } from './schema';

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

/** Customised means the brand differs from Unitati's default. #161 extends it. */
function isCustomised(row: BrandingRow): boolean {
	return row.productName !== DEFAULT_PRODUCT_NAME || row.brandColor !== null;
}

/** The stylesheet is derived here, once, and cached with the view: never per request. */
function viewOf(row: BrandingRow): BrandView {
	const brandColor = row.brandColor as Hex | null;
	return {
		productName: row.productName,
		customised: isCustomised(row),
		brandColor,
		css: brandColor ? brandCss(deriveBrand(brandColor)) : null
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

	const view = row ? viewOf(row) : DEFAULT_BRAND;
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
	const [row] = await getDb()
		.insert(organisationBranding)
		.values({
			organisationId: user.organisationId,
			productName: parsed.data.productName,
			...colour
		})
		.onConflictDoUpdate({
			target: organisationBranding.organisationId,
			set: { productName: parsed.data.productName, ...colour, updatedAt: new Date() }
		})
		.returning({
			productName: organisationBranding.productName,
			brandColor: organisationBranding.brandColor
		});

	const view = viewOf(row);
	brands.delete(user.organisationId);
	return success(view);
}
