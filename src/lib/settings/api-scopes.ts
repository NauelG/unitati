import { m } from '#lib/paraglide/messages.js';
import type { Permission } from '#lib/server/access/permissions.js';

/**
 * How the scope checklist on `/settings/api-keys` reads: permissions grouped by
 * the domain they belong to, each with a human label.
 *
 * The API's own permissions (`api.keys.*`) are deliberately absent. v1 serves no
 * endpoint that manages keys, so offering them as scopes would be a checkbox
 * that grants nothing. `assets.handover.waive` is absent for the same reason:
 * the API has no waive option, so a service account never waives (#277).
 */

export interface ScopeGroup {
	label: () => string;
	permissions: readonly Permission[];
}

export const SCOPE_GROUPS: readonly ScopeGroup[] = [
	{
		label: m.api_scope_group_directory,
		permissions: ['people.view', 'people.manage', 'organisation.manage']
	},
	{
		label: m.api_scope_group_assets,
		permissions: [
			'assets.view',
			'assets.view.shared',
			'assets.view.own',
			'assets.manage',
			'assets.checkout'
		]
	},
	{
		label: m.api_scope_group_service_desk,
		permissions: [
			'tickets.view',
			'tickets.view.own',
			'tickets.create',
			'tickets.manage',
			'tickets.comment.internal'
		]
	},
	{
		label: m.api_scope_group_projects,
		permissions: ['projects.view', 'projects.view.assigned', 'projects.manage']
	}
];

export const SCOPE_LABELS: Partial<Record<Permission, () => string>> = {
	'people.view': m.permission_people_view,
	'people.manage': m.permission_people_manage,
	'organisation.manage': m.permission_organisation_manage,
	'assets.view': m.permission_assets_view,
	'assets.view.shared': m.permission_assets_view_shared,
	'assets.view.own': m.permission_assets_view_own,
	'assets.manage': m.permission_assets_manage,
	'assets.checkout': m.permission_assets_checkout,
	'tickets.view': m.permission_tickets_view,
	'tickets.view.own': m.permission_tickets_view_own,
	'tickets.create': m.permission_tickets_create,
	'tickets.manage': m.permission_tickets_manage,
	'tickets.comment.internal': m.permission_tickets_comment_internal,
	'projects.view': m.permission_projects_view,
	'projects.view.assigned': m.permission_projects_view_assigned,
	'projects.manage': m.permission_projects_manage
};

/** A label for any permission; the raw string only for one nobody has labelled yet. */
export function scopeLabel(permission: Permission): string {
	return SCOPE_LABELS[permission]?.() ?? permission;
}
