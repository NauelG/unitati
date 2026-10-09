import { error } from '@sveltejs/kit';
import { APP_ENV } from '$app/env/public';
import { isProduction } from '#lib/environment.js';
import type { LayoutServerLoad } from './$types';

/**
 * The gallery is a workbench, not a feature: it exists in every environment but production.
 * `APP_ENV` is read when the server starts, so the same build that serves staging also serves
 * production, and this 404 is the only thing that tells them apart (ADR 0011/0013).
 *
 * One guard at the layout, not one copy per page (#85): every route under `/dev/components`
 * inherits this `load` before its own runs, so a new page gets the guard for free instead of
 * one more place that could forget to call `isProduction`. `assets/+server.ts` is not a page and
 * keeps its own check — a layout `load` never runs for a `+server.ts` endpoint.
 */
export const load: LayoutServerLoad = () => {
	if (isProduction(APP_ENV)) error(404, 'Not found');
};
