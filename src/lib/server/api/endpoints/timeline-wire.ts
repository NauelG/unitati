import { z } from 'zod';
import type { TimelineEntry } from '../../activity';
import type { AssetTimelineItem } from '../../links';
import { named } from '../shared-schemas';

/**
 * One event of a record's history, as every timeline endpoint (assets, tasks,
 * projects) puts it on the wire. Declared once so the three cannot drift.
 */

const actorRef = z.object({
	kind: z.enum(['person', 'service_account']),
	id: z.string(),
	name: z.string()
});

export const timelineEntrySchema = named(
	'TimelineEntry',
	z.object({
		id: z.string(),
		verb: z.string(),
		/** A snapshot of the fact as it was when it happened (ADR 0009). */
		payload: z.record(z.string(), z.unknown()),
		actor: actorRef.nullable(),
		at: z.iso.datetime()
	})
);

/**
 * Tasks and projects are addressed by their code (ADR 0010); their ids are
 * internal and a snapshot may carry them (`task.project.changed`). The tag and
 * name beside them say the same thing, so the ids are left out.
 */
const INTERNAL_IDS: ReadonlySet<string> = new Set([
	'taskId',
	'projectId',
	'fromProjectId',
	'toProjectId'
]);

function withoutInternalIds(payload: object): Record<string, unknown> {
	return Object.fromEntries(Object.entries(payload).filter(([key]) => !INTERNAL_IDS.has(key)));
}

export function entryToWire(entry: TimelineEntry): z.input<typeof timelineEntrySchema> {
	const name = entry.actorName ?? '';
	const actor =
		entry.actorServiceAccountId !== null
			? { kind: 'service_account' as const, id: entry.actorServiceAccountId, name }
			: entry.actorPersonId === null
				? null
				: { kind: 'person' as const, id: entry.actorPersonId, name };

	return {
		id: entry.id,
		verb: entry.verb,
		payload: withoutInternalIds(entry.payload),
		actor,
		at: entry.occurredAt.toISOString()
	};
}

/** The activity half of a task's or project's merged timeline; its tickets are read from their own endpoints. */
export function timelineToWire(items: readonly AssetTimelineItem[]) {
	return items.flatMap((item) => (item.kind === 'activity' ? [entryToWire(item.entry)] : []));
}
