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
