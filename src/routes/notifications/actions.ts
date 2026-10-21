import { fail, redirect } from '@sveltejs/kit';
import { z } from 'zod';
import { requireUser, type SessionUser } from '#lib/server/auth/guards.js';
import { safeRedirectTarget } from '#lib/server/auth/redirect.js';
import {
	INBOX_PAGE_SIZE,
	listInbox,
	markAllRead,
	markRead,
	unfollowFromNotification
} from '#lib/server/notifications/index.js';

/**
 * The inbox page in the app and the one in the portal are the same screen under
 * two layouts, so what they load and do lives here once. Each route's own
 * `+page.server.ts` only re-exports it, because SvelteKit resolves `load` and
 * `actions` per route file.
 */
export async function loadInbox(user: SessionUser, url: URL) {
	const unreadOnly = url.searchParams.get('unread') === '1';
	return { unreadOnly, ...(await listInbox(user, { unreadOnly, limit: INBOX_PAGE_SIZE })) };
}

const readForm = z.object({ id: z.uuid(), href: z.string().optional() });

export const inboxActions = {
	/** Marks one read and goes where it points. */
	read: async ({ locals, request }: { locals: App.Locals; request: Request }) => {
		const user = requireUser(locals.user);
		const parsed = readForm.safeParse(Object.fromEntries(await request.formData()));
		if (!parsed.success) return fail(400, { error: 'invalid' });

		const outcome = await markRead(user, parsed.data.id);
		if (!outcome.ok) return fail(404, { error: 'not_found' });

		// The target comes back from the browser, so it is only followed when it is a
		// local path; anything else lands on the inbox.
		redirect(303, parsed.data.href ? safeRedirectTarget(parsed.data.href) : '.');
	},

	/** Stops following the record a `followed.activity` notification was about. */
	unfollow: async ({ locals, request }: { locals: App.Locals; request: Request }) => {
		const user = requireUser(locals.user);
		const parsed = z
			.object({ id: z.uuid() })
			.safeParse(Object.fromEntries(await request.formData()));
		if (!parsed.success) return fail(400, { error: 'invalid' });

		const outcome = await unfollowFromNotification(user, parsed.data.id);
		if (!outcome.ok)
			return fail(outcome.error === 'not_found' ? 404 : 409, { error: outcome.error });
		return { ok: true };
	},

	readAll: async ({ locals }: { locals: App.Locals }) => {
		await markAllRead(requireUser(locals.user));
		return { ok: true };
	}
};
