import { error } from '@sveltejs/kit';
import { superValidate } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';
import { z } from 'zod';
import { ASSET_READ_PERMISSIONS } from '#lib/domain/access.js';
import { ASSET_STATES } from '#lib/domain/status.js';
import { m } from '#lib/paraglide/messages.js';
import { can } from '#lib/server/access/permissions.js';
import {
	addNote,
	assetTimeline,
	assignCustody,
	changeLocation,
	changeState,
	getAssetByTag,
	listAssetModels,
	returnCustody,
	type FullAssetView
} from '#lib/server/assets/index.js';
import {
	requireAnyPermission,
	requirePermission,
	type SessionUser
} from '#lib/server/auth/guards.js';
import { listLocations, listPeople } from '#lib/server/directory/index.js';
import {
	mergeAssetTimeline,
	RECENT_MONTHS,
	recentTicketCount,
	relatedTo,
	type AssetTimelineItem
} from '#lib/server/links/index.js';
import { editAssetForm } from '../forms';
import { fieldsOf, rejected } from '../form-data';
import type { Actions, PageServerLoad } from './$types';

/**
 * The timeline rail (#89): the slowest read on this page and the one with
 * nothing else depending on it, so it streams — returned unawaited by
 * `load` below, resolved by `+page.svelte`'s `{#await}` behind a
 * `TimelineSkeleton` that matches the real rail's geometry (no CLS).
 */
async function timelineRailOf(
	user: SessionUser,
	tag: string,
	asset: { visibility: 'full' | 'shared'; id?: string }
): Promise<{ timeline: AssetTimelineItem[] | null; recentTickets: number }> {
	// Gated separately inside the domain: holding `assets.view.shared` shows a
	// shared asset's name and place, and explicitly not its history (ADR 0007).
	const history = await assetTimeline(user, tag);

	// The live half of the rail: tickets raised on this machine, with the status
	// they have today. Asked only when the history itself is visible, and
	// `relatedTo` withholds tickets from anybody without `tickets.view`.
	const related =
		history.ok && asset.visibility === 'full' && asset.id
			? await relatedTo(user, { kind: 'asset', id: asset.id })
			: [];
	return {
		timeline: history.ok ? mergeAssetTimeline(history.value, related) : null,
		recentTickets: recentTicketCount(related, new Date())
	};
}

export const load: PageServerLoad = async ({ locals, params }) => {
	const user = requireAnyPermission(locals.user, ASSET_READ_PERMISSIONS);

	const found = await getAssetByTag(user, params.tag);
	if (!found.ok) error(404, 'Not found');
	const asset = found.value;

	const canManage = can(user, 'assets.manage');
	const canCheckout = can(user, 'assets.checkout');

	// The pickers feed the action forms, which only a person who can act sees.
	const [people, locations] =
		asset.visibility === 'full' && (canManage || canCheckout)
			? await Promise.all([listPeople(user.organisationId), listLocations(user.organisationId)])
			: [[], []];

	// The contextual edit `Sheet` (ADR 0020) reuses `/assets/[tag]/edit`'s own
	// form shape and action. `superValidate` runs unconditionally — it is a
	// pure, no-DB call, and the client-side `superForm()` rune on the
	// `+page.svelte` side must itself run unconditionally (Svelte's rune
	// rule), so it cannot fall back to building this shape from the raw
	// validation schema: that schema lives under `#lib/server/`, and
	// importing it into a `+page.svelte` leaks server-only code into the
	// client bundle (caught only by `npm run build`, not `svelte-check`).
	// The model catalogue stays gated on `editable`: it is a real DB call,
	// and only a manager viewing a non-shared row ever renders the Sheet
	// that needs it.
	const editable = asset.visibility === 'full' && canManage;
	// `asset` is `FullAssetView | SharedAssetView`: only the full view carries
	// `serial`/`assetModelId`/`shared`, so the seed narrows on `visibility`
	// explicitly rather than relying on `editable` (which `superValidate`
	// itself, called unconditionally below, cannot see).
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
	const [editForm, editModels] = await Promise.all([
		superValidate(editSeed, zod4(editAssetForm)),
		editable ? listAssetModels(user.organisationId) : Promise.resolve([])
	]);

	return {
		asset,
		// Unawaited on purpose (#89): SvelteKit streams this to the client as a
		// promise, resolved by `+page.svelte`'s `{#await}` behind a skeleton.
		timelineRail: timelineRailOf(user, params.tag, {
			visibility: asset.visibility,
			id: asset.visibility === 'full' ? asset.id : undefined
		}),
		recentMonths: RECENT_MONTHS,
		canManage,
		canCheckout,
		people: people.filter((person) => person.active).map(({ id, fullName }) => ({ id, fullName })),
		locations,
		editForm,
		editModels
	};
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

const personForm = z.object({ personId: z.uuid() });
const stateForm = z.object({ state: z.enum(ASSET_STATES) });
// An empty string is "no location", which is a real choice, not a missing value.
const locationForm = z.object({ locationId: z.union([z.uuid(), z.literal('')]) });
const noteForm = z.object({ text: z.string().trim().min(1) });

export const actions: Actions = {
	assignCustody: async ({ request, locals, params }) => {
		const user = requirePermission(locals.user, 'assets.checkout');
		const parsed = personForm.safeParse(await fieldsOf(request));
		if (!parsed.success) return rejected('assignCustody', m.action_error_invalid());

		const asset = await targetOf(user, params.tag);
		const outcome = await assignCustody(user, asset.id, parsed.data.personId);

		if (!outcome.ok) {
			return rejected(
				'assignCustody',
				outcome.error === 'person_not_found'
					? m.action_error_person_missing()
					: m.asset_error_gone()
			);
		}
		return { action: 'assignCustody' as const };
	},

	returnCustody: async ({ locals, params }) => {
		const user = requirePermission(locals.user, 'assets.checkout');
		const asset = await targetOf(user, params.tag);
		const outcome = await returnCustody(user, asset.id);

		if (!outcome.ok) {
			return rejected(
				'returnCustody',
				outcome.error === 'not_in_custody' ? m.action_error_not_in_custody() : m.asset_error_gone()
			);
		}
		return { action: 'returnCustody' as const };
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

	addNote: async ({ request, locals, params }) => {
		const user = requirePermission(locals.user, 'assets.manage');
		const parsed = noteForm.safeParse(await fieldsOf(request));
		if (!parsed.success) return rejected('addNote', m.action_error_empty_note());

		const asset = await targetOf(user, params.tag);
		const outcome = await addNote(user, asset.id, parsed.data.text);

		if (!outcome.ok) {
			return rejected(
				'addNote',
				outcome.error === 'empty_note' ? m.action_error_empty_note() : m.asset_error_gone()
			);
		}
		return { action: 'addNote' as const };
	}
};
