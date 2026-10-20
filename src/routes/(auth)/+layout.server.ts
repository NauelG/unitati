import { PASSWORD_CHANGE_PATH, redirectIfSignedIn } from '#lib/server/auth/guards.js';
import type { LayoutServerLoad } from './$types';

/**
 * Nobody signed in belongs on an auth screen, except to change their password:
 * that page lives here for its bare layout and needs a session (#230).
 */
export const load: LayoutServerLoad = ({ locals, url }) => {
	if (url.pathname !== PASSWORD_CHANGE_PATH)
		redirectIfSignedIn(locals.user, url.searchParams.get('redirectTo'));
	return {};
};
