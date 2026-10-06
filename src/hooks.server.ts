import { sequence, type Handle } from '@sveltejs/kit/hooks';
import { building } from '$app/env';
import { svelteKitHandler } from 'better-auth/svelte-kit';
import { paraglideMiddleware } from '#lib/paraglide/server.js';
import { getAuth } from '#lib/server/auth/index.js';
import { resolveSessionUser } from '#lib/server/directory/index.js';

// `event.request` is readonly in SvelteKit 3, so the request is not swapped as
// older examples do. The middleware already binds the locale for the duration
// of this callback through AsyncLocalStorage, which is what message functions
// read; the placeholder below is only for the `lang` attribute in app.html.
const paraglideHandle: Handle = ({ event, resolve }) =>
	paraglideMiddleware(event.request, ({ locale }: { locale: string }) =>
		resolve(event, {
			transformPageChunk: ({ html }) => html.replace('%paraglide.lang%', locale)
		})
	);

/**
 * The session resolves here into `locals.user` and nowhere else; route-group
 * layouts enforce the redirects through the guards (ADR 0007). Nothing else in
 * the application reads a cookie.
 */
const authHandle: Handle = async ({ event, resolve }) => {
	if (building) {
		event.locals.user = null;
		return resolve(event);
	}

	const auth = getAuth();
	const session = await auth.api.getSession({ headers: event.request.headers });
	event.locals.user = session?.user ? await resolveSessionUser(session.user.id) : null;

	return svelteKitHandler({ event, resolve, auth, building });
};

export const handle = sequence(paraglideHandle, authHandle);
