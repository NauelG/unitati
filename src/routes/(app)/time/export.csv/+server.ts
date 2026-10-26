import { error } from '@sveltejs/kit';
import { requirePermission } from '#lib/server/auth/guards.js';
import { parseCsvSeparator, reportAll, timeEntriesCsv } from '#lib/server/time/index.js';
import { filtersFrom } from '../filters';
import type { RequestHandler } from './$types';

/**
 * The filtered list of `/time` as a CSV, for the organisation's own billing or chargeback tool (ADR 0052).
 * Always UTF-8 with a BOM; `?sep=semicolon` switches the separator for Excel in a Spanish locale.
 */
export const GET: RequestHandler = async ({ locals, url }) => {
	const user = requirePermission(locals.user, 'time.manage', url);

	const rows = await reportAll(user, filtersFrom(url.searchParams));
	if (!rows.ok) error(404, 'Not found');

	return new Response(timeEntriesCsv(rows.value, parseCsvSeparator(url.searchParams.get('sep'))), {
		headers: {
			'content-type': 'text/csv; charset=utf-8',
			'content-disposition': 'attachment; filename="time-entries.csv"',
			'cache-control': 'no-store'
		}
	});
};
