import { error } from '@sveltejs/kit';
import QRCode from 'qrcode';
import { BETTER_AUTH_URL } from '$app/env/private';
import { MAX_LABELS, parseFormat, parseSkip } from '#lib/domain/label-formats.js';
import { scanUrl } from '#lib/domain/scan.js';
import { listAssetsByTags } from '#lib/server/assets/index.js';
import { requirePermission } from '#lib/server/auth/guards.js';
import type { PageServerLoad } from './$types';

/** Error correction M: a scuffed or creased sticker still scans, at a size that stays printable. */
const QR_OPTIONS = { errorCorrectionLevel: 'M', margin: 0 } as const;

/** Drawn with `margin: 0`: the sheet pads the 4-module quiet zone in CSS. */
function qrFor(text: string) {
	return QRCode.toString(text, { ...QR_OPTIONS, type: 'svg' });
}

export const load: PageServerLoad = async ({ locals, url }) => {
	const user = requirePermission(locals.user, 'assets.manage', url);

	const requested = [
		...new Set(
			url.searchParams
				.getAll('tag')
				.map((tag) => tag.trim())
				.filter(Boolean)
		)
	];
	if (requested.length === 0 || requested.length > MAX_LABELS) {
		error(400, `Between 1 and ${MAX_LABELS} tags`);
	}

	const format = parseFormat(url.searchParams.get('format'));
	const skip = parseSkip(url.searchParams.get('skip'), format);

	// The one public origin of the installation, the same that auth and mail
	// links use. Never the request's: a label printed from a LAN address would
	// be useless for years (ADR 0038).
	const origin = new URL(BETTER_AUTH_URL).origin;

	const found = await listAssetsByTags(user, requested);
	const foundTags = new Set(found.map((asset) => asset.assetTag));

	const labels = await Promise.all(
		found.map(async (asset) => ({
			tag: asset.assetTag,
			name: asset.name,
			qrSvg: await qrFor(scanUrl(origin, asset.assetTag))
		}))
	);

	return {
		format,
		skip,
		labels,
		missing: requested.filter((tag) => !foundTags.has(tag)),
		requested,
		origin,
		requestOrigin: url.origin,
		originMismatch: origin !== url.origin
	};
};
