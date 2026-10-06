import { describe, expect, it } from 'vitest';
import { can, permissionsFor, PERMISSIONS, roleCan, type Permission } from './permissions';

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
			'assets.view.shared'
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

		it('does not administer the organisation or the directory', () => {
			expect(roleCan('technician', 'organisation.manage')).toBe(false);
			expect(roleCan('technician', 'people.manage')).toBe(false);
		});
	});

	it('accepts a user shaped object', () => {
		expect(can({ role: 'technician' }, 'assets.manage')).toBe(true);
		expect(can({ role: 'employee' }, 'assets.manage')).toBe(false);
	});
});
