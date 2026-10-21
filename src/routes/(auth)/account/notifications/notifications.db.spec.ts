import { describe, expect, it } from 'vitest';
import { createOrganisation, createViewer } from '#lib/server/assets/testing/fixtures.js';
import type { SessionUser } from '#lib/server/auth/guards.js';
import { getPreferences } from '#lib/server/notifications/index.js';
import { actionEvent, outcomeOf } from '#lib/server/projects/testing/action-event.js';
import { overrideRuntime } from '#lib/server/shared/runtime.js';
import { load as layoutLoad } from '../../+layout.server';
import { actions, load } from './+page.server';

type Loaded = { preferences: { type: string }[]; emailConfigured: boolean };

function loadAs(user: SessionUser) {
	return load({
		locals: { user },
		url: new URL('http://localhost/account/notifications')
	} as never) as Promise<Loaded>;
}

describe('/account/notifications', () => {
	it('lists only the three types an employee can receive', async () => {
		const organisation = await createOrganisation();
		const employee = await createViewer(organisation.id, 'employee', 'Eli Employee');

		const data = await loadAs(employee);

		expect(data.preferences.map((row) => row.type)).toEqual([
			'ticket.replied',
			'ticket.resolved',
			'mention'
		]);
	});

	it('lists every type for staff', async () => {
		const organisation = await createOrganisation();
		const tech = await createViewer(organisation.id, 'technician', 'Tess Tech');

		expect((await loadAs(tech)).preferences).toHaveLength(8);
	});

	it('says whether mail can be sent at all', async () => {
		const organisation = await createOrganisation();
		const tech = await createViewer(organisation.id, 'technician', 'Tess Tech');

		overrideRuntime({ mailer: null });
		expect((await loadAs(tech)).emailConfigured).toBe(false);

		overrideRuntime({ mailer: { send: async () => {} } });
		expect((await loadAs(tech)).emailConfigured).toBe(true);
	});

	it('is reachable with a session, which the other (auth) pages are not', async () => {
		const organisation = await createOrganisation();
		const tech = await createViewer(organisation.id, 'technician', 'Tess Tech');
		const at = (path: string) =>
			outcomeOf(() =>
				layoutLoad({
					locals: { user: tech },
					url: new URL(`http://localhost${path}`)
				} as never)
			);

		expect((await at('/account/notifications')).thrown).toBeUndefined();
		expect((await at('/login')).thrown?.status).toBe(303);
	});

	it('switches one channel off and back on', async () => {
		const organisation = await createOrganisation();
		const employee = await createViewer(organisation.id, 'employee', 'Eli Employee');
		const set = (enabled: string) =>
			outcomeOf(() =>
				actions.set(actionEvent(employee, { type: 'ticket.replied', channel: 'email', enabled }))
			);

		expect((await set('false')).returned).toEqual({ ok: true });
		expect((await getPreferences(employee))[0]).toMatchObject({ email: false });

		await set('true');
		expect((await getPreferences(employee))[0]).toMatchObject({ email: true });
	});

	it('refuses the in-app switch of a direct type, and a type the person cannot receive', async () => {
		const organisation = await createOrganisation();
		const tech = await createViewer(organisation.id, 'technician', 'Tess Tech');
		const employee = await createViewer(organisation.id, 'employee', 'Eli Employee');

		const locked = await outcomeOf(() =>
			actions.set(
				actionEvent(tech, { type: 'ticket.assigned', channel: 'in_app', enabled: 'false' })
			)
		);
		expect(locked.returned).toMatchObject({ status: 409, data: { error: 'locked' } });

		const unavailable = await outcomeOf(() =>
			actions.set(
				actionEvent(employee, { type: 'ticket.assigned', channel: 'email', enabled: 'false' })
			)
		);
		expect(unavailable.returned).toMatchObject({ status: 404, data: { error: 'not_available' } });

		const invalid = await outcomeOf(() =>
			actions.set(actionEvent(tech, { type: 'nope', channel: 'email', enabled: 'false' }))
		);
		expect(invalid.returned).toMatchObject({ status: 400 });
	});
});
