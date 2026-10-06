import { fail, redirect } from '@sveltejs/kit';
import { superValidate } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';
import { z } from 'zod';
import { APIError } from 'better-auth/api';
import { getAuth, MIN_PASSWORD_LENGTH } from '#lib/server/auth/index.js';
import { applyAuthCookies } from '#lib/server/auth/cookies.js';
import { provisionFirstAdmin } from '#lib/server/auth/provision.js';
import { needsSetup } from '#lib/server/directory/index.js';
import { m } from '#lib/paraglide/messages.js';
import type { Actions, PageServerLoad } from './$types';

const schema = z.object({
	organisation: z.string().min(1, { message: m.validation_name_required() }),
	name: z.string().min(1, { message: m.validation_name_required() }),
	email: z.email({ message: m.validation_email() }),
	password: z.string().min(MIN_PASSWORD_LENGTH, {
		message: m.validation_password_short({ min: MIN_PASSWORD_LENGTH })
	})
});

export const load: PageServerLoad = async () => {
	if (!(await needsSetup())) redirect(303, '/login');
	return { form: await superValidate(zod4(schema)) };
};

export const actions: Actions = {
	default: async (event) => {
		const form = await superValidate(event, zod4(schema));
		if (!form.valid) return fail(400, { form });

		// Checked before creating a credential; `provisionFirstAdmin` checks again
		// inside its transaction, which is the one that decides a race.
		if (!(await needsSetup())) return fail(409, { form, message: m.setup_taken() });

		let userId: string;
		try {
			const { headers, response } = await getAuth().api.signUpEmail({
				body: {
					name: form.data.name,
					email: form.data.email,
					password: form.data.password
				},
				headers: event.request.headers,
				returnHeaders: true
			});
			applyAuthCookies(headers, event.cookies);
			userId = response.user.id;
		} catch (error) {
			if (error instanceof APIError) return fail(400, { form, message: m.setup_failed() });
			throw error;
		}

		const outcome = await provisionFirstAdmin(userId, form.data.organisation);
		if (!outcome.ok) {
			return fail(outcome.error === 'already-set-up' ? 409 : 500, {
				form,
				message: outcome.error === 'already-set-up' ? m.setup_taken() : m.setup_failed()
			});
		}

		redirect(303, '/');
	}
};
