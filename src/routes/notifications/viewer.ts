import { error } from '@sveltejs/kit';
import type { SessionUser } from '#lib/server/auth/guards.js';

/**
 * The notification endpoints answer fetches from the bell, so an anonymous caller
 * gets a plain 401 rather than the login redirect a page would send. Any signed-in
 * user qualifies: staff and employees both have an inbox.
 */
export function requireSession(user: SessionUser | null): SessionUser {
	if (!user) error(401, 'Unauthorized');
	return user;
}
