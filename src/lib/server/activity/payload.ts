import { z } from 'zod';
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

/** The four asset states, spelled here so `state.changed` validates them. */
export const ASSET_STATES = ['in_use', 'in_repair', 'in_stock', 'retired'] as const;

const assetState = z.enum(ASSET_STATES);

/** A person as they were when the entry was written. */
const personSnapshot = {
	toPersonId: z.uuid(),
	toPersonName: z.string().min(1)
};

const payloadSchemas = {
	'asset.created': z.object({
		assetTag: z.string().min(1),
		name: z.string().min(1)
	}),

	'custody.assigned': z.object(personSnapshot),

	'custody.returned': z.object({
		fromPersonId: z.uuid(),
		fromPersonName: z.string().min(1)
	}),

	'state.changed': z.object({
		from: assetState,
		to: assetState
	}),

	// Both ends nullable: an asset can arrive from nowhere and be unassigned
	// from a location without being given a new one.
	'location.changed': z.object({
		fromLocationId: z.uuid().nullable(),
		fromLocationName: z.string().nullable(),
		toLocationId: z.uuid().nullable(),
		toLocationName: z.string().nullable()
	}),

	'note.added': z.object({
		text: z.string().min(1)
	})
	// The annotation is the compile-time gate: a verb added to the enum without
	// an entry here is a missing property, reported on this object.
} satisfies Record<ActivityVerb, z.ZodType>;

export const PAYLOAD_SCHEMAS: Record<ActivityVerb, z.ZodType> = payloadSchemas;

/** The payload belonging to one verb, inferred from its schema. */
export type PayloadFor<V extends ActivityVerb> = z.infer<(typeof payloadSchemas)[V]>;

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
	return payloadSchemas[verb].parse(payload) as PayloadFor<V>;
}
