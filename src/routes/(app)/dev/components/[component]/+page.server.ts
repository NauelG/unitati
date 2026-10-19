import { error, fail } from '@sveltejs/kit';
import { APP_ENV } from '$app/env/public';
import { isProduction } from '#lib/environment.js';
import { findComponentEntry } from '../gallery/manifest.js';
import type { Actions, PageServerLoad } from './$types';

/**
 * The production 404 guard lives in the parent `+layout.server.ts` (ADR 0011/0013) and already
 * ran before this `load`. An unknown `[component]` segment 404s too — the manifest is the only
 * vocabulary of valid ids, not the route param.
 */
export const load: PageServerLoad = ({ params }) => {
	const entry = findComponentEntry(params.component);
	if (!entry) error(404, 'Not found');

	return { componentId: entry.id };
};

/**
 * Actions for the in-place editing specimens (ADR 0029): one that always saves, slowly enough
 * to see the pending state, and one that always fails so the rollback and toast can be seen.
 * An action is not a page, so the layout's guard never runs for it; each one guards itself.
 */
export const actions: Actions = {
	save: async () => {
		if (isProduction(APP_ENV)) error(404, 'Not found');
		await new Promise((resolve) => setTimeout(resolve, 600));
		return { saved: true };
	},
	fail: async () => {
		if (isProduction(APP_ENV)) error(404, 'Not found');
		await new Promise((resolve) => setTimeout(resolve, 600));
		return fail(400, { message: 'Sin permiso para cambiar esta propiedad.' });
	}
};
