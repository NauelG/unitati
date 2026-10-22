import { error, fail } from '@sveltejs/kit';
import { z } from 'zod';
import { HANDOVER_STATES } from '#lib/domain/handover.js';
import { listActivity } from '#lib/server/activity/index.js';
import { can } from '#lib/server/access/permissions.js';
import {
	countAssetsInCustodyOf,
	listAssetsHeldBy,
	listHandovers
} from '#lib/server/assets/index.js';
import { requirePermission } from '#lib/server/auth/guards.js';
import {
	addPersonComment,
	listDepartments,
	listLocations,
	listPeople,
	listPersonComments
} from '#lib/server/directory/index.js';
import { m } from '#lib/paraglide/messages.js';
import {
	countOpenTicketsAssignedTo,
	openTicketsRequestedBy
} from '#lib/server/service-desk/index.js';
import { locationOptions, options } from '../../assets/options';
import { takeBackAction } from '../../assets/take-back-action';
import { personActions } from '../person-actions';
import type { Actions, PageServerLoad } from './$types';

/** How many open tickets the person's page lists before "Ver todos". */
const REQUESTED_TICKETS = 5;

/**
 * One person: who they are, what they hold, the tickets they opened, every
 * handover in their name and what has happened to them (#280, #298).
 */
export const load: PageServerLoad = async ({ locals, params, url }) => {
	const user = requirePermission(locals.user, 'people.view');
	if (!z.uuid().safeParse(params.id).success) error(404, 'Not found');

	const people = await listPeople(user.organisationId, { includeInactive: true });
	const person = people.find((entry) => entry.id === params.id);
	if (!person) error(404, 'Not found');

	const canManagePeople = can(user, 'people.manage');
	const canEditPeople = can(user, 'people.edit');
	const canCheckout = can(user, 'assets.checkout');

	// Assets are a module of their own: its permission decides what shows here.
	const seesAssets = can(user, 'assets.view');
	const seesTickets = can(user, 'tickets.view');
	const [handovers, held, tickets, activity, comments, locations, departments] = await Promise.all([
		seesAssets ? listHandovers(user, { personId: person.id, states: [...HANDOVER_STATES] }) : null,
		seesAssets || canCheckout ? listAssetsHeldBy(user.organisationId, person.id) : [],
		seesTickets ? openTicketsRequestedBy(user, person.id, REQUESTED_TICKETS) : null,
		listActivity({ organisationId: user.organisationId, target: { personId: person.id } }),
		listPersonComments(user.organisationId, person.id),
		// The pickers feed a form only a person who can edit people sees.
		canEditPeople ? listLocations(user.organisationId) : [],
		canEditPeople ? listDepartments(user.organisationId) : []
	]);

	// The menu does not offer these; the actions refuse them too (#230).
	const activeAdmins = people.filter((entry) => entry.active && entry.role === 'admin');

	// `?deactivate=1` opens the confirmation with what the person still holds.
	const deactivating =
		canManagePeople && url.searchParams.get('deactivate') === '1'
			? {
					id: person.id,
					fullName: person.fullName,
					assets: await countAssetsInCustodyOf(user.organisationId, person.id),
					tickets: await countOpenTicketsAssignedTo(user.organisationId, person.id)
				}
			: null;

	return {
		person,
		handovers,
		held,
		tickets,
		timeline: activity.map((entry) => ({
			kind: 'activity' as const,
			id: entry.id,
			at: entry.occurredAt,
			entry
		})),
		comments,
		canManagePeople,
		canEditPeople,
		canCheckout,
		selfPersonId: user.personId,
		lastAdminId: activeAdmins.length === 1 ? activeAdmins[0].id : null,
		openTakeBack: canCheckout && held.length > 0 && url.searchParams.get('takeBack') === '1',
		deactivating,
		locations: locationOptions(locations),
		departments: options(departments, (department) => department.name)
	};
};

const commentFailures = {
	empty_comment: m.action_error_empty_note,
	comment_too_long: m.action_error_comment_too_long
} as const;

export const actions: Actions = {
	...personActions,
	addComment: async ({ locals, request, params }) => {
		const actor = requirePermission(locals.user, 'people.edit');
		const data = await request.formData();
		const text = data.get('text');
		const outcome = await addPersonComment(actor, params.id, typeof text === 'string' ? text : '');
		if (!outcome.ok) {
			if (outcome.error === 'not_found') error(404, 'Not found');
			return fail(400, {
				action: 'addComment' as const,
				message: commentFailures[outcome.error]()
			});
		}
		return { action: 'addComment' as const };
	},
	takeBack: async ({ locals, request }) => {
		const actor = requirePermission(locals.user, 'assets.checkout');
		return takeBackAction(actor, await request.formData());
	}
};
