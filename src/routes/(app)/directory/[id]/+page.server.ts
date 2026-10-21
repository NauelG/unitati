import { error } from '@sveltejs/kit';
import { z } from 'zod';
import { HANDOVER_STATES } from '#lib/domain/handover.js';
import { can } from '#lib/server/access/permissions.js';
import { listAssetsHeldBy, listHandovers } from '#lib/server/assets/index.js';
import { requirePermission } from '#lib/server/auth/guards.js';
import { listPeople } from '#lib/server/directory/index.js';
import type { PageServerLoad } from './$types';

/** One person: who they are, what they hold, and every handover in their name (#280). */
export const load: PageServerLoad = async ({ locals, params }) => {
	const user = requirePermission(locals.user, 'people.view');
	if (!z.uuid().safeParse(params.id).success) error(404, 'Not found');

	const people = await listPeople(user.organisationId, { includeInactive: true });
	const person = people.find((entry) => entry.id === params.id);
	if (!person) error(404, 'Not found');

	// Assets are a module of their own: its permission decides what shows here.
	const seesAssets = can(user, 'assets.view');
	const [handovers, held] = seesAssets
		? await Promise.all([
				listHandovers(user, { personId: person.id, states: [...HANDOVER_STATES] }),
				listAssetsHeldBy(user.organisationId, person.id)
			])
		: [null, []];

	return { person, handovers, held };
};
