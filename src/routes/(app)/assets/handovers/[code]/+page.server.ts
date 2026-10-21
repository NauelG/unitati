import { error } from '@sveltejs/kit';
import { m } from '#lib/paraglide/messages.js';
import { can } from '#lib/server/access/permissions.js';
import {
	ensureHandoverDocument,
	getHandover,
	resendHandover,
	signingLinkQr
} from '#lib/server/assets/index.js';
import { requirePermission } from '#lib/server/auth/guards.js';
import { relatedTo, type RecordRef, type RestrictedRecordRef } from '#lib/server/links/index.js';
import { rejected } from '../../form-data';
import type { Actions, PageServerLoad } from './$types';

/** The tickets raised on the handover's assets, once each: the handover has no link of its own. */
async function ticketsOf(
	user: Parameters<typeof relatedTo>[0],
	assetIds: readonly string[]
): Promise<(RecordRef | RestrictedRecordRef)[]> {
	if (!can(user, 'tickets.view')) return [];
	const groups = await Promise.all(assetIds.map((id) => relatedTo(user, { kind: 'asset', id })));
	const tickets = new Map<string, RecordRef | RestrictedRecordRef>();
	for (const group of groups.flat()) {
		if (group.relation !== 'affected_by') continue;
		for (const item of group.items) tickets.set(item.ref.id, item.ref);
	}
	return [...tickets.values()];
}

export const load: PageServerLoad = async ({ locals, params }) => {
	const user = requirePermission(locals.user, 'assets.view');
	const found = await getHandover(user, params.code);
	if (!found.ok) error(404, 'Not found');
	const handover = found.value;

	return {
		handover,
		tickets: await ticketsOf(
			user,
			handover.assets.map((asset) => asset.assetId)
		),
		canManage: can(user, 'assets.manage')
	};
};

export const actions: Actions = {
	resend: async ({ locals, params }) => {
		const user = requirePermission(locals.user, 'assets.manage');
		const outcome = await resendHandover(user, params.code);
		if (!outcome.ok) {
			return rejected(
				'resend',
				outcome.error === 'not_found'
					? m.handover_resend_error_not_found()
					: m.handover_resend_error_not_resendable()
			);
		}
		// The only moment the plain link exists on screen: it is not stored.
		const { link, expiresAt, mailed } = outcome.value;
		return {
			action: 'resend' as const,
			link,
			mailed,
			expiresAt: expiresAt.toISOString(),
			qrSvg: await signingLinkQr(link)
		};
	},

	generateDocument: async ({ locals, params }) => {
		const user = requirePermission(locals.user, 'assets.manage');
		// Resolved through the viewer's organisation first: the ensure call takes a bare id.
		const found = await getHandover(user, params.code);
		if (!found.ok) error(404, 'Not found');

		try {
			const outcome = await ensureHandoverDocument(found.value.id);
			if (!outcome.ok) return rejected('generateDocument', m.handover_document_none());
		} catch (cause) {
			console.error(`could not generate the document of handover ${params.code}`, cause);
			return rejected('generateDocument', m.handover_document_error());
		}
		return { action: 'generateDocument' as const };
	}
};
