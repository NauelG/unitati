import { json } from '@sveltejs/kit';
import { statusLabel } from '#lib/components/unitati/status.js';
import { requirePermission } from '#lib/server/auth/guards.js';
import { listTicketChoices } from '#lib/server/service-desk/index.js';
import type { RequestHandler } from './$types';

/**
 * The ticket search behind "Vincular ticket" on the asset record (#168),
 * answered in the `{ value, label }` shape `SearchSelectField` reads. Every
 * status is offered, so the status is part of the label: a closed ticket is
 * never mistaken for an open one.
 */
export const GET: RequestHandler = async ({ locals, url }) => {
	const user = requirePermission(locals.user, 'tickets.manage');
	const choices = await listTicketChoices(user, { search: url.searchParams.get('q') ?? '' });

	return json(
		choices.map((choice) => ({
			value: choice.id,
			label: `${choice.ticketTag} · ${choice.subject} · ${statusLabel(choice.status)}`
		}))
	);
};
