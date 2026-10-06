import { redirectIfSignedIn } from '#lib/server/auth/guards.js';
import type { LayoutServerLoad } from './$types';

/** Nobody signed in belongs on an auth screen. */
export const load: LayoutServerLoad = ({ locals }) => {
	redirectIfSignedIn(locals.user);
	return {};
};
