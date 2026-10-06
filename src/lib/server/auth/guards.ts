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
