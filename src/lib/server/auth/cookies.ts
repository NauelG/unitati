import type { Cookies } from '@sveltejs/kit';

/**
 * Better Auth answers with `Set-Cookie` headers, but a form action never returns
 * that response: SvelteKit builds its own. Without copying them across, a
 * successful sign-in sets no session and the next request is anonymous again.
 */
export function applyAuthCookies(headers: Headers, cookies: Cookies): void {
	for (const raw of headers.getSetCookie()) {
		const [pair, ...attributes] = raw.split(';');
		const separator = pair.indexOf('=');
		if (separator === -1) continue;

		const name = pair.slice(0, separator).trim();
		const value = pair.slice(separator + 1).trim();

		// `path` is required by SvelteKit's typing and Better Auth always sends it;
		// the fallback only guards a malformed header.
		const options: Parameters<Cookies['set']>[2] = { path: '/' };

		for (const attribute of attributes) {
			const index = attribute.indexOf('=');
			const key = (index === -1 ? attribute : attribute.slice(0, index)).trim().toLowerCase();
			const attributeValue = index === -1 ? '' : attribute.slice(index + 1).trim();

			switch (key) {
				case 'path':
					options.path = attributeValue;
					break;
				case 'domain':
					options.domain = attributeValue;
					break;
				case 'max-age':
					options.maxAge = Number(attributeValue);
					break;
				case 'expires':
					options.expires = new Date(attributeValue);
					break;
				case 'httponly':
					options.httpOnly = true;
					break;
				case 'secure':
					options.secure = true;
					break;
				case 'samesite':
					options.sameSite = attributeValue.toLowerCase() as 'lax' | 'strict' | 'none';
					break;
			}
		}

		cookies.set(name, decodeURIComponent(value), options);
	}
}
