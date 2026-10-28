import { fail, redirect } from '@sveltejs/kit';
import type { RequestEvent } from '@sveltejs/kit';
import { superValidate } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';
import { z } from 'zod';
import { APIError } from 'better-auth/api';
import { getAuth } from '#lib/server/auth/index.js';
import { applyAuthCookies } from '#lib/server/auth/cookies.js';
import { safeRedirectTarget } from '#lib/server/auth/redirect.js';
import { endSessions } from '#lib/server/auth/access.js';
import { isUserActive, needsSetup } from '#lib/server/directory/index.js';
import { m } from '#lib/paraglide/messages.js';

/**
 * Email and password sign-in, served by `/login` and by the break-glass
 * `/login/local` (ADR 0056). The rule that only admins may use a password while
 * SSO is required is not here: it sits in Better Auth's session creation, so a
 * direct call to its own endpoint is refused just the same, with the answer a
 * wrong password gets.
 */

const schema = z.object({
	email: z.email({ message: m.validation_email() }),
	password: z.string().min(1, { message: m.login_failed() }),
	redirectTo: z.string().optional()
});

export async function passwordLoginForm(url: URL) {
	// An installation with nobody in it has nothing to sign into yet.
	if (await needsSetup()) redirect(303, '/setup');
	return superValidate(
		{ redirectTo: safeRedirectTarget(url.searchParams.get('redirectTo')) },
		zod4(schema)
	);
}

export async function passwordLogin(event: RequestEvent) {
	const form = await superValidate(event, zod4(schema));
	if (!form.valid) return fail(400, { form });

	try {
		const { headers, response } = await getAuth().api.signInEmail({
			body: { email: form.data.email, password: form.data.password },
			headers: event.request.headers,
			returnHeaders: true
		});

		// Deactivation blocks sign-in (#230). Said only after the password was
		// right, so the message tells nobody which addresses exist.
		if (!(await isUserActive(response.user.id))) {
			await endSessions(response.user.id);
			return fail(400, { form, message: m.login_deactivated() });
		}
		applyAuthCookies(headers, event.cookies);
	} catch (error) {
		// Wrong password, unknown address and "SSO is required" answer identically on
		// purpose: a distinct message would turn the form into an account oracle.
		if (error instanceof APIError) return fail(400, { form, message: m.login_failed() });
		throw error;
	}

	redirect(303, safeRedirectTarget(form.data.redirectTo));
}
