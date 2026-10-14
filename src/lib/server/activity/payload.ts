import { z } from 'zod';
import { ASSET_STATES, PRIORITIES, TICKET_STATUSES } from '#lib/domain/status.js';
import type { ActivityVerb } from './verbs';

/**
 * What turns a `jsonb` column into a contract (ADR 0009).
 *
 * The union is keyed on `verb`, so adding a verb to the enum without adding its
 * payload shape here fails to compile: `PAYLOAD_SCHEMAS` is typed as a record
 * over every `ActivityVerb`, and TypeScript reports the missing key.
 *
 * **Identifiers and snapshots, both.** An entry recording a custody change
 * stores `toPersonId` *and* the person's name as it was. The identifier is for
 * linking; the snapshot is the fact. Storing only the id would make the history
 * rewrite itself on every rename, and a record of the past that changes is not
 * an audit trail.
 */

// The vocabulary comes from the one place that owns it, so a state the asset
// domain accepts and a state this validates cannot drift apart.
const assetState = z.enum(ASSET_STATES);
const ticketStatus = z.enum(TICKET_STATUSES);
const ticketPriority = z.enum(PRIORITIES);

/** A name that is present is a real name; a name that is absent is `null`. */
const presentName = z.string().min(1);

/** A calendar date (`YYYY-MM-DD`), as the `date` columns hold it: no time, no zone. */
const isoDate = z.iso.date();

/** The id for the link, the tag and name as they read when it was made or undone. */
const linkedAsset = z.object({
	assetId: z.uuid(),
	assetTag: presentName,
	assetName: presentName
});

/**
 * The compile-time gate is the `satisfies` below: a verb added to
 * `ACTIVITY_VERBS` without an entry here is a missing property, reported on
 * this object. It is not widened on export — widening to
 * `Record<ActivityVerb, z.ZodType>` would make every `.parse()` return
 * `unknown` and quietly undo the thing this file exists for.
 */
export const PAYLOAD_SCHEMAS = {
	'asset.created': z.object({
		assetTag: presentName,
		name: presentName
	}),

	'custody.assigned': z.object({
		toPersonId: z.uuid(),
		toPersonName: presentName
	}),

	'custody.returned': z.object({
		fromPersonId: z.uuid(),
		fromPersonName: presentName
	}),

	'state.changed': z.object({
		from: assetState,
		to: assetState
	}),

	// Both ends nullable: an asset can arrive from nowhere, and come off a
	// location without being given another.
	'location.changed': z.object({
		fromLocationId: z.uuid().nullable(),
		fromLocationName: presentName.nullable(),
		toLocationId: z.uuid().nullable(),
		toLocationName: presentName.nullable()
	}),

	'note.added': z.object({
		text: z.string().min(1)
	}),

	'ticket.created': z.object({
		ticketTag: presentName,
		subject: presentName,
		channel: z.enum(['portal', 'agent'])
	}),

	'ticket.status.changed': z.object({
		from: ticketStatus,
		to: ticketStatus
	}),

	'ticket.assigned': z.object({
		toPersonId: z.uuid(),
		toPersonName: presentName
	}),

	'ticket.unassigned': z.object({
		fromPersonId: z.uuid(),
		fromPersonName: presentName
	}),

	'ticket.priority.changed': z.object({
		from: ticketPriority,
		to: ticketPriority
	}),

	'ticket.queue.changed': z.object({
		fromQueueId: z.uuid(),
		fromQueueName: presentName,
		toQueueId: z.uuid(),
		toQueueName: presentName
	}),

	// Both hang off the **ticket**, never the asset (#9): the thread answers
	// "when was this attached?", a past event, while the asset's timeline reads
	// the live relation. Writing it on both would show the ticket twice, once stale.
	'link.asset.added': linkedAsset,
	'link.asset.removed': linkedAsset,

	'project.created': z.object({
		projectTag: presentName,
		name: presentName
	}),

	'project.archived': z.object({}),
	'project.unarchived': z.object({}),

	// Both ends nullable: a project can gain an owner from nobody, and lose one
	// without gaining another. The name is a snapshot, like every person here.
	'project.owner.changed': z.object({
		fromPersonId: z.uuid().nullable(),
		fromPersonName: presentName.nullable(),
		toPersonId: z.uuid().nullable(),
		toPersonName: presentName.nullable()
	}),

	'project.due.changed': z.object({
		from: isoDate.nullable(),
		to: isoDate.nullable()
	}),

	'task.created': z.object({
		taskTag: presentName,
		title: presentName
	}),

	// The state catalogue is user-authored, so the name is a snapshot: renaming a
	// state must not rewrite what a task's past said.
	'task.state.changed': z.object({
		fromStateId: z.uuid(),
		fromStateName: presentName,
		toStateId: z.uuid(),
		toStateName: presentName
	}),

	'task.assigned': z.object({
		toPersonId: z.uuid(),
		toPersonName: presentName
	}),

	'task.unassigned': z.object({
		fromPersonId: z.uuid(),
		fromPersonName: presentName
	}),

	'task.due.changed': z.object({
		from: isoDate.nullable(),
		to: isoDate.nullable()
	})
} satisfies Record<ActivityVerb, z.ZodType>;

/** The payload belonging to one verb, inferred from its schema. */
export type PayloadFor<V extends ActivityVerb> = z.infer<(typeof PAYLOAD_SCHEMAS)[V]>;

/** Every verb paired with its own payload: the discriminated union itself. */
export type ActivityEntry = {
	[V in ActivityVerb]: { verb: V; payload: PayloadFor<V> };
}[ActivityVerb];

/**
 * Validates a payload against the schema its verb declares. Called on write,
 * because the database can hold any JSON and the union only binds code that
 * went through here.
 */
export function parsePayload<V extends ActivityVerb>(verb: V, payload: unknown): PayloadFor<V> {
	// Indexing by a generic parameter yields the union of every schema, so the
	// return type widens to the union of every payload. The cast narrows it back
	// to the one the verb selects — the only thing lost is what `V` already said.
	return PAYLOAD_SCHEMAS[verb].parse(payload) as PayloadFor<V>;
}
