import { describe, expect, it } from 'vitest';
import {
	can,
	permissionsFor,
	permissionsOf,
	PERMISSIONS,
	roleCan,
	type Permission
} from './permissions';

describe('permissions', () => {
	it('grants an admin every permission', () => {
		expect(permissionsFor('admin')).toEqual(PERMISSIONS);
	});

	it('denies everything to an anonymous visitor', () => {
		expect(can(null, 'people.view')).toBe(false);
		expect(can(undefined, 'assets.view')).toBe(false);
	});

	describe('employee', () => {
		// ADR 0007 spells these out; the tests are here so widening the role is a
		// deliberate act and not a side effect of editing the table.
		it.each([
			'tickets.create',
			'tickets.view.own',
			'assets.view.own',
			'assets.view.shared',
			'projects.view.assigned'
		] satisfies Permission[])('can %s', (permission) => {
			expect(roleCan('employee', permission)).toBe(true);
		});

		it.each([
			'tickets.view',
			'tickets.comment.internal',
			'assets.view',
			'assets.manage',
			'people.view',
			'projects.view',
			'projects.manage',
			'organisation.manage'
		] satisfies Permission[])('cannot %s', (permission) => {
			expect(roleCan('employee', permission)).toBe(false);
		});

		it('reads shared assets so a ticket can name equipment nobody holds', () => {
			// Without this the ticket ↔ asset relation breaks for the floor printer,
			// which is the differentiator failing on its most common case.
			expect(roleCan('employee', 'assets.view.shared')).toBe(true);
			expect(roleCan('employee', 'assets.view')).toBe(false);
		});
	});

	describe('technician', () => {
		it('runs the service desk and the inventory', () => {
			expect(roleCan('technician', 'tickets.manage')).toBe(true);
			expect(roleCan('technician', 'tickets.comment.internal')).toBe(true);
			expect(roleCan('technician', 'assets.manage')).toBe(true);
			expect(roleCan('technician', 'projects.manage')).toBe(true);
		});

		it('sees every project, and does not need the narrower assigned-only grant', () => {
			expect(roleCan('technician', 'projects.view')).toBe(true);
			expect(roleCan('technician', 'projects.view.assigned')).toBe(false);
		});

		it('does not administer the organisation or the directory', () => {
			expect(roleCan('technician', 'organisation.manage')).toBe(false);
			expect(roleCan('technician', 'people.edit')).toBe(false);
			expect(roleCan('technician', 'people.manage')).toBe(false);
		});
	});

	// The project screen lists everybody's entries on every task of the project, notes
	// included, to whoever reads it with `time.log` (#379). That widens nothing only
	// while every role that logs time also reads every task of a project it can open.
	it('gives time.log only to roles that read every task of a project', () => {
		for (const role of ['admin', 'technician', 'employee'] as const) {
			if (roleCan(role, 'time.log')) expect(roleCan(role, 'projects.view'), role).toBe(true);
		}
	});

	describe('grants (ADR 0044: an organisation setting lends a role one permission)', () => {
		const lent = { role: 'technician' as const, grants: ['people.edit'] as const };

		it('lets a technician edit the directory only when the grant is present', () => {
			expect(can({ role: 'technician' }, 'people.edit')).toBe(false);
			expect(can(lent, 'people.edit')).toBe(true);
		});

		it('never lends credential, role or organisation administration', () => {
			expect(can(lent, 'people.manage')).toBe(false);
			expect(can(lent, 'organisation.manage')).toBe(false);
		});

		it('is narrowed by an API key scope like any role permission', () => {
			expect(can({ ...lent, scopes: ['people.view'] }, 'people.edit')).toBe(false);
			expect(can({ ...lent, scopes: ['people.edit'] }, 'people.edit')).toBe(true);
		});

		it('adds the grants to what the viewer holds, and nothing else', () => {
			expect(permissionsOf({ role: 'technician' })).toEqual(permissionsFor('technician'));
			expect(permissionsOf(lent)).toEqual([...permissionsFor('technician'), 'people.edit']);
		});
	});

	it('lets an admin alone waive a required handover (ADR 0035, decision 8)', () => {
		expect(roleCan('admin', 'assets.handover.waive')).toBe(true);
		expect(roleCan('technician', 'assets.handover.waive')).toBe(false);
		expect(roleCan('employee', 'assets.handover.waive')).toBe(false);
	});

	it('accepts a user shaped object', () => {
		expect(can({ role: 'technician' }, 'assets.manage')).toBe(true);
		expect(can({ role: 'employee' }, 'assets.manage')).toBe(false);
	});
});

describe('API key permissions', () => {
	it('gives admin and technician api.keys.manage, and admin alone api.keys.manage.all', () => {
		expect(roleCan('admin', 'api.keys.manage')).toBe(true);
		expect(roleCan('technician', 'api.keys.manage')).toBe(true);
		expect(roleCan('employee', 'api.keys.manage')).toBe(false);

		expect(roleCan('admin', 'api.keys.manage.all')).toBe(true);
		expect(roleCan('technician', 'api.keys.manage.all')).toBe(false);
		expect(roleCan('employee', 'api.keys.manage.all')).toBe(false);
	});
});

describe('scopes (API keys narrow a role, never widen it)', () => {
	it('removes the permissions a scoped principal was not granted', () => {
		const key = { role: 'technician' as const, scopes: ['tickets.view'] as const };

		expect(can(key, 'tickets.view')).toBe(true);
		expect(can(key, 'tickets.manage')).toBe(false);
		expect(can(key, 'assets.view')).toBe(false);
	});

	it('never adds a permission the role lacks', () => {
		const key = { role: 'employee' as const, scopes: ['tickets.view', 'tickets.create'] as const };

		expect(can(key, 'tickets.create')).toBe(true);
		expect(can(key, 'tickets.view')).toBe(false);
	});

	it('leaves an unscoped principal (a session) unchanged', () => {
		expect(can({ role: 'technician' }, 'tickets.manage')).toBe(true);
		expect(can({ role: 'technician', scopes: undefined }, 'tickets.manage')).toBe(true);
	});

	it('treats an empty scope list as no permissions at all', () => {
		expect(can({ role: 'admin', scopes: [] }, 'people.view')).toBe(false);
	});
});
