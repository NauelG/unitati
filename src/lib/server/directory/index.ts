import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import { getDb } from '../db';
import { users } from '../auth/schema';
import type { SessionUser } from '../auth/guards';
import { departments, locations, organisations, people, teams } from './schema';

export { organisations, people, departments, locations, teams } from './schema';
export type { Organisation, Person, Department, Location, Team } from './schema';
export {
	getBrand,
	getBrandAsset,
	removeBrandAsset,
	resetBranding,
	resetBrandCache,
	setBrandAsset,
	updateBranding
} from './branding';
export type { SetBrandAssetFailure, UpdateBrandingFailure } from './branding';

/**
 * Resolves a signed-in credential into the person it belongs to, which is what
 * carries the tenancy scope (ADR 0004).
 *
 * Returns null when a credential has no directory record: that user cannot act
 * on anything, so treating them as anonymous is safer than inventing a scope.
 */
export async function resolveSessionUser(userId: string): Promise<SessionUser | null> {
	const [row] = await getDb()
		.select({
			id: users.id,
			name: users.name,
			email: users.email,
			role: users.role,
			organisationId: people.organisationId,
			personId: people.id
		})
		.from(users)
		.innerJoin(people, eq(people.userId, users.id))
		.where(eq(users.id, userId))
		.limit(1);

	return row ?? null;
}

/** True while no organisation exists: the installation still needs its first admin. */
export async function needsSetup(): Promise<boolean> {
	const [row] = await getDb()
		.select({ count: sql<number>`count(*)::int` })
		.from(organisations);
	return (row?.count ?? 0) === 0;
}

export interface DirectoryEntry {
	id: string;
	fullName: string;
	email: string;
	departmentName: string | null;
	role: string | null;
	active: boolean;
}

export async function listPeople(organisationId: string): Promise<DirectoryEntry[]> {
	return getDb()
		.select({
			id: people.id,
			fullName: people.fullName,
			email: people.email,
			departmentName: departments.name,
			role: users.role,
			active: people.active
		})
		.from(people)
		.leftJoin(departments, eq(people.departmentId, departments.id))
		.leftJoin(users, eq(people.userId, users.id))
		.where(eq(people.organisationId, organisationId))
		.orderBy(asc(people.fullName));
}

export interface PersonContact {
	id: string;
	fullName: string;
	/** Empty when the address was never filled in. */
	email: string;
}

/** Name and address of the people among `ids` in an organisation, for whoever must reach them. */
export async function contactsOf(organisationId: string, ids: string[]): Promise<PersonContact[]> {
	if (ids.length === 0) return [];

	return getDb()
		.select({ id: people.id, fullName: people.fullName, email: people.email })
		.from(people)
		.where(and(eq(people.organisationId, organisationId), inArray(people.id, ids)));
}

export interface LocationEntry {
	id: string;
	name: string;
}

/**
 * For a `<select>`: an asset's location is chosen from the organisation's own
 * rows. Takes an `organisationId` rather than a `SessionUser`, like
 * `listPeople`, because a location is not redacted for anyone who can reach the
 * form.
 */
export async function listLocations(organisationId: string): Promise<LocationEntry[]> {
	return getDb()
		.select({ id: locations.id, name: locations.name })
		.from(locations)
		.where(eq(locations.organisationId, organisationId))
		.orderBy(asc(locations.name));
}

/**
 * The count `AppShell` prints beside the Directory link. Takes a bare
 * `organisationId`, like `listLocations`: nothing here is redacted per viewer,
 * so there is no `SessionUser` to narrow against.
 */
export async function countPeople(organisationId: string): Promise<number> {
	const [row] = await getDb()
		.select({ count: sql<number>`count(*)::int` })
		.from(people)
		.where(eq(people.organisationId, organisationId));
	return row?.count ?? 0;
}

/** The Overview KPI's `teams` half (#84), alongside `countPeople`'s `people` half. */
export async function countTeams(organisationId: string): Promise<number> {
	const [row] = await getDb()
		.select({ count: sql<number>`count(*)::int` })
		.from(teams)
		.where(eq(teams.organisationId, organisationId));
	return row?.count ?? 0;
}
