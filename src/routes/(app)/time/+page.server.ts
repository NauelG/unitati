import { error } from '@sveltejs/kit';
import { requireAnyPermission } from '#lib/server/auth/guards.js';
import { listPeople } from '#lib/server/directory/index.js';
import { redactTimeRows } from '#lib/server/links/index.js';
import { reportEntries, reportScope, listTypes } from '#lib/server/time/index.js';
import { filtersFrom, TIME_READ_PERMISSIONS } from './filters';
import type { PageServerLoad } from './$types';

/**
 * The time report (ADR 0052, #379): everybody's for `time.manage`, the viewer's
 * own ("Mi tiempo") for `time.log` alone, which the domain enforces whatever
 * person the query string names. While tracking is off the screen does not
 * exist: it answers 404 like a route the viewer cannot reach.
 */
export const load: PageServerLoad = async ({ locals, url }) => {
	const user = requireAnyPermission(locals.user, TIME_READ_PERMISSIONS, url);
	const scope = reportScope(user) ?? 'own';
	const filters = filtersFrom(url.searchParams);
	// Own-only has no person filter: dropping it keeps a stray `?person=` out of the export links.
	if (scope === 'own') delete filters.personId;
	const pageNumber = Number(url.searchParams.get('page') ?? 1);

	const report = await reportEntries(user, filters, { page: pageNumber });
	if (!report.ok) error(404, 'Not found');

	const [people, types] = await Promise.all([
		scope === 'all' ? listPeople(user.organisationId) : [],
		listTypes(user.organisationId)
	]);

	return {
		scope,
		report: { ...report.value, rows: await redactTimeRows(user, report.value.rows) },
		filters,
		people: people.map(({ id, fullName }) => ({ id, fullName })),
		types: types.map(({ id, name, archived }) => ({ id, name, archived }))
	};
};
