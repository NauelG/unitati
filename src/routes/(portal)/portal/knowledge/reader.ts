import { error, redirect } from '@sveltejs/kit';
import { can } from '#lib/server/access/permissions.js';
import { requirePermission, type SessionUser } from '#lib/server/auth/guards.js';

/**
 * The guard of every portal knowledge route. The portal is the employee's
 * reading room: someone who can manage the knowledge base has the app screens,
 * and is sent there, so a staff viewer never reads through a screen that was
 * built to hold no staff-only data.
 *
 * A viewer without `knowledge.view` gets the usual 404 from `requirePermission`.
 */
export function requirePortalReader(user: SessionUser | null, url?: URL): SessionUser {
	const viewer = requirePermission(user, 'knowledge.view', url);
	if (can(viewer, 'knowledge.manage')) redirect(303, '/knowledge');
	return viewer;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A malformed id can never name a space: answer 404 before it reaches a uuid column. */
export function requireUuid(id: string): void {
	if (!UUID.test(id)) error(404, 'Not found');
}
