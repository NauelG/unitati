import { describe, expect, it } from 'vitest';
import { groupByModule, visibleSections, type SettingsSection } from './sections.js';

const sections: readonly SettingsSection[] = [
	{
		module: 'projects',
		href: '/settings/projects/states',
		label: () => 'Estados',
		permission: 'projects.manage'
	},
	{
		module: 'assets',
		href: '/settings/assets/categories',
		label: () => 'Categorías',
		permission: 'assets.manage'
	},
	{
		module: 'projects',
		href: '/settings/projects/labels',
		label: () => 'Etiquetas',
		permission: 'projects.manage'
	}
];

describe('visibleSections', () => {
	it('keeps only the sections whose permission the viewer holds', () => {
		const visible = visibleSections(['projects.manage'], sections);

		expect(visible.map((section) => section.href)).toEqual([
			'/settings/projects/states',
			'/settings/projects/labels'
		]);
	});

	it('returns nothing for a viewer without any of the permissions', () => {
		expect(visibleSections(['assets.view.own', 'tickets.create'], sections)).toEqual([]);
	});

	it('shows the shipped sections to a technician and hides them from an employee', () => {
		const technician = ['projects.view', 'projects.manage', 'api.keys.manage'];
		const employee = ['projects.view.assigned', 'tickets.create'];

		expect(visibleSections(technician).map((section) => section.href)).toEqual([
			'/settings/projects/states',
			'/settings/api-keys'
		]);
		expect(visibleSections(employee)).toEqual([]);
	});

	it('shows the branding section before API keys, to whoever may manage the organisation', () => {
		const administrator = ['organisation.manage', 'api.keys.manage'];

		expect(visibleSections(administrator).map((section) => section.href)).toEqual([
			'/settings/platform/branding',
			'/settings/api-keys'
		]);
		expect(
			visibleSections(['api.keys.manage']).some((s) => s.href === '/settings/platform/branding')
		).toBe(false);
	});

	it('registers the asset and service-desk catalogues under their module, for the permission their routes always enforced', () => {
		const assetsManager = visibleSections(['assets.manage']).map((section) => section.href);
		const deskManager = visibleSections(['tickets.manage']).map((section) => section.href);

		expect(assetsManager).toEqual([
			'/settings/assets/models',
			'/settings/assets/categories',
			'/settings/assets/manufacturers',
			'/settings/assets/locations'
		]);
		expect(deskManager).toEqual(['/settings/service-desk/queues']);
	});
});

describe('groupByModule', () => {
	it('groups visible sections by module, keeping registry order', () => {
		const groups = groupByModule(visibleSections(['projects.manage', 'assets.manage'], sections));

		expect(groups.map((group) => [group.module, group.sections.length])).toEqual([
			['projects', 2],
			['assets', 1]
		]);
	});

	it('yields no groups when nothing is visible', () => {
		expect(groupByModule([])).toEqual([]);
	});
});
