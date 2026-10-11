import { describe, expect, it } from 'vitest';
import {
	derivePaletteActions,
	hasAnyPermission,
	type PaletteActionContext
} from './palette-actions.js';

function ctx(overrides: Partial<PaletteActionContext> = {}): PaletteActionContext {
	return { permissions: [], isProduction: true, ...overrides };
}

function idsOf(context: PaletteActionContext): string[] {
	return derivePaletteActions(context).map((action) => action.id);
}

describe('hasAnyPermission', () => {
	it('is true when the single required permission is held', () => {
		expect(hasAnyPermission(['assets.manage'], 'assets.manage')).toBe(true);
	});

	it('is false when it is not held', () => {
		expect(hasAnyPermission(['assets.view'], 'assets.manage')).toBe(false);
	});

	it('accepts any one of several required permissions', () => {
		expect(hasAnyPermission(['tickets.view.own'], ['tickets.view', 'tickets.view.own'])).toBe(true);
	});
});

describe('derivePaletteActions', () => {
	it('always offers "go to overview", with no permission required', () => {
		expect(idsOf(ctx())).toEqual(['go-overview']);
	});

	it('offers "new ticket" only with tickets.create', () => {
		expect(idsOf(ctx({ permissions: ['tickets.create'] }))).toContain('new-ticket');
		expect(idsOf(ctx({ permissions: ['tickets.view'] }))).not.toContain('new-ticket');
	});

	it('offers "register asset" only with assets.manage', () => {
		expect(idsOf(ctx({ permissions: ['assets.manage'] }))).toContain('register-asset');
		expect(idsOf(ctx({ permissions: ['assets.view'] }))).not.toContain('register-asset');
	});

	it('offers "go to assets" for any asset read permission', () => {
		expect(idsOf(ctx({ permissions: ['assets.view.own'] }))).toContain('go-assets');
	});

	it('offers "go to service desk" for any ticket read permission', () => {
		expect(idsOf(ctx({ permissions: ['tickets.view.own'] }))).toContain('go-service-desk');
	});

	it('offers "go to directory" only with people.view', () => {
		expect(idsOf(ctx({ permissions: ['people.view'] }))).toContain('go-directory');
		expect(idsOf(ctx())).not.toContain('go-directory');
	});

	it('offers the gallery action outside production only', () => {
		expect(idsOf(ctx({ isProduction: false }))).toContain('go-gallery');
		expect(idsOf(ctx({ isProduction: true }))).not.toContain('go-gallery');
	});

	describe('"assign to me"', () => {
		it('requires tickets.manage, a ticket tag, and a personId all at once', () => {
			expect(
				idsOf(ctx({ permissions: ['tickets.manage'], ticketTag: 'TCK-0001', personId: 'p1' }))
			).toContain('assign-to-me');
		});

		it('is absent without tickets.manage', () => {
			expect(idsOf(ctx({ ticketTag: 'TCK-0001', personId: 'p1' }))).not.toContain('assign-to-me');
		});

		it('is absent off a ticket detail page', () => {
			expect(idsOf(ctx({ permissions: ['tickets.manage'], personId: 'p1' }))).not.toContain(
				'assign-to-me'
			);
		});

		it('is absent without a personId', () => {
			expect(idsOf(ctx({ permissions: ['tickets.manage'], ticketTag: 'TCK-0001' }))).not.toContain(
				'assign-to-me'
			);
		});
	});

	it('every action carries a non-empty label', () => {
		const actions = derivePaletteActions(
			ctx({
				permissions: ['tickets.create', 'assets.manage', 'tickets.manage', 'people.view'],
				ticketTag: 'TCK-0001',
				personId: 'p1',
				isProduction: false
			})
		);
		expect(actions.length).toBeGreaterThan(0);
		for (const action of actions) {
			expect(action.label.length).toBeGreaterThan(0);
		}
	});
});
