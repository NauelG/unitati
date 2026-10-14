import { error } from '@sveltejs/kit';
import { PROJECT_READ_PERMISSIONS } from '#lib/domain/access.js';
import { can } from '../access/permissions';
import { requireAnyPermission, type SessionUser } from '../auth/guards';

/**
 * The route-level gates of the projects screens (ADR 0007). The domain scopes
 * rows and refuses writes without `projects.manage` by throwing, which is a
 * backstop for a programming error; these are what turns a request into the
 * right HTTP answer before it gets that far.
 */

/** Reaching a projects or tasks screen. Anybody else is answered like a missing page. */
export function requireProjectRead(user: SessionUser | null): SessionUser {
	return requireAnyPermission(user, PROJECT_READ_PERMISSIONS);
}

/**
 * Writing. A viewer who cannot read at all gets the usual 404, so the screen's
 * existence is not confirmed. One who can read — an employee on a task assigned
 * to them — already knows the record is there, and is told plainly that they may
 * not change it: 403.
 */
export function requireProjectWrite(user: SessionUser | null): SessionUser {
	const reader = requireProjectRead(user);
	if (!can(reader, 'projects.manage')) error(403, 'Forbidden');
	return reader;
}
