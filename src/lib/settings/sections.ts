import { m } from '#lib/paraglide/messages.js';
import type { Permission } from '#lib/server/access/permissions.js';

/**
 * The Settings area's registry (ADR 0015 addendum, #123).
 *
 * Every configurable catalogue lives under `/settings/{module}/{catalogue}` and
 * is listed here, once. The sidebar link, the secondary navigation, the index
 * and the `/settings` guard all read this list through `visibleSections`, so a
 * section added here shows up everywhere, and a section the viewer may not
 * manage shows up nowhere.
 */

export interface SettingsSection {
	module: SettingsModule;
	href: string;
	/** A message function, not a string: the locale is per request. */
	label: () => string;
	permission: Permission;
}

/** Display order of the modules in the navigation and the index; the one list `SettingsModule` derives from. */
export const MODULE_ORDER = ['projects', 'assets', 'service-desk', 'platform'] as const;

export type SettingsModule = (typeof MODULE_ORDER)[number];

export const MODULE_LABELS: Record<SettingsModule, () => string> = {
	projects: m.settings_module_projects,
	assets: m.settings_module_assets,
	'service-desk': m.settings_module_service_desk,
	/** What belongs to the installation rather than to one module: API keys, and later its siblings. */
	platform: m.settings_module_platform
};

export const SETTINGS_SECTIONS: readonly SettingsSection[] = [
	{
		module: 'projects',
		href: '/settings/projects/states',
		label: m.settings_section_project_states,
		permission: 'projects.manage'
	},
	{
		module: 'assets',
		href: '/settings/assets/models',
		label: m.assets_nav_models,
		permission: 'assets.manage'
	},
	{
		module: 'assets',
		href: '/settings/assets/categories',
		label: m.assets_nav_categories,
		permission: 'assets.manage'
	},
	{
		module: 'assets',
		href: '/settings/assets/manufacturers',
		label: m.assets_nav_manufacturers,
		permission: 'assets.manage'
	},
	{
		module: 'assets',
		href: '/settings/assets/locations',
		label: m.assets_nav_locations,
		permission: 'assets.manage'
	},
	{
		module: 'service-desk',
		href: '/settings/service-desk/queues',
		label: m.queues_title,
		permission: 'tickets.manage'
	},
	{
		module: 'platform',
		href: '/settings/platform/branding',
		label: m.settings_section_branding,
		permission: 'organisation.manage'
	},
	{
		module: 'platform',
		href: '/settings/api-keys',
		label: m.settings_section_api_keys,
		permission: 'api.keys.manage'
	}
];

/** The sections whose permission the viewer holds; registry order is kept. */
export function visibleSections(
	permissions: readonly string[],
	sections: readonly SettingsSection[] = SETTINGS_SECTIONS
): SettingsSection[] {
	return sections.filter((section) => permissions.includes(section.permission));
}

export interface SettingsModuleGroup {
	module: SettingsModule;
	sections: SettingsSection[];
}

/** Sections grouped by module in `MODULE_ORDER`; modules with nothing visible are omitted. */
export function groupByModule(sections: readonly SettingsSection[]): SettingsModuleGroup[] {
	return MODULE_ORDER.map((module) => ({
		module,
		sections: sections.filter((section) => section.module === module)
	})).filter((group) => group.sections.length > 0);
}
