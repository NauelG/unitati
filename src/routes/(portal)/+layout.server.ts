import { redirect } from '@sveltejs/kit';
import { can } from '#lib/server/access/permissions.js';
import { requirePermission, type SessionUser } from '#lib/server/auth/guards.js';
import { listSpaces } from '#lib/server/knowledge/index.js';
import { unreadCount } from '#lib/server/notifications/index.js';
import type { LayoutServerLoad } from './$types';

/**
 * The employee portal is not the staff shell (see the layout): it exists for
 * people who hold `tickets.view.own` and nothing wider. Staff already have the
 * service desk, and showing a technician the portal would hand them a thread
 * with its internal notes inside a screen built to never have any.
 */
export const load: LayoutServerLoad = async ({ locals, url }) => {
	const user = requirePermission(locals.user, 'tickets.view.own', url);
	if (can(user, 'tickets.view')) redirect(303, '/service-desk');

	return {
		user: { name: user.name, email: user.email },
		unreadNotifications: await unreadCount(user),
		canSeeHandovers: can(user, 'assets.view.own'),
		canSeeKnowledge: await hasReadableSpace(user)
	};
};

/** The link is worth showing only when there is something behind it. */
async function hasReadableSpace(user: SessionUser): Promise<boolean> {
	if (!can(user, 'knowledge.view')) return false;
	return (await listSpaces(user)).length > 0;
}
