import { redirect } from '@sveltejs/kit';
import { NO_AUTO_REDIRECT_PARAM } from '#lib/oidc.js';
import { ssoLoginState } from '#lib/server/auth/sso-login.js';
import { passwordLogin, passwordLoginForm } from './password';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ url }) => {
	const form = await passwordLoginForm(url);
	const sso = await ssoLoginState();
	const redirectTo = url.searchParams.get('redirectTo');
	const ssoHref = `/login/sso${redirectTo ? `?redirectTo=${encodeURIComponent(redirectTo)}` : ''}`;

	// Straight to the IdP, except when the visitor came from an SSO error or from
	// signing out: bouncing them back would loop them (ADR 0056).
	if (sso?.required && sso.autoRedirect && !url.searchParams.has(NO_AUTO_REDIRECT_PARAM)) {
		redirect(303, ssoHref);
	}

	return { form, sso, ssoHref };
};

export const actions: Actions = { default: passwordLogin };
