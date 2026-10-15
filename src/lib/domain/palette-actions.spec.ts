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

	it('offers "new project" only with projects.manage', () => {
		expect(idsOf(ctx({ permissions: ['projects.manage'] }))).toContain('new-project');
		expect(idsOf(ctx({ permissions: ['projects.view'] }))).not.toContain('new-project');
	});

	it('offers "go to projects" and "go to tasks" for either project read permission', () => {
		for (const permission of ['projects.view', 'projects.view.assigned']) {
			const ids = idsOf(ctx({ permissions: [permission] }));
			expect(ids).toContain('go-projects');
			expect(ids).toContain('go-tasks');
		}
		expect(idsOf(ctx({ permissions: ['assets.view'] }))).not.toContain('go-projects');
	});
});

describe('move-task action (#120)', () => {
	it('is offered with projects.manage while a movable task is open', () => {
		expect(idsOf(ctx({ permissions: ['projects.manage'], movableTaskTag: 'TSK-0001' }))).toContain(
			'move-task'
		);
	});

	it('is absent without projects.manage', () => {
		expect(
			idsOf(ctx({ permissions: ['projects.view'], movableTaskTag: 'TSK-0001' }))
		).not.toContain('move-task');
	});

	it('is absent when no task can be moved (none open, or its project is archived)', () => {
		expect(idsOf(ctx({ permissions: ['projects.manage'], movableTaskTag: null }))).not.toContain(
			'move-task'
		);
		expect(idsOf(ctx({ permissions: ['projects.manage'] }))).not.toContain('move-task');
	});
});

describe('escalate-ticket action (#150)', () => {
	it('is offered with tickets.manage while an escalatable ticket is open', () => {
		expect(
			idsOf(ctx({ permissions: ['tickets.manage'], escalatableTicketTag: 'TCK-0001' }))
		).toContain('escalate-ticket');
	});

	it('is absent without tickets.manage or without an open ticket', () => {
		expect(
			idsOf(ctx({ permissions: ['tickets.view'], escalatableTicketTag: 'TCK-0001' }))
		).not.toContain('escalate-ticket');
		expect(idsOf(ctx({ permissions: ['tickets.manage'] }))).not.toContain('escalate-ticket');
	});
});

describe('link-asset action (#79)', () => {
	it('is offered with tickets.manage while a ticket record is open', () => {
		expect(idsOf(ctx({ permissions: ['tickets.manage'], ticketTag: 'TCK-0001' }))).toContain(
			'link-asset'
		);
	});

	it('is absent without tickets.manage', () => {
		expect(idsOf(ctx({ permissions: ['tickets.view'], ticketTag: 'TCK-0001' }))).not.toContain(
			'link-asset'
		);
	});

	it('is absent away from a ticket record', () => {
		expect(idsOf(ctx({ permissions: ['tickets.manage'] }))).not.toContain('link-asset');
	});
});
