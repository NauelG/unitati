import type { UserRole } from '../auth/schema';

/**
 * ADR 0007: authorisation asks what a user may *do*, never what they *are*.
 * Code reads `can(user, 'assets.view')`, so changing what a role may do is one
 * edit here instead of a search for `role === 'admin'` across the codebase.
 *
 * Roles are product constants. Users never author them in v1 — that is
 * structure, not catalogue.
 */

export const PERMISSIONS = [
	// Directory
	'people.view',
	/**
	 * Editing the directory's data: create, update, import, comment, departments.
	 * An admin always holds it; a technician only when the organisation turned it
	 * on (`Grants` below).
	 */
	'people.edit',
	/** Credentials, roles and (de)activation. Admin only: it is how privileges escalate. */
	'people.manage',
	'organisation.manage',

	// Assets — the catalogue exists before the screens do, so the role table
	// does not need rewriting when slice 2 lands.
	'assets.view',
	'assets.view.shared',
	'assets.view.own',
	'assets.manage',
	'assets.checkout',
	/**
	 * Recording custody without the signature a category requires (ADR 0035,
	 * decision 8). Admins only: a waiver every technician can apply ends up
	 * applied to everything.
	 */
	'assets.handover.waive',

	// Service desk
	'tickets.view',
	'tickets.view.own',
	'tickets.create',
	'tickets.manage',
	'tickets.comment.internal',

	// Projects
	'projects.view',
	/** The `tickets.view.own` shape: the tasks assigned to you, and the projects that hold them. */
	'projects.view.assigned',
	'projects.manage',

	// Knowledge base (ADR 0031). `.view` is every role; which spaces and pages a
	// viewer then reads is decided by the audience scope inside the domain.
	'knowledge.view',
	'knowledge.manage',
	/** The catalogue of spaces: an audience decision, so admins only. */
	'knowledge.spaces.manage',

	// API keys (ADR 0022). `.manage` is a person's own keys; `.manage.all` is every
	// key in the organisation.
	'api.keys.manage',
	'api.keys.manage.all',

	// Time tracking (ADR 0052). `.log` is a person's own entries and timer, and their
	// own time on the report (#379); `.manage` is everyone's entries, on the report and
	// the export, and the catalogue.
	'time.log',
	'time.manage'
] as const;

export type Permission = (typeof PERMISSIONS)[number];

/**
 * `employee` is deliberately the narrowest role. Widening it later is a product
 * decision; narrowing it once people are used to seeing something is a
 * regression.
 *
 * `assets.view.shared` is what keeps the differentiator working for equipment
 * nobody holds: without it an employee cannot find the floor printer, cannot
 * attach it to a ticket, and the ticket ↔ asset relation fails for every shared
 * asset. It grants name and location only — never cost, purchase or history.
 */
const ROLE_PERMISSIONS: Record<UserRole, readonly Permission[]> = {
	admin: PERMISSIONS,
	technician: [
		'people.view',
		'assets.view',
		'assets.view.shared',
		'assets.view.own',
		'assets.manage',
		'assets.checkout',
		'tickets.view',
		'tickets.view.own',
		'tickets.create',
		'tickets.manage',
		'tickets.comment.internal',
		'projects.view',
		'projects.manage',
		'knowledge.view',
		'knowledge.manage',
		'api.keys.manage',
		'time.log'
	],
	employee: [
		'assets.view.own',
		'assets.view.shared',
		'tickets.view.own',
		'tickets.create',
		'projects.view.assigned',
		'knowledge.view'
	]
};

export function permissionsFor(role: UserRole): readonly Permission[] {
	return ROLE_PERMISSIONS[role];
}

export function roleCan(role: UserRole, permission: Permission): boolean {
	return ROLE_PERMISSIONS[role].includes(permission);
}

/**
 * Permissions an organisation setting lends to a role, beyond the fixed table
 * above (ADR 0044). The session resolver fills them in; the role table stays a
 * product constant, so roles are still not user-authored.
 */
export const TECHNICIAN_DIRECTORY_GRANTS: readonly Permission[] = ['people.edit'];

interface Principal {
	role: UserRole;
	grants?: readonly Permission[];
	scopes?: readonly Permission[];
}

/** What the principal holds before any API-key scope narrows it: the role's, plus the organisation's grants. */
export function permissionsOf(user: Pick<Principal, 'role' | 'grants'>): readonly Permission[] {
	const grants = user.grants ?? [];
	return grants.length === 0
		? permissionsFor(user.role)
		: [...permissionsFor(user.role), ...grants];
}

/**
 * A principal's `scopes` (an API key's, ADR 0022) only ever narrow what it
 * holds: `undefined` means unscoped, which is what a browser session is. An
 * empty list is a key that may do nothing, not a key that may do everything.
 */
export function can(user: Principal | null | undefined, permission: Permission): boolean {
	if (!user) return false;
	return (
		(roleCan(user.role, permission) || (user.grants?.includes(permission) ?? false)) &&
		(user.scopes === undefined || user.scopes.includes(permission))
	);
}
