import { json } from '@sveltejs/kit';
import { requirePermission } from '#lib/server/auth/guards.js';
import { listAssetChoices } from '#lib/server/assets/index.js';
import type { RequestHandler } from './$types';

/**
 * The same staff, scoped asset search as the sibling endpoint, answered in the
 * `{ value, label }` shape `SearchSelectField` reads (the sibling keeps
 * `AssetPicker`'s own). "Vincular activo" on the ticket record asks here.
 */
export const GET: RequestHandler = async ({ locals, url }) => {
	const user = requirePermission(locals.user, 'tickets.manage');
	const choices = await listAssetChoices(user, { search: url.searchParams.get('q') ?? '' });

	return json(
		choices.map((choice) => ({ value: choice.id, label: `${choice.assetTag} · ${choice.name}` }))
	);
};
