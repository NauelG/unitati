import { error, redirect } from '@sveltejs/kit';
import { can, type Permission } from '../access/permissions';
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
	/** Tenancy scope (ADR 0004). Every query is filtered by it. */
	organisationId: string;
	/** Directory record, absent only for a user with no person row. */
	personId: string | null;
}

/** `(app)` group: anonymous visitors go to the login screen. */
export function requireUser(user: SessionUser | null): SessionUser {
	if (!user) redirect(303, '/login');
	return user;
}

/** `(auth)` group: authenticated users have no business on the login screen. */
export function redirectIfSignedIn(user: SessionUser | null): void {
	if (user) redirect(303, '/');
}

/**
 * Gate a capability. Call it from the layout `load` **and** from every write
 * action underneath it: a form action does not re-run its parent layout's
 * `load` before executing, so the layout guard alone does not gate a write.
 *
 * Denials are 404, not 403: confirming that a resource exists is itself a leak.
 */
export function requirePermission(user: SessionUser | null, permission: Permission): SessionUser {
	const authenticated = requireUser(user);
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
	permissions: readonly Permission[]
): SessionUser {
	if (permissions.length === 0) {
		throw new Error('requireAnyPermission needs at least one permission.');
	}

	const authenticated = requireUser(user);
	if (!permissions.some((permission) => can(authenticated, permission))) error(404, 'Not found');
	return authenticated;
}
