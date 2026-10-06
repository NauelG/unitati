import { fail, redirect } from '@sveltejs/kit';
import { superValidate } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';
import { z } from 'zod';
import { APIError } from 'better-auth/api';
import { getAuth } from '#lib/server/auth/index.js';
import { applyAuthCookies } from '#lib/server/auth/cookies.js';
import { needsSetup } from '#lib/server/directory/index.js';
import { m } from '#lib/paraglide/messages.js';
import type { Actions, PageServerLoad } from './$types';

const schema = z.object({
	email: z.email({ message: m.validation_email() }),
	password: z.string().min(1, { message: m.login_failed() })
});

export const load: PageServerLoad = async () => {
	// An installation with nobody in it has nothing to sign into yet.
	if (await needsSetup()) redirect(303, '/setup');
	return { form: await superValidate(zod4(schema)) };
};

export const actions: Actions = {
	default: async (event) => {
		const form = await superValidate(event, zod4(schema));
		if (!form.valid) return fail(400, { form });

		try {
			const { headers } = await getAuth().api.signInEmail({
				body: { email: form.data.email, password: form.data.password },
				headers: event.request.headers,
				returnHeaders: true
			});
			applyAuthCookies(headers, event.cookies);
		} catch (error) {
			// Wrong password and unknown address answer identically on purpose:
			// a distinct message would turn the form into an account oracle.
			if (error instanceof APIError) return fail(400, { form, message: m.login_failed() });
			throw error;
		}

		redirect(303, '/');
	}
};
