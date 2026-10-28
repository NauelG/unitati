import { OIDC_PROVIDER_ID } from '../../oidc';
import { soleOrganisationId } from '../directory';
import { getAuth } from '.';
import { ssoProviderKey } from './oidc';
import { safeRedirectTarget } from './redirect';
import { getAuthenticationSettings } from './settings';

/**
 * Starting an SSO sign-in and what the sign-in screen shows about it (ADR 0056).
 * Apart from `sso.ts`, which Better Auth's configuration imports: this file
 * imports Better Auth's instance, and the two would close a cycle.
 */

export interface SsoLoginState {
	/** Null when the button keeps its default wording. */
	label: string | null;
	required: boolean;
	autoRedirect: boolean;
}

/** What the sign-in screen shows about SSO; null when the installation has none. */
export async function ssoLoginState(): Promise<SsoLoginState | null> {
	if (!ssoProviderKey()) return null;
	const organisationId = await soleOrganisationId();
	if (!organisationId) return null;

	const settings = await getAuthenticationSettings(organisationId);
	return {
		label: settings.buttonLabel,
		required: settings.ssoRequired,
		autoRedirect: settings.autoRedirect
	};
}

/** Where a failed SSO flow lands; an error page that never redirects on its own. */
export const SSO_ERROR_PATH = '/login/sso-error';

/**
 * Starts the OIDC flow: where to send the browser, and the cookies that carry the
 * flow's state. The requested path travels through the round trip and is checked
 * against the same redirect guard as a password sign-in.
 */
export async function startSsoSignIn(
	requestHeaders: Headers,
	redirectTo: string | null
): Promise<{ url: string; headers: Headers }> {
	const { headers, response } = await getAuth().api.signInSSO({
		body: {
			providerId: OIDC_PROVIDER_ID,
			callbackURL: safeRedirectTarget(redirectTo),
			errorCallbackURL: SSO_ERROR_PATH
		},
		headers: requestHeaders,
		returnHeaders: true
	});
	return { url: response.url, headers };
}
