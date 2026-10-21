import { fail } from '@sveltejs/kit';
import { z } from 'zod';
import { requireUser } from '#lib/server/auth/guards.js';
import {
	emailConfigured,
	getPreferences,
	NOTIFICATION_CHANNELS,
	NOTIFICATION_TYPES,
	setPreference
} from '#lib/server/notifications/index.js';
import type { Actions, PageServerLoad } from './$types';

/**
 * What reaches me, and how (#302). A personal page beside `/account/password`,
 * reachable from the app and from the portal, so it lives in `(auth)` for its
 * bare layout and needs a session.
 */
export const load: PageServerLoad = async ({ locals, url }) => {
	const user = requireUser(locals.user, url);
	return { preferences: await getPreferences(user), emailConfigured: emailConfigured() };
};

const setForm = z.object({
	type: z.enum(NOTIFICATION_TYPES),
	channel: z.enum(NOTIFICATION_CHANNELS),
	enabled: z.enum(['true', 'false']).transform((value) => value === 'true')
});

export const actions: Actions = {
	/** One switch: the form posts the value it should take. */
	set: async ({ locals, request }) => {
		const user = requireUser(locals.user);
		const parsed = setForm.safeParse(Object.fromEntries(await request.formData()));
		if (!parsed.success) return fail(400, { error: 'invalid' as const });

		const { type, channel, enabled } = parsed.data;
		const outcome = await setPreference(user, type, channel, enabled);
		if (!outcome.ok) return fail(outcome.error === 'locked' ? 409 : 404, { error: outcome.error });
		return { ok: true };
	}
};
