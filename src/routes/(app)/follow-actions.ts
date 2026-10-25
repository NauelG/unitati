import { error, fail } from '@sveltejs/kit';
import type { SessionUser } from '#lib/server/auth/guards.js';
import { follow, unfollow, type FollowTarget } from '#lib/server/notifications/index.js';

/**
 * The `?/follow` and `?/unfollow` actions of a ticket, task, project or knowledge page route
 * (#57). `resolve` reads the record through the viewer's scope, so one they
 * cannot see is a 404 and the domain only has to check the permission.
 */
export function followActions<Event extends { locals: App.Locals; params: Record<string, string> }>(
	requireViewer: (user: App.Locals['user']) => SessionUser,
	resolve: (user: SessionUser, event: Event) => Promise<FollowTarget | null>
) {
	return {
		follow: async (event: Event) => {
			const user = requireViewer(event.locals.user);
			const target = await resolve(user, event);
			if (!target) error(404, 'Not found');

			const outcome = await follow(user, target);
			if (!outcome.ok) error(403, 'Forbidden');
			return { action: 'follow' as const };
		},
		unfollow: async (event: Event) => {
			const user = requireViewer(event.locals.user);
			const target = await resolve(user, event);
			if (!target) error(404, 'Not found');

			const outcome = await unfollow(user, target);
			// Participants are not offered the button; a forged post is refused plainly.
			if (!outcome.ok) return fail(409, { action: 'unfollow' as const, error: outcome.error });
			return { action: 'unfollow' as const };
		}
	};
}
