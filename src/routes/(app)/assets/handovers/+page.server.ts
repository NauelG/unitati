import { z } from 'zod';
import { DEFAULT_HANDOVER_STATES, HANDOVER_STATES } from '#lib/domain/handover.js';
import { can } from '#lib/server/access/permissions.js';
import { HANDOVER_LIST_LIMIT, listHandovers } from '#lib/server/assets/index.js';
import { requirePermission } from '#lib/server/auth/guards.js';
import { listPeople } from '#lib/server/directory/index.js';
import type { PageServerLoad } from './$types';

const direction = z.enum(['delivery', 'return']);

/** The handover list: what still needs a person (ADR 0035, decision 3). The URL is the filter. */
export const load: PageServerLoad = async ({ locals, url }) => {
	const user = requirePermission(locals.user, 'assets.view');

	const states = url.searchParams
		.getAll('state')
		.filter((state): state is (typeof HANDOVER_STATES)[number] =>
			(HANDOVER_STATES as readonly string[]).includes(state)
		);
	const chosenDirection = direction.safeParse(url.searchParams.get('direction')).data;
	const personId = z.uuid().safeParse(url.searchParams.get('person')).data;

	const [rows, people] = await Promise.all([
		listHandovers(user, { states, direction: chosenDirection, personId }),
		listPeople(user.organisationId, { includeInactive: true })
	]);

	return {
		rows,
		limit: HANDOVER_LIST_LIMIT,
		// Sent back so the form shows what the list used, including the default.
		states: states.length > 0 ? states : [...DEFAULT_HANDOVER_STATES],
		filtered: states.length > 0 || chosenDirection !== undefined || personId !== undefined,
		direction: chosenDirection ?? '',
		personId: personId ?? '',
		people: people.map(({ id, fullName }) => ({ id, fullName })),
		canManage: can(user, 'assets.manage')
	};
};
