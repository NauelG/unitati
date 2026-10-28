/**
 * The pieces of single sign-on that need no server: how the three environment
 * variables are read and what they are turned into (ADR 0056).
 */

/** The one provider an installation has: its id in Better Auth and in the callback path. */
export const OIDC_PROVIDER_ID = 'oidc';

export interface OidcEnvironment {
	/** Exactly as configured: the `iss` claim is compared to it, trailing slash and all. */
	issuer: string;
	clientId: string;
	clientSecret: string;
}

/**
 * All three variables or none. Set means all of them, because a half-configured
 * sign-in that quietly falls back to "off" would hide a typo from whoever made it.
 */
export function parseOidcEnvironment(values: {
	issuer: string;
	clientId: string;
	clientSecret: string;
}): OidcEnvironment | null {
	const entries = [
		['OIDC_ISSUER', values.issuer],
		['OIDC_CLIENT_ID', values.clientId],
		['OIDC_CLIENT_SECRET', values.clientSecret]
	] as const;
	const missing = entries.filter(([, value]) => value === '').map(([name]) => name);

	if (missing.length === entries.length) return null;
	if (missing.length > 0) {
		throw new Error(
			`OIDC_ISSUER, OIDC_CLIENT_ID and OIDC_CLIENT_SECRET are set all together or not at all; missing: ${missing.join(', ')}`
		);
	}
	return { issuer: values.issuer, clientId: values.clientId, clientSecret: values.clientSecret };
}

/** How an identity's provider is stored in `person_identities.provider`. */
export function oidcProviderKey(issuer: string): string {
	return `oidc:${issuer}`;
}

/** OpenID Connect Discovery appends the well-known path to the issuer without doubling the slash. */
export function oidcDiscoveryUrl(issuer: string): string {
	return `${issuer.replace(/\/+$/, '')}/.well-known/openid-configuration`;
}

/** What an admin pastes into the identity provider. */
export function oidcRedirectUri(baseUrl: string): string {
	return `${baseUrl.replace(/\/+$/, '')}/api/auth/sso/callback/${OIDC_PROVIDER_ID}`;
}

/** The query parameter that keeps `/login` from bouncing straight back to the identity provider. */
export const NO_AUTO_REDIRECT_PARAM = 'noauto';

/** `/login` as the pages that must not auto-redirect link to it (after an SSO error, after signing out). */
export const LOGIN_WITHOUT_AUTO_REDIRECT = `/login?${NO_AUTO_REDIRECT_PARAM}=1`;
