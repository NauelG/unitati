import { fail, redirect } from '@sveltejs/kit';
import { setError, superValidate } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';
import { z } from 'zod';
import { APIError } from 'better-auth/api';
import { m } from '#lib/paraglide/messages.js';
import { clearMustChangePassword } from '#lib/server/auth/access.js';
import { applyAuthCookies } from '#lib/server/auth/cookies.js';
import { requireUser } from '#lib/server/auth/guards.js';
import { getAuth, MIN_PASSWORD_LENGTH } from '#lib/server/auth/index.js';
import type { Actions, PageServerLoad } from './$types';

const schema = z
	.object({
		currentPassword: z.string().min(1, { message: m.password_wrong_current() }),
		newPassword: z.string().min(MIN_PASSWORD_LENGTH, {
			message: m.validation_password_short({ min: MIN_PASSWORD_LENGTH })
		}),
		confirmPassword: z.string()
	})
	.refine((value) => value.newPassword === value.confirmPassword, {
		path: ['confirmPassword'],
		message: m.password_mismatch()
	});

/**
 * Both the forced change after a grant or a reset and the voluntary one from
 * the user menu (#230). It lives in `(auth)` for its bare layout, and needs a
 * session: the layout lets a signed-in user through for this path only.
 */
export const load: PageServerLoad = async ({ locals }) => {
	const user = requireUser(locals.user);
	return { form: await superValidate(zod4(schema)), forced: user.mustChangePassword === true };
};

export const actions: Actions = {
	default: async (event) => {
		const user = requireUser(event.locals.user);
		const form = await superValidate(event, zod4(schema));
		if (!form.valid) return fail(400, { form });

		if (form.data.currentPassword === form.data.newPassword) {
			return setError(form, 'newPassword', m.password_same());
		}

		try {
			const { headers } = await getAuth().api.changePassword({
				body: {
					currentPassword: form.data.currentPassword,
					newPassword: form.data.newPassword,
					revokeOtherSessions: true
				},
				headers: event.request.headers,
				returnHeaders: true
			});
			// Other sessions were revoked and this one was reissued.
			applyAuthCookies(headers, event.cookies);
		} catch (error) {
			if (error instanceof APIError) {
				return setError(form, 'currentPassword', m.password_wrong_current());
			}
			throw error;
		}

		await clearMustChangePassword(user.id);
		redirect(303, '/');
	}
};
