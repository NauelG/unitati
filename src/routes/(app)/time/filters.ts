import { z } from 'zod';
import type { Permission } from '#lib/server/access/permissions.js';
import type { ReportFilters } from '#lib/server/time/index.js';

/**
 * Who opens `/time` and its export: `time.log` for one's own time,
 * `time.manage` for everybody's. The domain decides which of the two a viewer
 * gets (`reportScope`); the route only keeps everybody else out.
 */
export const TIME_READ_PERMISSIONS = ['time.log', 'time.manage'] as const satisfies Permission[];

/** The `/time` query string, read the same way by the screen and by the CSV export. */
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export function filtersFrom(params: URLSearchParams): ReportFilters {
	const read = <T extends z.ZodType>(key: string, schema: T): z.output<T> | undefined =>
		schema.safeParse(params.get(key) || undefined).data;
	const tag = z.string().trim().min(1).max(40);

	return {
		from: read('from', day),
		to: read('to', day),
		personId: read('person', z.uuid()),
		typeId: read('type', z.uuid()),
		projectTag: read('project', tag),
		recordTag: read('record', tag),
		kind: read('kind', z.enum(['ticket', 'task']))
	};
}
