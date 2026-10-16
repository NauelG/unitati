import { getBrand } from '#lib/server/directory/index.js';
import type { LayoutServerLoad } from './$types';

/**
 * The brand reaches every page through SSR, signed in or not (ADR 0026): `/login`
 * and `/setup` have no session, so with no user the domain resolves the
 * installation's own organisation. There is no `depends()`: a successful branding
 * action re-runs this load through SvelteKit's default `invalidateAll`.
 */
export const load: LayoutServerLoad = async ({ locals }) => ({
	brand: await getBrand(locals.user?.organisationId ?? null)
});
