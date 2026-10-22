import { describe, expect, it } from 'vitest';
import {
	MODULE_LABELS,
	MODULE_ORDER,
	groupByModule,
	visibleSections,
	type SettingsSection
} from './sections.js';

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

	it('shows the spaces catalogue to whoever holds knowledge.spaces.manage, and to nobody else', () => {
		const administrator = ['knowledge.spaces.manage', 'api.keys.manage'];
		const technician = ['knowledge.view', 'knowledge.manage', 'api.keys.manage'];

		expect(visibleSections(administrator).map((section) => section.href)).toEqual([
			'/settings/knowledge',
			'/settings/api-keys'
		]);
		expect(visibleSections(technician).map((section) => section.href)).toEqual([
			'/settings/api-keys'
		]);
	});

	it('shows the branding section before API keys, to whoever may manage the organisation', () => {
		const administrator = ['organisation.manage', 'api.keys.manage'];

		expect(visibleSections(administrator).map((section) => section.href)).toEqual([
			'/settings/directory/permissions',
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
			'/settings/assets/locations',
			'/settings/assets/handover-agreements',
			'/settings/assets/labels'
		]);
		expect(deskManager).toEqual([
			'/settings/service-desk/queues',
			'/settings/service-desk/request-forms'
		]);
	});
});

describe('the directory module', () => {
	it('lists departments under "Directorio" for whoever may edit people', () => {
		expect(MODULE_ORDER).toContain('directory');
		expect(MODULE_LABELS.directory()).toBe('Directorio');

		const sections = visibleSections(['people.edit']);
		expect(sections.map((section) => [section.module, section.href])).toEqual([
			['directory', '/settings/directory/departments']
		]);
	});

	it('keeps the directory permissions switch for whoever administers the organisation', () => {
		expect(visibleSections(['organisation.manage']).map((section) => section.href)).toContain(
			'/settings/directory/permissions'
		);
		expect(
			visibleSections(['people.edit', 'people.manage']).some(
				(section) => section.href === '/settings/directory/permissions'
			)
		).toBe(false);
	});

	it('hides departments from a technician and an employee', () => {
		const technician = ['projects.view', 'projects.manage', 'api.keys.manage'];
		const employee = ['projects.view.assigned', 'tickets.create'];

		for (const permissions of [technician, employee]) {
			expect(
				visibleSections(permissions).some((s) => s.href === '/settings/directory/departments')
			).toBe(false);
		}
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
