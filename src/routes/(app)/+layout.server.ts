import { redirect } from '@sveltejs/kit';
import { requireUser } from '#lib/server/auth/guards.js';
import { permissionsFor } from '#lib/server/access/permissions.js';
import { needsSetup } from '#lib/server/directory/index.js';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ locals }) => {
	if (await needsSetup()) redirect(303, '/setup');

	const user = requireUser(locals.user);

	// Sent to the client so navigation can hide what the user cannot reach.
	// Hiding is a convenience; every route still guards itself server-side.
	return {
		user: { name: user.name, email: user.email, role: user.role },
		permissions: permissionsFor(user.role)
	};
};
