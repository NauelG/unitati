import { error } from '@sveltejs/kit';
import { APP_ENV } from '$app/env/public';
import { isProduction } from '#lib/environment.js';
import type { PageServerLoad } from './$types';

/**
 * The gallery is a workbench, not a feature: it exists in every environment but production.
 * `APP_ENV` is read when the server starts, so the same build that serves staging also serves
 * production, and this 404 is the only thing that tells them apart. See ADR 0011.
 */
export const load: PageServerLoad = () => {
	if (isProduction(APP_ENV)) error(404, 'Not found');
};
