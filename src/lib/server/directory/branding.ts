import { asc, eq } from 'drizzle-orm';
import { z } from 'zod';
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

/** Customised means the brand differs from Unitati's default. #160 and #161 extend it. */
function isCustomised(row: { productName: string }): boolean {
	return row.productName !== DEFAULT_PRODUCT_NAME;
}

function viewOf(row: { productName: string }): BrandView {
	return { productName: row.productName, customised: isCustomised(row) };
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
		.select({ productName: organisationBranding.productName })
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

export type UpdateBrandingFailure = 'forbidden' | 'invalid-product-name';

/**
 * Saves the brand. Takes an object so a later field (the colour, #160) is a new
 * optional key rather than a second function.
 */
export async function updateBranding(
	user: SessionUser,
	input: { productName: string }
): Promise<Outcome<BrandView, UpdateBrandingFailure>> {
	if (!can(user, 'organisation.manage')) return failure('forbidden');

	const parsed = brandingInput.safeParse(input);
	if (!parsed.success) return failure('invalid-product-name');

	const [row] = await getDb()
		.insert(organisationBranding)
		.values({ organisationId: user.organisationId, productName: parsed.data.productName })
		.onConflictDoUpdate({
			target: organisationBranding.organisationId,
			set: { productName: parsed.data.productName, updatedAt: new Date() }
		})
		.returning({ productName: organisationBranding.productName });

	const view = viewOf(row);
	brands.delete(user.organisationId);
	return success(view);
}
