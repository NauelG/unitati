import { BETTER_AUTH_URL, OIDC_CLIENT_ID, OIDC_CLIENT_SECRET, OIDC_ISSUER } from '$app/env/private';
import { oidcProviderKey, oidcRedirectUri, parseOidcEnvironment } from '../../oidc';

/**
 * The installation's identity provider, read from the environment (ADR 0056).
 * Only the three variables live there: everything an admin tunes is in the
 * database, and no secret ever is.
 */

let cached: ReturnType<typeof parseOidcEnvironment> | undefined;

/** Null when SSO is not configured. Throws when it is half configured. */
export function oidcConfig() {
	if (cached === undefined) {
		cached = parseOidcEnvironment({
			issuer: OIDC_ISSUER,
			clientId: OIDC_CLIENT_ID,
			clientSecret: OIDC_CLIENT_SECRET
		});
	}
	return cached;
}

export function isSsoConfigured(): boolean {
	return oidcConfig() !== null;
}

/** `oidc:<issuer>`, or null when SSO is off. */
export function ssoProviderKey(): string | null {
	const config = oidcConfig();
	return config ? oidcProviderKey(config.issuer) : null;
}

/** The URL to register at the identity provider. */
export function ssoRedirectUri(): string {
	return oidcRedirectUri(BETTER_AUTH_URL);
}
