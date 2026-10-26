import { redirect } from '@sveltejs/kit';
import { requireUser } from '#lib/server/auth/guards.js';
import { permissionsOf } from '#lib/server/access/permissions.js';
import {
	ASSET_READ_PERMISSIONS,
	PROJECT_READ_PERMISSIONS,
	TICKET_READ_PERMISSIONS,
	TIME_READ_PERMISSIONS
} from '#lib/domain/access.js';
import { needsSetup, countPeople } from '#lib/server/directory/index.js';
import { countActive } from '#lib/server/assets/index.js';
import { countOpen } from '#lib/server/service-desk/index.js';
import { unreadCount } from '#lib/server/notifications/index.js';
import { countActiveProjects, countOpenTasks } from '#lib/server/projects/index.js';
import { visibleRunningTimer } from '#lib/server/links/index.js';
import { isTimeTrackingEnabled, timerPayload } from '#lib/server/time/index.js';
import type { Permission } from '#lib/server/access/permissions.js';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ locals, url }) => {
	if (await needsSetup()) redirect(303, '/setup');

	const user = requireUser(locals.user, url);
	const permissions = permissionsOf(user);
	const hasAnyPermission = (list: readonly Permission[]) =>
		list.some((permission) => permissions.includes(permission));

	/**
	 * One query per domain module (ADR 0002: routes never query the database,
	 * and neither does this layout — each count comes from its own domain's
	 * public index). Resolved in parallel since none depends on another.
	 *
	 * Each count only runs for a module the viewer can actually see; a user
	 * without the matching permission gets `undefined`, and `AppShell` already
	 * hides the link, so an absent count never shows beside a link that isn't
	 * there.
	 */
	const seesProjects = hasAnyPermission(PROJECT_READ_PERMISSIONS);
	const [assets, serviceDesk, directory, projects, tasks, unreadNotifications, timer] =
		await Promise.all([
			hasAnyPermission(ASSET_READ_PERMISSIONS) ? countActive(user.organisationId) : undefined,
			hasAnyPermission(TICKET_READ_PERMISSIONS) ? countOpen(user.organisationId) : undefined,
			permissions.includes('people.view') ? countPeople(user.organisationId) : undefined,
			seesProjects ? countActiveProjects(user) : undefined,
			seesProjects ? countOpenTasks(user) : undefined,
			unreadCount(user),
			visibleRunningTimer(user)
		]);

	// The `/time` link exists only for whoever may open it, and while tracking is on (ADR 0052):
	// everybody's time with `time.manage`, one's own with `time.log` (#379).
	const timeEnabled =
		hasAnyPermission(TIME_READ_PERMISSIONS) && (await isTimeTrackingEnabled(user.organisationId));

	// Sent to the client so navigation can hide what the user cannot reach.
	// Hiding is a convenience; every route still guards itself server-side.
	return {
		user: { name: user.name, email: user.email, role: user.role, personId: user.personId },
		permissions,
		unreadNotifications,
		counts: { assets, serviceDesk, directory, projects, tasks },
		timeEnabled,
		timer: timerPayload(timer)
	};
};
