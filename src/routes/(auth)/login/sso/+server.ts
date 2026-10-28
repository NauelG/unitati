import { redirect } from '@sveltejs/kit';
import { applyAuthCookies } from '#lib/server/auth/cookies.js';
import { isSsoConfigured } from '#lib/server/auth/oidc.js';
import { SSO_ERROR_PATH, startSsoSignIn } from '#lib/server/auth/sso-login.js';
import type { RequestHandler } from './$types';

/**
 * Starts the OIDC flow (ADR 0056): the redirect to the identity provider, with
 * the flow's state in cookies. A GET, because it only redirects; the callback
 * and the session are Better Auth's.
 */
export const GET: RequestHandler = async ({ request, url, cookies }) => {
	if (!isSsoConfigured()) redirect(303, '/login');

	let target: string;
	try {
		const { url: authorizeUrl, headers } = await startSsoSignIn(
			request.headers,
			url.searchParams.get('redirectTo')
		);
		applyAuthCookies(headers, cookies);
		target = authorizeUrl;
	} catch (error) {
		// Discovery failed or the provider is down: say so on a page that stays put.
		console.error('could not start the SSO sign-in', error);
		redirect(303, `${SSO_ERROR_PATH}?error=sso_unavailable`);
	}
	// `redirect()` refuses an external location in SvelteKit 3, and the identity
	// provider is one. The flow's cookies set above are still sent with this response.
	return new Response(null, { status: 303, headers: { location: target } });
};
