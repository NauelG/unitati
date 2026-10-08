import { error, fail } from '@sveltejs/kit';
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
	returnCustody,
	type FullAssetView
} from '#lib/server/assets/index.js';
import {
	requireAnyPermission,
	requirePermission,
	type SessionUser
} from '#lib/server/auth/guards.js';
import { listLocations, listPeople } from '#lib/server/directory/index.js';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, params }) => {
	const user = requireAnyPermission(locals.user, ASSET_READ_PERMISSIONS);

	const found = await getAssetByTag(user, params.tag);
	if (!found.ok) error(404, 'Not found');
	const asset = found.value;

	// Gated separately inside the domain: holding `assets.view.shared` shows a
	// shared asset's name and place, and explicitly not its history (ADR 0007).
	const history = await assetTimeline(user, params.tag);

	const canManage = can(user, 'assets.manage');
	const canCheckout = can(user, 'assets.checkout');

	// The pickers feed the action forms, which only a person who can act sees.
	const [people, locations] =
		asset.visibility === 'full' && (canManage || canCheckout)
			? await Promise.all([listPeople(user.organisationId), listLocations(user.organisationId)])
			: [[], []];

	return {
		asset,
		timeline: history.ok ? history.value : null,
		canManage,
		canCheckout,
		people: people.filter((person) => person.active).map(({ id, fullName }) => ({ id, fullName })),
		locations
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

type Fields = Record<string, string>;

async function fieldsOf(request: Request): Promise<Fields> {
	const data = await request.formData();
	return Object.fromEntries([...data].filter(([, value]) => typeof value === 'string')) as Fields;
}

const rejected = (action: string, message: string) => fail(400, { action, message });

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
