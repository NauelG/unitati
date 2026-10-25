import { error } from '@sveltejs/kit';
import { requirePermission } from '#lib/server/auth/guards.js';
import { listPeople } from '#lib/server/directory/index.js';
import { reportEntries, listTypes } from '#lib/server/time/index.js';
import { filtersFrom } from './filters';
import type { PageServerLoad } from './$types';

/**
 * Everybody's time (ADR 0052), `time.manage` only. While tracking is off the
 * screen does not exist: it answers 404 like a route the viewer cannot reach.
 */
export const load: PageServerLoad = async ({ locals, url }) => {
	const user = requirePermission(locals.user, 'time.manage', url);
	const filters = filtersFrom(url.searchParams);
	const pageNumber = Number(url.searchParams.get('page') ?? 1);

	const report = await reportEntries(user, filters, { page: pageNumber });
	if (!report.ok) error(404, 'Not found');

	const [people, types] = await Promise.all([
		listPeople(user.organisationId),
		listTypes(user.organisationId)
	]);

	return {
		report: report.value,
		filters,
		people: people.map(({ id, fullName }) => ({ id, fullName })),
		types: types.map(({ id, name, archived }) => ({ id, name, archived }))
	};
};
