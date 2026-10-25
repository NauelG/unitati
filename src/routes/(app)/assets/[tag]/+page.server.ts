import { error } from '@sveltejs/kit';
import { superValidate } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';
import { z } from 'zod';
import { attachmentFailureMessage } from '#lib/attachment-errors.js';
import { ASSET_READ_PERMISSIONS } from '#lib/domain/access.js';
import { ASSET_STATES } from '#lib/domain/status.js';
import { m } from '#lib/paraglide/messages.js';
import {
	addAssetAttachments,
	addAssetComment,
	deliver,
	signingLinkQr,
	archiveAsset,
	unarchiveAsset,
	changeLocation,
	changeState,
	getAssetByTag,
	readAssetAttachmentForm,
	removeAssetAttachment,
	WAIVE_REASON_MAX,
	type FullAssetView
} from '#lib/server/assets/index.js';
import {
	requireAnyPermission,
	requirePermission,
	type SessionUser
} from '#lib/server/auth/guards.js';
import { linkTicketAssets, unlinkAsset } from '#lib/server/links/index.js';
import { assetScreen } from '#lib/server/screens/index.js';
import { emptyModelForm } from '../create-model.server';
import { editAssetForm } from '../forms';
import { fieldsOf, rejected } from '../form-data';
import { takeBackAction } from '../take-back-action';
import { ticketLinkFor } from '../ticket-link';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, params, url }) => {
	const user = requireAnyPermission(locals.user, ASSET_READ_PERMISSIONS);

	const screen = await assetScreen(user, params.tag, {
		fromTicket: url.searchParams.get('ticket')
	});
	if (!screen.ok) error(404, 'Not found');
	const { value } = screen;
	const { asset } = value;

	// The contextual edit `Sheet` (ADR 0020) reuses `/assets/[tag]/edit`'s own
	// form shape and action. `superValidate` runs unconditionally — it is a
	// pure, no-DB call, and the client-side `superForm()` rune on the
	// `+page.svelte` side must itself run unconditionally (Svelte's rune
	// rule), so it cannot fall back to building this shape from the raw
	// validation schema: that schema lives under `#lib/server/`, and
	// importing it into a `+page.svelte` leaks server-only code into the
	// client bundle (caught only by `npm run build`, not `svelte-check`).
	// `asset` is `FullAssetView | SharedAssetView`: only the full view carries
	// `serial`/`assetModelId`/`shared`, so the seed narrows on `visibility`
	// explicitly.
	const editSeed =
		asset.visibility === 'full'
			? {
					name: asset.name,
					assetTag: asset.assetTag,
					serial: asset.serial,
					assetModelId: asset.assetModelId,
					shared: asset.shared
				}
			: {
					name: asset.name,
					assetTag: asset.assetTag,
					serial: null,
					assetModelId: '',
					shared: false
				};
	const [editForm, modelForm] = await Promise.all([
		superValidate(editSeed, zod4(editAssetForm)),
		emptyModelForm()
	]);

	return { ...value, editForm, modelForm };
};

/**
 * The asset an action targets, resolved from the URL's tag.
 *
 * Writing needs the internal id, which a shared row does not carry. Only a
 * viewer who sees the whole row reaches an action (`assets.manage` and
 * `assets.checkout` both belong to roles that hold `assets.view`), so anything
 * else is answered like a missing page rather than explained.
 */
async function targetOf(user: SessionUser, tag: string): Promise<FullAssetView> {
	const found = await getAssetByTag(user, tag);
	if (!found.ok || found.value.visibility !== 'full') error(404, 'Not found');
	return found.value;
}

const deliverForm = z.object({
	personId: z.uuid(),
	assetIds: z.array(z.uuid()).min(1),
	// A checkbox: present means ticked.
	waive: z.literal('on').optional(),
	waiveReason: z.string().optional()
});
const stateForm = z.object({ state: z.enum(ASSET_STATES) });
// An empty string is "no location", which is a real choice, not a missing value.
const locationForm = z.object({ locationId: z.union([z.uuid(), z.literal('')]) });
const commentFailures = {
	empty_comment: m.action_error_empty_note,
	comment_too_long: m.action_error_comment_too_long,
	asset_not_found: m.asset_error_gone
} as const;

const commentForm = z.object({ text: z.string().trim().min(1) });

export const actions: Actions = {
	deliver: async ({ request, locals, params }) => {
		const user = requirePermission(locals.user, 'assets.checkout');
		const data = await request.formData();
		const parsed = deliverForm.safeParse({
			personId: data.get('personId'),
			assetIds: data.getAll('assetIds'),
			waive: data.get('waive') ?? undefined,
			waiveReason: data.get('waiveReason') ?? undefined
		});
		if (!parsed.success) return rejected('deliver', m.action_error_invalid());

		// The URL's asset must be visible to the actor; the dialog only preselects it.
		await targetOf(user, params.tag);
		// The reason's bounds and the permission are the domain's to check, not the form's.
		const ticketLink = await ticketLinkFor(user, data.get('ticketTag'));
		if (!ticketLink.ok) return rejected('deliver', m.ticket_handover_error_ticket());

		const outcome = await deliver(
			user,
			{
				personId: parsed.data.personId,
				assetIds: parsed.data.assetIds,
				waive: parsed.data.waive ? { reason: parsed.data.waiveReason ?? '' } : undefined
			},
			{ afterIssue: ticketLink.afterIssue }
		);

		if (!outcome.ok) {
			const reasons = {
				no_assets: m.action_error_invalid(),
				person_not_found: m.action_error_person_missing(),
				already_in_custody: m.action_error_already_in_custody(),
				asset_not_found: m.asset_error_gone(),
				no_delivery_template: m.deliver_error_no_template(),
				waive_forbidden: m.deliver_error_waive_forbidden(),
				waive_not_required: m.deliver_error_waive_not_required(),
				invalid_waive_reason: m.deliver_error_waive_reason({ max: WAIVE_REASON_MAX })
			};
			return rejected('deliver', reasons[outcome.error]);
		}
		const { handover } = outcome.value;
		// The only moment the plain link exists on screen: it is not stored.
		return {
			action: 'deliver' as const,
			handoverCode: handover?.code ?? null,
			handoverLink: handover?.status === 'pending' ? handover.link : null,
			handoverWaived: handover?.status === 'waived',
			qrSvg: handover?.status === 'pending' ? await signingLinkQr(handover.link) : null
		};
	},

	takeBack: async ({ request, locals, params }) => {
		const user = requirePermission(locals.user, 'assets.checkout');
		const asset = await targetOf(user, params.tag);
		return takeBackAction(user, await request.formData(), asset.id);
	},

	changeState: async ({ request, locals, params }) => {
		const user = requirePermission(locals.user, 'assets.manage');
		const parsed = stateForm.safeParse(await fieldsOf(request));
		if (!parsed.success) return rejected('changeState', m.action_error_invalid());

		const asset = await targetOf(user, params.tag);
		const outcome = await changeState(user, asset.id, parsed.data.state);

		if (!outcome.ok) return rejected('changeState', m.asset_error_gone());
		return { action: 'changeState' as const };
	},

	archive: async ({ locals, params }) => {
		const user = requirePermission(locals.user, 'assets.manage');
		const asset = await targetOf(user, params.tag);
		const outcome = await archiveAsset(user, asset.id);

		if (!outcome.ok) {
			return rejected(
				'archive',
				outcome.error === 'has_history' ? m.asset_archive_has_history() : m.asset_error_gone()
			);
		}
		return { action: 'archive' as const };
	},

	unarchive: async ({ locals, params }) => {
		const user = requirePermission(locals.user, 'assets.manage');
		const asset = await targetOf(user, params.tag);
		const outcome = await unarchiveAsset(user, asset.id);

		if (!outcome.ok) return rejected('unarchive', m.asset_error_gone());
		return { action: 'unarchive' as const };
	},

	changeLocation: async ({ request, locals, params }) => {
		const user = requirePermission(locals.user, 'assets.manage');
		const parsed = locationForm.safeParse(await fieldsOf(request));
		if (!parsed.success) return rejected('changeLocation', m.action_error_invalid());

		const asset = await targetOf(user, params.tag);
		const outcome = await changeLocation(user, asset.id, parsed.data.locationId || null);

		if (!outcome.ok) {
			return rejected(
				'changeLocation',
				outcome.error === 'location_not_found'
					? m.asset_error_location_missing()
					: m.asset_error_gone()
			);
		}
		return { action: 'changeLocation' as const };
	},

	addComment: async ({ request, locals, params }) => {
		const user = requirePermission(locals.user, 'assets.manage');
		const parsed = commentForm.safeParse(await fieldsOf(request));
		if (!parsed.success) return rejected('addComment', m.action_error_empty_note());

		const asset = await targetOf(user, params.tag);
		const outcome = await addAssetComment(user, asset.id, parsed.data.text);

		if (!outcome.ok) {
			return rejected('addComment', commentFailures[outcome.error]());
		}
		return { action: 'addComment' as const };
	},

	addAttachments: async ({ request, locals, params }) => {
		const user = requirePermission(locals.user, 'assets.manage');
		const { files } = await readAssetAttachmentForm(request);
		if (files.length === 0) return rejected('addAttachments', m.attachments_pick_none());

		const asset = await targetOf(user, params.tag);
		const outcome = await addAssetAttachments(user, asset.id, files);
		if (!outcome.ok) {
			return rejected('addAttachments', attachmentFailureMessage(outcome.error));
		}

		return { action: 'addAttachments' as const };
	},

	removeAttachment: async ({ request, locals, params }) => {
		const user = requirePermission(locals.user, 'assets.manage');
		const { attachmentId } = await readAssetAttachmentForm(request);
		if (!z.uuid().safeParse(attachmentId).success) {
			return rejected('removeAttachment', m.action_error_invalid());
		}

		// The page's asset must be one the viewer can reach; the domain then
		// resolves the attachment inside the organisation.
		await targetOf(user, params.tag);
		const outcome = await removeAssetAttachment(user, attachmentId);
		// Already gone, e.g. a second tab removed it first: the reload shows the truth.
		if (!outcome.ok && outcome.error !== 'attachment_not_found') {
			return rejected('removeAttachment', m.error_generic());
		}

		return { action: 'removeAttachment' as const };
	},

	linkTickets: async ({ request, locals, params }) => {
		const user = requirePermission(locals.user, 'tickets.manage');
		const ids = (await request.formData()).getAll('ids').filter((id) => typeof id === 'string');

		const asset = await targetOf(user, params.tag);

		if (ids.length === 0) return rejected('linkTickets', m.related_link_ticket_nothing_selected());

		const parsed = z.array(z.uuid()).safeParse(ids);
		if (!parsed.success) return rejected('linkTickets', m.related_link_ticket_unavailable());

		const outcome = await linkTicketAssets(
			user,
			parsed.data.map((ticketId) => ({ ticketId, assetId: asset.id }))
		);
		if (!outcome.ok) {
			const { reason } = outcome.error;
			if (reason === 'forbidden') error(403, 'Forbidden');
			if (reason === 'empty') {
				return rejected('linkTickets', m.related_link_ticket_nothing_selected());
			}
			if (reason === 'asset_not_found') return rejected('linkTickets', m.asset_error_gone());
			return rejected('linkTickets', m.related_link_ticket_unavailable(), outcome.error.id);
		}
		return { action: 'linkTickets' as const, linked: outcome.value.linked };
	},

	unlinkTicket: async ({ request, locals, params }) => {
		const user = requirePermission(locals.user, 'tickets.manage');
		const parsed = z.object({ recordId: z.uuid() }).safeParse(await fieldsOf(request));
		if (!parsed.success) return rejected('unlinkTicket', m.related_unlink_failed());

		const asset = await targetOf(user, params.tag);
		const outcome = await unlinkAsset(user, { ticketId: parsed.data.recordId, assetId: asset.id });

		// Already gone, e.g. a second tab removed it first: the page reloads and
		// shows the truth, so there is nothing to apologise for.
		if (!outcome.ok && outcome.error === 'forbidden') error(403, 'Forbidden');
		if (!outcome.ok && outcome.error !== 'not_linked') {
			return rejected('unlinkTicket', m.related_unlink_failed());
		}
		return { action: 'unlinkTicket' as const };
	}
};
