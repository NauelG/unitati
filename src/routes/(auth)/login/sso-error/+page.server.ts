import { isSsoErrorCode } from '#lib/server/auth/sso.js';
import type { PageServerLoad } from './$types';

/**
 * Where a refused or failed SSO sign-in lands (ADR 0056). It never redirects on
 * its own: an admin has to be able to read the cause.
 */
export const load: PageServerLoad = ({ url }) => {
	const code = url.searchParams.get('error');
	return { code: isSsoErrorCode(code) ? code : null };
};
