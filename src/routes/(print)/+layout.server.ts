import { requireUser } from '#lib/server/auth/guards.js';
import type { LayoutServerLoad } from './$types';

/** Print pages have no shell and no permission of their own: each page gates itself. */
export const load: LayoutServerLoad = ({ locals, url }) => {
	requireUser(locals.user, url);
};
