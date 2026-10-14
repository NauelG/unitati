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
	'people.manage',
	'organisation.manage',

	// Assets — the catalogue exists before the screens do, so the role table
	// does not need rewriting when slice 2 lands.
	'assets.view',
	'assets.view.shared',
	'assets.view.own',
	'assets.manage',
	'assets.checkout',

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
	'projects.manage'
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
		'projects.manage'
	],
	employee: [
		'assets.view.own',
		'assets.view.shared',
		'tickets.view.own',
		'tickets.create',
		'projects.view.assigned'
	]
};

export function permissionsFor(role: UserRole): readonly Permission[] {
	return ROLE_PERMISSIONS[role];
}

export function roleCan(role: UserRole, permission: Permission): boolean {
	return ROLE_PERMISSIONS[role].includes(permission);
}

export function can(user: { role: UserRole } | null | undefined, permission: Permission): boolean {
	return user ? roleCan(user.role, permission) : false;
}
