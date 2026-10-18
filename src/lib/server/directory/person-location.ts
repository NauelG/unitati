import { and, eq } from 'drizzle-orm';
import { getDb } from '../db';
import type { SessionUser } from '../auth/guards';
import { failure, success, type Outcome } from '../shared/outcome';
import { actorColumns, recordActivity } from '../activity';
import { locationPaths } from './locations';
import { locations, people } from './schema';

export type SetPersonLocationFailure = 'not_found' | 'location_not_found';

/**
 * Where a person usually works (#176): one location, any node of the tree,
 * informative and independent of the custody of their assets.
 *
 * Whoever calls this has already been allowed to (`people.manage`); scoping to
 * the actor's organisation is this function's job. A save that changes nothing
 * records nothing, as in `updateLocation`.
 */
export async function setPersonLocation(
	actor: SessionUser,
	personId: string,
	locationId: string | null
): Promise<Outcome<void, SetPersonLocationFailure>> {
	const { organisationId } = actor;

	return getDb().transaction(async (tx) => {
		const [current] = await tx
			.select({ locationId: people.locationId })
			.from(people)
			.where(and(eq(people.id, personId), eq(people.organisationId, organisationId)))
			.limit(1);
		if (!current) return failure('not_found');

		if (locationId !== null) {
			const [found] = await tx
				.select({ id: locations.id })
				.from(locations)
				.where(and(eq(locations.id, locationId), eq(locations.organisationId, organisationId)))
				.limit(1);
			if (!found) return failure('location_not_found');
		}

		if (current.locationId === locationId) return success(undefined);

		await tx
			.update(people)
			.set({ locationId, updatedAt: new Date() })
			.where(eq(people.id, personId));

		const ids = [current.locationId, locationId].filter((id): id is string => id !== null);
		const paths = await locationPaths(organisationId, ids, tx);
		const ref = (id: string | null) => (id ? { id, path: paths.get(id) ?? '' } : null);

		await recordActivity(tx, {
			organisationId,
			...actorColumns(actor),
			target: { personId },
			verb: 'person.location.changed',
			payload: { from: ref(current.locationId), to: ref(locationId), reason: 'edited' }
		});
		return success(undefined);
	});
}
