import { authenticateApiKey, type ApiPrincipal, type AuthenticateFailure } from './keys';

/** The one place that says which URLs belong to the API. */
export function isApiPath(pathname: string): boolean {
	return pathname === '/api/v1' || pathname.startsWith('/api/v1/');
}

/** Why a request has no principal; `missing` is a request with no usable header at all. */
export type ApiAuthFailure = 'missing' | AuthenticateFailure;

/** What the hook records beside `locals.user`, so the endpoint can answer 401. */
export type ApiAuthState = { ok: true; keyId: string } | { ok: false; reason: ApiAuthFailure };

const BEARER = /^Bearer +(\S+)$/i;

/**
 * Resolves a request to the API key behind it. Only the `Authorization` header
 * is read: the session cookie is never consulted on `/api/v1`, so a browser
 * session does not reach the API (ADR 0022).
 */
export async function authenticateRequest(
	request: Request
): Promise<{ user: ApiPrincipal | null; api: ApiAuthState }> {
	const token = BEARER.exec(request.headers.get('authorization') ?? '')?.[1];
	if (!token) return { user: null, api: { ok: false, reason: 'missing' } };

	const outcome = await authenticateApiKey(token);
	if (!outcome.ok) return { user: null, api: { ok: false, reason: outcome.error } };

	return { user: outcome.value, api: { ok: true, keyId: outcome.value.keyId } };
}
