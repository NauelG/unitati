import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import { getDb } from '../db';
import { users } from '../auth/schema';
import type { SessionUser } from '../auth/guards';
import { locationPaths } from './locations';
import { departments, organisations, people, teams } from './schema';

export { organisations, people, departments, locations, teams } from './schema';
export {
	countLocationChildren,
	countPeopleByLocation,
	createLocation,
	deleteLocation,
	listLocations,
	locationPaths,
	updateLocation
} from './locations';
export type {
	LocationCreateFailure,
	LocationDeleteFailure,
	LocationEntry,
	LocationUpdateFailure
} from './locations';
export {
	createDepartment,
	deleteDepartment,
	listDepartments,
	renameDepartment
} from './departments';
export type {
	DepartmentCreateFailure,
	DepartmentDeleteFailure,
	DepartmentEntry,
	DepartmentRenameFailure
} from './departments';
export {
	countActiveAdmins,
	findPersonForAccess,
	isUserActive,
	linkPersonToUser,
	setPersonEmail,
	userIdOfPerson
} from './access';
export type { PersonForAccess } from './access';
export { setPersonLocation } from './person-location';
export type { SetPersonLocationFailure } from './person-location';
export { createPerson, deactivatePerson, reactivatePerson, updatePerson } from './people';
export type {
	PersonCreateFailure,
	PersonDeactivateFailure,
	PersonReactivateFailure,
	PersonUpdateFailure
} from './people';
export { departmentInput, locationInput, personInput, personUpdateInput } from './validation';
export type { DepartmentInput, LocationInput, PersonInput, PersonUpdateInput } from './validation';
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
 * Returns null when a credential has no directory record, or its person is
 * deactivated: that user cannot act on anything, so treating them as anonymous
 * is safer than inventing a scope.
 */
export async function resolveSessionUser(userId: string): Promise<SessionUser | null> {
	const [row] = await getDb()
		.select({
			id: users.id,
			name: users.name,
			email: users.email,
			role: users.role,
			mustChangePassword: users.mustChangePassword,
			organisationId: people.organisationId,
			personId: people.id
		})
		.from(users)
		.innerJoin(people, eq(people.userId, users.id))
		// A deactivated person is signed out in effect, whatever sessions linger (#230).
		.where(and(eq(users.id, userId), eq(people.active, true)))
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
	departmentId: string | null;
	departmentName: string | null;
	/** True when a credential belongs to this person (`user_id IS NOT NULL`). */
	hasAccess: boolean;
	role: string | null;
	active: boolean;
	locationId: string | null;
	/** The location's path (` › `-joined), resolved once for the whole list. */
	locationPath: string | null;
}

/**
 * The organisation's people by name. Active people only unless asked otherwise:
 * most callers feed a picker, and a deactivated person is not offered for new
 * assignments. Whoever resolves a name that is already stored passes
 * `includeInactive`.
 */
export async function listPeople(
	organisationId: string,
	options: { includeInactive?: boolean } = {}
): Promise<DirectoryEntry[]> {
	const rows = await getDb()
		.select({
			id: people.id,
			fullName: people.fullName,
			email: people.email,
			departmentId: people.departmentId,
			departmentName: departments.name,
			hasAccess: sql<boolean>`${people.userId} is not null`,
			role: users.role,
			active: people.active,
			locationId: people.locationId
		})
		.from(people)
		.leftJoin(departments, eq(people.departmentId, departments.id))
		.leftJoin(users, eq(people.userId, users.id))
		.where(
			and(
				eq(people.organisationId, organisationId),
				options.includeInactive ? undefined : eq(people.active, true)
			)
		)
		.orderBy(asc(people.fullName));

	const paths = await locationPaths(
		organisationId,
		rows.flatMap((row) => (row.locationId ? [row.locationId] : []))
	);
	return rows.map((row) => ({
		...row,
		locationPath: row.locationId ? (paths.get(row.locationId) ?? null) : null
	}));
}

export interface PersonLocation {
	locationId: string;
	/** The location's path (` › `-joined). */
	path: string;
}

/**
 * Where a person usually works, for whoever shows it beside something else
 * (the ticket record, #176). Null when the person has no location or is not in
 * the organisation. Callers decide who may see it: nothing is redacted here.
 */
export async function personLocation(
	organisationId: string,
	personId: string
): Promise<PersonLocation | null> {
	const [row] = await getDb()
		.select({ locationId: people.locationId })
		.from(people)
		.where(and(eq(people.id, personId), eq(people.organisationId, organisationId)))
		.limit(1);
	if (!row?.locationId) return null;

	const path = (await locationPaths(organisationId, [row.locationId])).get(row.locationId);
	return path ? { locationId: row.locationId, path } : null;
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

export { personHits } from './search';
