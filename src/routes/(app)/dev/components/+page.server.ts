import { error } from '@sveltejs/kit';
import { dev } from '$app/env';
import type { PageServerLoad } from './$types';

/**
 * The gallery is a workbench, not a feature. `dev` is replaced by a literal at
 * build time, so in a production build this collapses to an unconditional 404
 * and the page component below it is never reached.
 */
export const load: PageServerLoad = () => {
	if (!dev) error(404, 'Not found');
};
