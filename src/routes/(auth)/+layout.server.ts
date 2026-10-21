import { PASSWORD_CHANGE_PATH, redirectIfSignedIn } from '#lib/server/auth/guards.js';
import { PREFERENCES_PATH } from '#lib/server/notifications/index.js';
import type { LayoutServerLoad } from './$types';

/** The personal pages that live here for their bare layout and need a session. */
const ACCOUNT_PATHS: readonly string[] = [PASSWORD_CHANGE_PATH, PREFERENCES_PATH];

/**
 * Nobody signed in belongs on an auth screen, except on their own account pages:
 * changing their password (#230) and their notification preferences (#302). An
 * explicit list, so a future page under `/account` opts in on purpose.
 */
export const load: LayoutServerLoad = ({ locals, url }) => {
	if (!ACCOUNT_PATHS.includes(url.pathname))
		redirectIfSignedIn(locals.user, url.searchParams.get('redirectTo'));
	return {};
};
