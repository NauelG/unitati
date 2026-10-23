import type { SessionUser } from '../auth/guards';
import { serviceAccountName } from '../api/service-accounts';

/**
 * Who wrote a page or a revision: the person **or** the service account, never
 * both (the `*_at_most_one_*` checks), the way `actorColumns` decides it for
 * activity. A service account is attributed by id, never left anonymous.
 */
export function authorColumns(actor: Pick<SessionUser, 'personId' | 'serviceAccountId'>): {
	personId: string | null;
	serviceAccountId: string | null;
} {
	const serviceAccountId = actor.serviceAccountId ?? null;
	return { personId: serviceAccountId ? null : actor.personId, serviceAccountId };
}

/**
 * Names the authors of a set of rows: the person's name when there is one, else
 * the service account's. `null` keeps meaning "the person was deleted".
 */
export async function withAuthorNames<
	T extends { personName: string | null; serviceAccountId: string | null }
>(
	organisationId: string,
	rows: T[]
): Promise<(Omit<T, 'personName' | 'serviceAccountId'> & { authorName: string | null })[]> {
	const ids = [
		...new Set(rows.flatMap((row) => (row.serviceAccountId ? [row.serviceAccountId] : [])))
	];
	const names = new Map(
		await Promise.all(
			ids.map(async (id) => [id, await serviceAccountName(organisationId, id)] as const)
		)
	);
	return rows.map(({ personName, serviceAccountId, ...rest }) => ({
		...rest,
		authorName: personName ?? (serviceAccountId ? (names.get(serviceAccountId) ?? null) : null)
	}));
}
