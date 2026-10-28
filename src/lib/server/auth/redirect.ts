const FALLBACK = '/';
const PLACEHOLDER_ORIGIN = 'http://unitati.invalid';
const LOOP_PATHS = ['/login', '/setup', '/sign-out', '/signed-out'];

/**
 * Where to go after signing in. Only a same-origin relative path survives: the
 * value comes from the query string, so anything else is an open redirect.
 * Falls back to `/`.
 */
export function safeRedirectTarget(value: string | null | undefined): string {
	if (!value) return FALLBACK;
	if (!value.startsWith('/') || value.startsWith('//') || value.startsWith('/\\')) return FALLBACK;
	// eslint-disable-next-line no-control-regex
	if (/[\\\u0000-\u001f\u007f]/.test(value)) return FALLBACK;

	let resolved: URL;
	try {
		resolved = new URL(value, PLACEHOLDER_ORIGIN);
	} catch {
		return FALLBACK;
	}
	if (resolved.origin !== PLACEHOLDER_ORIGIN) return FALLBACK;
	if (
		LOOP_PATHS.some(
			(path) => resolved.pathname === path || resolved.pathname.startsWith(`${path}/`)
		)
	)
		return FALLBACK;

	return value;
}

/** `/login?redirectTo=…` for the page the visitor was trying to reach. */
export function loginPathFor(url?: URL): string {
	if (!url) return '/login';
	const target = safeRedirectTarget(url.pathname + url.search);
	return target === FALLBACK ? '/login' : `/login?redirectTo=${encodeURIComponent(target)}`;
}
