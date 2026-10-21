import { z } from 'zod';
import { HANDOVER_CONDITIONS } from '#lib/domain/handover.js';
import { m } from '#lib/paraglide/messages.js';
import { signingLinkQr, takeBack } from '#lib/server/assets/index.js';
import type { SessionUser } from '#lib/server/auth/guards.js';
import { rejected } from './form-data';

/** Both the asset and directory surfaces post the same take-back form. */
const input = z.object({ personId: z.uuid(), assetIds: z.array(z.uuid()).min(1) });
const condition = z.enum(HANDOVER_CONDITIONS);

export async function takeBackAction(actor: SessionUser, data: FormData, requiredAssetId?: string) {
	const parsed = input.safeParse({
		personId: data.get('personId'),
		assetIds: data.getAll('assetIds')
	});
	if (!parsed.success || (requiredAssetId && !parsed.data.assetIds.includes(requiredAssetId))) {
		return rejected('takeBack', m.action_error_invalid());
	}

	const items = parsed.data.assetIds.map((assetId) => {
		const picked = condition.safeParse(data.get(`condition:${assetId}`));
		const rawNotes = data.get(`notes:${assetId}`);
		return picked.success && typeof rawNotes === 'string'
			? { assetId, condition: picked.data, notes: rawNotes }
			: null;
	});
	if (items.some((item) => item === null)) {
		return rejected('takeBack', m.take_back_error_condition());
	}

	const outcome = await takeBack(
		actor,
		parsed.data.personId,
		items.filter((item) => item !== null)
	);
	if (!outcome.ok) {
		const reasons = {
			no_assets: m.action_error_invalid(),
			duplicate_asset: m.action_error_invalid(),
			invalid_condition: m.take_back_error_condition(),
			asset_not_found: m.asset_error_gone(),
			person_not_found: m.action_error_person_missing(),
			not_in_custody: m.take_back_error_not_held(),
			no_return_template: m.take_back_error_no_template()
		};
		return rejected('takeBack', reasons[outcome.error]);
	}
	const { handover } = outcome.value;
	return {
		action: 'takeBack' as const,
		handoverCode: handover?.code ?? null,
		handoverLink: handover?.link ?? null,
		qrSvg: handover ? await signingLinkQr(handover.link) : null
	};
}
