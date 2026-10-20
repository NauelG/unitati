import { sequence, type Handle } from '@sveltejs/kit/hooks';
import { building } from '$app/env';
import { svelteKitHandler } from 'better-auth/svelte-kit';
import { legacyCatalogueRedirect } from '#lib/settings/legacy-redirects.js';
import { paraglideMiddleware } from '#lib/paraglide/server.js';
import { authenticateRequest, isApiPath } from '#lib/server/api/index.js';
import { passwordChangeRedirect } from '#lib/server/auth/guards.js';
import { getAuth } from '#lib/server/auth/index.js';
import { closeDb } from '#lib/server/db/index.js';
import { resolveSessionUser } from '#lib/server/directory/index.js';
import { registerSubscriptions } from '#lib/server/subscriptions.js';

/**
 * `adapter-node` emits this once the HTTP server has stopped accepting and has
 * drained. It is the seam the adapter provides for an app to release what it
 * owns, and the database pool is the only thing this app owns that outlives a
 * request. Without it the process ignores `SIGTERM` entirely — the pool's
 * sockets keep the event loop alive, so Node never exits and the supervisor
 * eventually resorts to `SIGKILL`.
 *
 * Guarded on `building` because SvelteKit runs the app to analyse it during a
 * build, and a build has no pool to close and no signal to handle.
 *
 * The rejection is caught rather than left floating: an unhandled one would
 * take the process down with a stack trace that says nothing about shutdown.
 */
if (!building) {
	process.on('sveltekit:shutdown', () => {
		closeDb().catch((error: unknown) => console.error('could not close the database pool', error));
	});
}

/**
 * The one place domain events get their listeners (ADR 0024). Not at build:
 * analysing the app sends no mail and has no database.
 */
if (!building) registerSubscriptions();

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
 * The session resolves here into `locals.user` and nowhere else (an API key
 * resolves into the same slot, but only on `/api/v1`); route-group
 * layouts enforce the redirects through the guards (ADR 0007). Nothing else in
 * the application reads a cookie.
 */
const authHandle: Handle = async ({ event, resolve }) => {
	if (building) {
		event.locals.user = null;
		return resolve(event);
	}

	// `/api/v1` accepts bearer keys and nothing else (ADR 0022): the session
	// cookie is never read there, and a key is never read anywhere else.
	if (isApiPath(event.url.pathname)) {
		const { user, api } = await authenticateRequest(event.request);
		event.locals.user = user;
		event.locals.api = api;
		return resolve(event);
	}

	const auth = getAuth();
	const session = await auth.api.getSession({ headers: event.request.headers });
	event.locals.user = session?.user ? await resolveSessionUser(session.user.id) : null;

	// A temporary password confines the session to changing it (#230). The public
	// handover signing page is exempt (#275); no layout signs anyone in for it.
	const confined = passwordChangeRedirect(event.locals.user, event.url.pathname);
	if (confined) {
		return new Response(null, { status: 303, headers: { location: confined } });
	}

	return svelteKitHandler({ event, resolve, auth, building });
};

/** Catalogues that moved under `/settings` (#126): a 308 before anything else runs, so no session is needed. */
const legacyRedirectHandle: Handle = ({ event, resolve }) => {
	const target = legacyCatalogueRedirect(event.url);
	if (target) return new Response(null, { status: 308, headers: { location: target } });
	return resolve(event);
};

export const handle = sequence(legacyRedirectHandle, paraglideHandle, authHandle);
