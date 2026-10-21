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
import { relatedTo } from '#lib/server/links/index.js';
import { rejected } from '../../form-data';
import type { Actions, PageServerLoad } from './$types';

/** The tickets this handover fulfils (#279): its own links, read from the `links` domain. */
async function ticketsOf(
	user: Parameters<typeof relatedTo>[0],
	handoverId: string
): Promise<{ id: string; kind: 'ticket'; tag: string; title: string; href: string | null }[]> {
	const groups = await relatedTo(user, { kind: 'handover', id: handoverId });
	return groups
		.filter((group) => group.relation === 'fulfils')
		.flatMap((group) => group.items.map((item) => item.ref))
		.flatMap((ref) =>
			ref.kind === 'ticket'
				? [{ id: ref.id, kind: 'ticket' as const, tag: ref.tag, title: ref.title, href: ref.href }]
				: []
		);
}

export const load: PageServerLoad = async ({ locals, params }) => {
	const user = requirePermission(locals.user, 'assets.view');
	const found = await getHandover(user, params.code);
	if (!found.ok) error(404, 'Not found');
	const handover = found.value;

	return {
		handover,
		tickets: await ticketsOf(user, handover.id),
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
