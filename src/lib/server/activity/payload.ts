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
