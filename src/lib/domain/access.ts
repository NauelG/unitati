import type { Permission } from '#lib/server/access/permissions.js';

/**
 * The permissions that each get a person onto `/assets`, any one being enough.
 *
 * A technician arrives by `assets.view`, an employee by `assets.view.own` or
 * `assets.view.shared`; what each then *sees* is decided row by row inside the
 * assets domain, not here. Kept in `domain/` rather than next to the route
 * because both the route guard and the navigation need it, and the navigation
 * is client code that may not import from `$lib/server`.
 */
export const ASSET_READ_PERMISSIONS = [
	'assets.view',
	'assets.view.own',
	'assets.view.shared'
] as const satisfies readonly Permission[];

/**
 * The permissions that get a person onto the service-desk list: a technician by
 * `tickets.view`, an employee by `tickets.view.own`. Which tickets then appear
 * is decided inside the domain.
 */
export const TICKET_READ_PERMISSIONS = [
	'tickets.view',
	'tickets.view.own'
] as const satisfies readonly Permission[];

/**
 * The permissions that each get a person onto `/projects` and `/tasks`: a
 * technician by `projects.view`, an employee by `projects.view.assigned`. Which
 * rows then appear is decided inside the projects domain.
 */
export const PROJECT_READ_PERMISSIONS = [
	'projects.view',
	'projects.view.assigned'
] as const satisfies readonly Permission[];

/**
 * What puts a person in the staff shell rather than the employee portal. An
 * employee holds none of these, and a sidebar of near-empty modules would look
 * like a broken app.
 */
export const STAFF_SHELL_PERMISSIONS = [
	'tickets.view',
	'assets.view',
	'projects.view',
	'people.view'
] as const satisfies readonly Permission[];
