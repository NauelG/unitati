import { error } from '@sveltejs/kit';
import { TIME_READ_PERMISSIONS } from '#lib/domain/access.js';
import { requireAnyPermission } from '#lib/server/auth/guards.js';
import { redactTimeRows } from '#lib/server/links/index.js';
import { parseCsvSeparator, reportAll, timeEntriesCsv } from '#lib/server/time/index.js';
import { filtersFrom } from '../filters';
import type { RequestHandler } from './$types';

/**
 * The filtered list of `/time` as a CSV, for the organisation's own billing or chargeback tool (ADR 0052).
 * Same scope as the screen: without `time.manage`, only the viewer's own rows (#379).
 * Always UTF-8 with a BOM; `?sep=semicolon` switches the separator for Excel in a Spanish locale.
 */
export const GET: RequestHandler = async ({ locals, url }) => {
	const user = requireAnyPermission(locals.user, TIME_READ_PERMISSIONS, url);

	const rows = await reportAll(user, filtersFrom(url.searchParams));
	if (!rows.ok) error(404, 'Not found');

	return new Response(
		timeEntriesCsv(
			await redactTimeRows(user, rows.value),
			parseCsvSeparator(url.searchParams.get('sep'))
		),
		{
			headers: {
				'content-type': 'text/csv; charset=utf-8',
				'content-disposition': 'attachment; filename="time-entries.csv"',
				'cache-control': 'no-store'
			}
		}
	);
};
