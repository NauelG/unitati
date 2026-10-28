import { redirect } from '@sveltejs/kit';
import { getAuth } from '#lib/server/auth/index.js';
import { applyAuthCookies } from '#lib/server/auth/cookies.js';
import type { Actions } from './$types';

/**
 * POST-only: signing out through a link would let any page that embeds an image
 * end someone's session.
 */
export const actions: Actions = {
	default: async (event) => {
		const { headers } = await getAuth().api.signOut({
			headers: event.request.headers,
			returnHeaders: true
		});
		// Carries the expiry that clears the session cookie.
		applyAuthCookies(headers, event.cookies);
		// Says so and stays put: signing out must not bounce into the identity provider (ADR 0056).
		redirect(303, '/signed-out');
	}
};
