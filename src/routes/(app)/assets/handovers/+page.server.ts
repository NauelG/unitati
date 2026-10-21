import { z } from 'zod';
import { m } from '#lib/paraglide/messages.js';
import { DEFAULT_HANDOVER_STATES, HANDOVER_STATES } from '#lib/domain/handover.js';
import { can } from '#lib/server/access/permissions.js';
import {
	HANDOVER_LIST_LIMIT,
	listCategories,
	listHandovers,
	regulariseCustody
} from '#lib/server/assets/index.js';
import { requirePermission } from '#lib/server/auth/guards.js';
import { listPeople } from '#lib/server/directory/index.js';
import { fieldsOf, rejected } from '../form-data';
import type { Actions, PageServerLoad } from './$types';

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

	const [rows, people, categories] = await Promise.all([
		listHandovers(user, { states, direction: chosenDirection, personId }),
		listPeople(user.organisationId, { includeInactive: true }),
		listCategories(user.organisationId)
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
		categories: categories
			.filter((category) => category.requiresHandover)
			.map(({ id, name }) => ({ id, name })),
		canManage: can(user, 'assets.manage')
	};
};

const optionalId = z.preprocess((value) => (value === '' ? undefined : value), z.uuid().optional());

export const actions: Actions = {
	/** Handovers for custody that already exists (#281): one person, or a campaign by category. */
	regularise: async ({ locals, request }) => {
		const user = requirePermission(locals.user, 'assets.manage');
		const fields = await fieldsOf(request);
		const parsed = z
			.object({ personId: optionalId, categoryId: optionalId })
			.safeParse({ personId: fields.personId, categoryId: fields.categoryId });
		if (!parsed.success) return rejected('regularise', m.handovers_regularise_error_invalid());

		const { issued, skipped } = await regulariseCustody(user, parsed.data);
		return {
			action: 'regularise' as const,
			issued: issued.map(({ code, personName, assetCount }) => ({ code, personName, assetCount })),
			skipped: skipped.map(({ personName, reason }) => ({ personName, reason }))
		};
	}
};
