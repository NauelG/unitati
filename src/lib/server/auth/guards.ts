import { error, redirect } from '@sveltejs/kit';
import { can, type Permission } from '../access/permissions';
import { loginPathFor, safeRedirectTarget } from './redirect';
import type { UserRole } from './schema';

/**
 * Every route is private except the `(auth)` group. These guards are the only
 * redirect logic in the application: layouts and actions call them and never
 * reimplement the checks.
 */

export interface SessionUser {
	id: string;
	name: string;
	email: string;
	role: UserRole;
	/**
	 * True until the user replaces the temporary password an admin gave them
	 * (#230); `hooks.server.ts` confines such a session to `/account/password`.
	 * Absent for an API key, which has no password to change.
	 */
	mustChangePassword?: boolean;
	/** Tenancy scope (ADR 0004). Every query is filtered by it. */
	organisationId: string;
	/** Directory record, absent only for a user with no person row. */
	personId: string | null;
	/**
	 * Present only for a service-account key (ADR 0022). Then `id` is the account's
	 * id, not a Better Auth user id, and `personId` is null: code that assumes a
	 * user must branch on this or refuse.
	 */
	serviceAccountId?: string;
	/**
	 * Present only for an API key (ADR 0022): the permissions the key was narrowed
	 * to. `can()` intersects them with the role's; a session leaves it unset.
	 */
	scopes?: readonly Permission[];
}

/**
 * `(app)` group: anonymous visitors go to the login screen. Pass the request
 * `url` from a `load` so the login returns them to the page they were going to;
 * actions omit it and redirect without a target.
 */
export function requireUser(user: SessionUser | null, url?: URL): SessionUser {
	if (!user) redirect(303, loginPathFor(url));
	return user;
}

/** `(auth)` group: authenticated users have no business on the login screen. */
export function redirectIfSignedIn(user: SessionUser | null, redirectTo?: string | null): void {
	if (user) redirect(303, safeRedirectTarget(redirectTo));
}

/**
 * Gate a capability. Call it from the layout `load` **and** from every write
 * action underneath it: a form action does not re-run its parent layout's
 * `load` before executing, so the layout guard alone does not gate a write.
 *
 * Denials are 404, not 403: confirming that a resource exists is itself a leak.
 */
export function requirePermission(
	user: SessionUser | null,
	permission: Permission,
	url?: URL
): SessionUser {
	const authenticated = requireUser(user, url);
	if (!can(authenticated, permission)) error(404, 'Not found');
	return authenticated;
}

/**
 * Gate a screen that several capabilities can reach. `/assets` is the case: a
 * technician reaches it by `assets.view`, an employee by `assets.view.own` or
 * `assets.view.shared`, and what each of them then *sees* is decided by the
 * domain, row by row.
 *
 * Any one is enough. An empty list would let everybody in, so it is rejected
 * outright: that is a call site that forgot to say what it guards.
 */
export function requireAnyPermission(
	user: SessionUser | null,
	permissions: readonly Permission[],
	url?: URL
): SessionUser {
	if (permissions.length === 0) {
		throw new Error('requireAnyPermission needs at least one permission.');
	}

	const authenticated = requireUser(user, url);
	if (!permissions.some((permission) => can(authenticated, permission))) error(404, 'Not found');
	return authenticated;
}

export const PASSWORD_CHANGE_PATH = '/account/password';

/** The public signing page of a handover, `/handover/<token>` (ADR 0035): no session needed. */
export const SIGNING_PATH_PREFIX = '/handover/';

/**
 * Paths a session with a temporary password may still reach (#230). The
 * signing page (#275) is public and ignores the session, so a person who also
 * happens to hold a temporary password can still decide their handover.
 */
const PASSWORD_CHANGE_EXEMPT = [
	PASSWORD_CHANGE_PATH,
	'/sign-out',
	'/api/auth',
	'/_app/',
	SIGNING_PATH_PREFIX
];

/**
 * Where a session must go before anything else, or null. A user holding a
 * temporary password can sign out and change it, nothing more. `/api/v1` is
 * decided by the caller: API keys are not sessions and never carry the flag.
 */
export function passwordChangeRedirect(user: SessionUser | null, pathname: string): string | null {
	if (!user?.mustChangePassword) return null;
	const exempt = PASSWORD_CHANGE_EXEMPT.some(
		(path) =>
			pathname === path ||
			(path.endsWith('/') ? pathname.startsWith(path) : pathname.startsWith(`${path}/`))
	);
	return exempt ? null : PASSWORD_CHANGE_PATH;
}
