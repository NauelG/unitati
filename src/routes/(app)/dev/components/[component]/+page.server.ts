import { error } from '@sveltejs/kit';
import { findComponentEntry } from '../gallery/manifest.js';
import type { PageServerLoad } from './$types';

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
