import { z } from 'zod';
import type { ReportFilters } from '#lib/server/time/index.js';

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
