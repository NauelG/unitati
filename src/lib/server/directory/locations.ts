import { and, eq, sql } from 'drizzle-orm';
import { getDb, type Executor, type Transaction } from '../db';
import { constraintViolation, uniqueConstraintName } from '../db/errors';
import type { SessionUser } from '../auth/guards';
import { failure, success, type Outcome } from '../shared/outcome';
import type { WriteOptions } from '../shared/write-options';
import { actorColumns, recordActivity } from '../activity';
import { locations, organisations, people } from './schema';
import type { LocationInput } from './validation';

/**
 * The location tree (ADR 0027).
 *
 * A location is identified to people by its **path** — `Barcelona office ›
 * Floor 1` — not by its name, because "Floor 1" exists in every building. The
 * recursion that builds a path lives here and nowhere else: `assets` asks
 * `locationPaths` rather than re-implementing it.
 */

const SEPARATOR = ' › ';

export type LocationEntry = {
	id: string;
	name: string;
	parentId: string | null;
	/** Ancestor names root-first, joined by ` › `. */
	path: string;
	/** 0 for a root. */
	depth: number;
	code: string | null;
	address: string | null;
	notes: string | null;
	latitude: number | null;
	longitude: number | null;
};

/**
 * Every location of the organisation, tree-ordered: a node is followed by its
 * subtree, siblings alphabetically. Ordered on the array of ancestor names
 * rather than on the joined string, because a separator character takes part in
 * collation and could interleave `Barcelona` › `Floor 1` with `Barcelona 2`.
 */
export async function listLocations(
	organisationId: string,
	executor: Executor = getDb()
): Promise<LocationEntry[]> {
	const rows = await executor.execute<LocationEntry>(sql`
		WITH RECURSIVE tree AS (
			SELECT l.id, ARRAY[l.name] AS names
			FROM locations l
			WHERE l.organisation_id = ${organisationId} AND l.parent_id IS NULL
			UNION ALL
			SELECT l.id, tree.names || l.name
			FROM locations l
			JOIN tree ON l.parent_id = tree.id
			WHERE l.organisation_id = ${organisationId}
		)
		SELECT
			l.id,
			l.name,
			l.parent_id AS "parentId",
			array_to_string(tree.names, ${SEPARATOR}) AS path,
			cardinality(tree.names) - 1 AS depth,
			l.code,
			l.address,
			l.notes,
			l.latitude,
			l.longitude
		FROM tree
		JOIN locations l ON l.id = tree.id
		ORDER BY tree.names
	`);
	return [...rows];
}

/**
 * The path of each of `ids`, for whoever shows a location beside something else.
 * An id that is not in this organisation is simply absent from the map.
 */
export async function locationPaths(
	organisationId: string,
	ids: string[],
	executor: Executor = getDb()
): Promise<Map<string, string>> {
	const unique = [...new Set(ids)];
	if (unique.length === 0) return new Map();

	const rows = await executor.execute<{ id: string; path: string }>(sql`
		WITH RECURSIVE up AS (
			SELECT l.id AS leaf, l.parent_id, l.name::text AS path
			FROM locations l
			WHERE l.organisation_id = ${organisationId}
				AND l.id IN (${sql.join(
					unique.map((id) => sql`${id}`),
					sql`, `
				)})
			UNION ALL
			SELECT up.leaf, l.parent_id, l.name || ${SEPARATOR} || up.path
			FROM up
			JOIN locations l ON l.id = up.parent_id
		)
		SELECT leaf AS id, path FROM up WHERE parent_id IS NULL
	`);
	return new Map(rows.map((row) => [row.id, row.path]));
}

export type LocationCreateFailure = 'duplicate_name' | 'duplicate_code' | 'parent_not_found';
export type LocationUpdateFailure = LocationCreateFailure | 'not_found' | 'cycle';
export type LocationDeleteFailure = 'not_found' | 'in_use';

/** The unique constraint that refused a row, in the sentence the caller can act on. */
function duplicateOf(error: unknown): 'duplicate_name' | 'duplicate_code' | null {
	switch (uniqueConstraintName(error)) {
		case 'locations_org_parent_name':
			return 'duplicate_name';
		case 'locations_org_code':
			return 'duplicate_code';
		default:
			return null;
	}
}

async function parentExists(
	executor: Executor,
	organisationId: string,
	parentId: string
): Promise<boolean> {
	const [row] = await executor
		.select({ id: locations.id })
		.from(locations)
		.where(and(eq(locations.id, parentId), eq(locations.organisationId, organisationId)))
		.limit(1);
	return row !== undefined;
}

export async function createLocation(
	actor: SessionUser,
	input: LocationInput,
	options: WriteOptions = {}
): Promise<Outcome<{ id: string }, LocationCreateFailure>> {
	const executor = options.executor ?? getDb();
	if (input.parentId && !(await parentExists(executor, actor.organisationId, input.parentId))) {
		return failure('parent_not_found');
	}

	try {
		// The entry commits with the row (ADR 0009): a catalogue change an audit
		// depends on is never anonymous, and never half-recorded.
		return await executor.transaction(async (tx) => {
			const [row] = await tx
				.insert(locations)
				.values({ ...input, organisationId: actor.organisationId })
				.returning({ id: locations.id });

			const path =
				(await locationPaths(actor.organisationId, [row.id], tx)).get(row.id) ?? input.name;
			await recordActivity(tx, {
				organisationId: actor.organisationId,
				...actorColumns(actor),
				target: { locationId: row.id },
				verb: 'catalogue.location.created',
				payload: { name: input.name, path, ...snapshotOf(input) }
			});
			return success(row);
		});
	} catch (error) {
		const duplicate = duplicateOf(error);
		if (duplicate) return failure(duplicate);
		// The parent was deleted between the check and the insert.
		if (constraintViolation(error)?.code === '23503') return failure('parent_not_found');
		throw error;
	}
}

/** The fields a created entry snapshots besides the name and path it derives. */
function snapshotOf(input: LocationInput) {
	return {
		parentId: input.parentId,
		code: input.code,
		address: input.address,
		notes: input.notes,
		latitude: input.latitude,
		longitude: input.longitude
	};
}

const SCALAR_FIELDS = ['name', 'code', 'address', 'notes', 'latitude', 'longitude'] as const;

/** True when `candidateId` is somewhere below `ancestorId`. */
async function isDescendant(
	tx: Transaction,
	ancestorId: string,
	candidateId: string
): Promise<boolean> {
	const rows = await tx.execute<{ found: number }>(sql`
		WITH RECURSIVE below AS (
			SELECT id FROM locations WHERE parent_id = ${ancestorId}
			UNION ALL
			SELECT l.id FROM locations l JOIN below ON l.parent_id = below.id
		)
		SELECT 1 AS found FROM below WHERE id = ${candidateId} LIMIT 1
	`);
	return rows.length > 0;
}

export async function updateLocation(
	actor: SessionUser,
	id: string,
	input: LocationInput
): Promise<Outcome<void, LocationUpdateFailure>> {
	try {
		return await getDb().transaction(async (tx) => {
			// Two moves that are each fine alone can form a loop together (A under B
			// while B goes under A), and neither sees the other's uncommitted row. A
			// write that gives a location a parent therefore takes the organisation's
			// row first and checks after, so the second of two such moves sees the first
			// (the ADR 0021 pattern).
			if (input.parentId !== null) {
				await tx
					.select({ id: organisations.id })
					.from(organisations)
					.where(eq(organisations.id, actor.organisationId))
					.for('update');
			}

			const [current] = await tx
				.select()
				.from(locations)
				.where(and(eq(locations.id, id), eq(locations.organisationId, actor.organisationId)))
				.limit(1);
			if (!current) return failure('not_found');

			if (input.parentId !== null) {
				if (!(await parentExists(tx, actor.organisationId, input.parentId))) {
					return failure('parent_not_found');
				}
				if (input.parentId === id || (await isDescendant(tx, id, input.parentId))) {
					return failure('cycle');
				}
			}

			// Only what differs is recorded, and a save that changes nothing records
			// nothing — and does not touch the row either.
			const changes: Record<string, { from: unknown; to: unknown }> = {};
			for (const field of SCALAR_FIELDS) {
				if (current[field] !== input[field]) {
					changes[field] = { from: current[field], to: input[field] };
				}
			}
			const moved = current.parentId !== input.parentId;
			if (Object.keys(changes).length === 0 && !moved) return success(undefined);

			// Paths are read before the write for the old parent and after it for
			// this location, so the entry says where it was and where it now is.
			const before = await locationPaths(
				actor.organisationId,
				current.parentId ? [current.parentId] : [],
				tx
			);

			await tx
				.update(locations)
				.set({ ...input, updatedAt: new Date() })
				.where(eq(locations.id, id));

			const after = await locationPaths(
				actor.organisationId,
				[id, ...(input.parentId ? [input.parentId] : [])],
				tx
			);
			if (moved) {
				changes.parent = {
					from: current.parentId
						? { id: current.parentId, path: before.get(current.parentId) ?? '' }
						: null,
					to: input.parentId ? { id: input.parentId, path: after.get(input.parentId) ?? '' } : null
				};
			}

			await recordActivity(tx, {
				organisationId: actor.organisationId,
				...actorColumns(actor),
				target: { locationId: id },
				verb: 'catalogue.location.updated',
				payload: { path: after.get(id) ?? input.name, changes }
			});
			return success(undefined);
		});
	} catch (error) {
		const duplicate = duplicateOf(error);
		if (duplicate) return failure(duplicate);
		throw error;
	}
}

/**
 * `in_use` is `restrict` speaking: a child location or an asset still points
 * here. A person does not — their `location_id` is cleared by the foreign key's
 * `set null`, and each person who loses it gets a `person.location.changed`
 * entry (`reason: 'location_deleted'`) in the same transaction (#176). A refused
 * delete rolls everything back, so no person entry survives it.
 *
 * `23503` is the foreign-key class; anything else is not "in use" and keeps
 * propagating, as in the assets catalogue.
 */
export async function deleteLocation(
	actor: SessionUser,
	id: string
): Promise<Outcome<void, LocationDeleteFailure>> {
	try {
		return await getDb().transaction(async (tx) => {
			const [current] = await tx
				.select({ name: locations.name, code: locations.code })
				.from(locations)
				.where(and(eq(locations.id, id), eq(locations.organisationId, actor.organisationId)))
				.limit(1);
			if (!current) return failure('not_found');

			// The path has to be read while the row still exists: afterwards there is
			// nothing left to climb, and the entry must carry its own snapshot.
			const path = (await locationPaths(actor.organisationId, [id], tx)).get(id) ?? current.name;

			// Read before the delete: the foreign key clears these rows' location, and
			// after that nothing says who sat here.
			const affected = await tx
				.select({ id: people.id })
				.from(people)
				.where(and(eq(people.locationId, id), eq(people.organisationId, actor.organisationId)));

			await tx.delete(locations).where(eq(locations.id, id));
			await recordActivity(tx, {
				organisationId: actor.organisationId,
				...actorColumns(actor),
				target: { locationId: id },
				verb: 'catalogue.location.deleted',
				payload: { name: current.name, path, code: current.code }
			});
			for (const person of affected) {
				await recordActivity(tx, {
					organisationId: actor.organisationId,
					...actorColumns(actor),
					target: { personId: person.id },
					verb: 'person.location.changed',
					payload: { from: { id, path }, to: null, reason: 'location_deleted' }
				});
			}
			return success(undefined);
		});
	} catch (error) {
		if (constraintViolation(error)?.code === '23503') return failure('in_use');
		throw error;
	}
}

/** For the `in_use` sentence: how many direct children block a delete. */
export async function countLocationChildren(organisationId: string, id: string): Promise<number> {
	const [row] = await getDb()
		.select({ count: sql<number>`count(*)::int` })
		.from(locations)
		.where(and(eq(locations.parentId, id), eq(locations.organisationId, organisationId)));
	return row?.count ?? 0;
}

/** For the delete confirmation: how many people sit at each location, one query. */
export async function countPeopleByLocation(organisationId: string): Promise<Map<string, number>> {
	const rows = await getDb()
		.select({ locationId: people.locationId, count: sql<number>`count(*)::int` })
		.from(people)
		.where(and(eq(people.organisationId, organisationId), sql`${people.locationId} is not null`))
		.groupBy(people.locationId);
	return new Map(
		rows.flatMap((row) => (row.locationId ? [[row.locationId, row.count] as const] : []))
	);
}
