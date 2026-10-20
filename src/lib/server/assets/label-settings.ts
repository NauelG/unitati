import { eq } from 'drizzle-orm';
import { graphemeCount } from '#lib/domain/brand.js';
import { LABEL_OWNER_TEXT_MAX } from '#lib/domain/label-formats.js';
import { can } from '../access/permissions';
import type { SessionUser } from '../auth/guards';
import { getDb, type Executor } from '../db';
import { failure, success, type Outcome } from '../shared/outcome';
import { assetLabelSettings } from './schema';

/**
 * What an organisation prints on its asset labels beyond the QR and the tag
 * (ADR 0038, decision 3 of "Printing").
 *
 * The owner line replaces "Propiedad de {product name}" whole, wording
 * included. `null` means the default, which the print page renders in the
 * viewer's locale; it is never stored as text.
 */

export interface LabelSettings {
	/** The organisation's own owner line, or `null` for the default. */
	ownerText: string | null;
}

/** No row means the defaults. */
export async function getLabelSettings(
	organisationId: string,
	executor: Executor = getDb()
): Promise<LabelSettings> {
	const [row] = await executor
		.select({ ownerText: assetLabelSettings.ownerText })
		.from(assetLabelSettings)
		.where(eq(assetLabelSettings.organisationId, organisationId))
		.limit(1);
	return { ownerText: row?.ownerText ?? null };
}

export type SetLabelOwnerTextFailure = 'forbidden' | 'invalid_owner_text';

/**
 * Sets the owner line. Blank (after trimming) goes back to the default; a line
 * break or any other control character is refused, since the label prints one
 * short line.
 */
export async function setLabelOwnerText(
	actor: SessionUser,
	text: string
): Promise<Outcome<LabelSettings, SetLabelOwnerTextFailure>> {
	if (!can(actor, 'assets.manage')) return failure('forbidden');

	const trimmed = text.trim();
	if (/\p{Cc}/u.test(trimmed) || graphemeCount(trimmed) > LABEL_OWNER_TEXT_MAX) {
		return failure('invalid_owner_text');
	}
	const ownerText = trimmed === '' ? null : trimmed;

	await getDb()
		.insert(assetLabelSettings)
		.values({ organisationId: actor.organisationId, ownerText })
		.onConflictDoUpdate({
			target: assetLabelSettings.organisationId,
			set: { ownerText, updatedAt: new Date() }
		});
	return success({ ownerText });
}
