import { redirectIfSignedIn } from '#lib/server/auth/guards.js';
import type { LayoutServerLoad } from './$types';

/** The personal pages that live here for their bare layout and need a session. */
const ACCOUNT_PATH_PREFIX = '/account/';

/**
 * Nobody signed in belongs on an auth screen, except on their own account pages:
 * changing their password (#230) and their notification preferences (#302) live
 * here for the bare layout and need a session.
 */
export const load: LayoutServerLoad = ({ locals, url }) => {
	if (!url.pathname.startsWith(ACCOUNT_PATH_PREFIX))
		redirectIfSignedIn(locals.user, url.searchParams.get('redirectTo'));
	return {};
};
