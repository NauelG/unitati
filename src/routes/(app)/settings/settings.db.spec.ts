import { describe, expect, it } from 'vitest';
import {
	createProject,
	createState,
	createTask,
	deleteState,
	listStatesWithTaskCount
} from '#lib/server/projects/index.js';
import { createWorkspace, statesByGroup } from '#lib/server/projects/testing/fixtures.js';
import { createPageRow } from '#lib/server/knowledge/testing/fixtures.js';
import type { SessionUser } from '#lib/server/auth/guards.js';
import { visibleSections } from '#lib/settings/sections.js';
import { load as loadSettings } from './+layout.server';
import { load as loadStates, actions } from './projects/states/+page.server';
import { load as loadModels } from './assets/models/+page.server';
import { load as loadCategories } from './assets/categories/+page.server';
import { load as loadManufacturers } from './assets/manufacturers/+page.server';
import { load as loadLocations, actions as locationActions } from './assets/locations/+page.server';
import {
	load as loadHandover,
	actions as handoverActions
} from './assets/handover-agreements/+page.server';
import { load as loadLabels, actions as labelActions } from './assets/labels/+page.server';
import { load as loadQueues } from './service-desk/queues/+page.server';
import { load as loadKnowledge, actions as knowledgeActions } from './knowledge/+page.server';
import { load as loadBranding, actions as brandingActions } from './platform/branding/+page.server';

/**
 * The Settings screens' server seam: who gets in, what the catalogue screen is
 * sent, and what each action answers. Called directly with the slice of the
 * event they read, like `assets/payload.db.spec.ts`; the rules themselves
 * (group immutable, occupied/last-open refusals) are the domain's and are
 * proved in `states.db.spec.ts` — here we prove the screen exposes them.
 */

const event = (user: SessionUser | null, fields: Record<string, string> = {}) =>
	({
		locals: { user },
		url: new URL('http://localhost/settings'),
		request: new Request('http://localhost/settings/projects/states', {
			method: 'POST',
			body: new URLSearchParams(fields)
		})
	}) as never;

async function statusOf(run: () => unknown): Promise<number | undefined> {
	try {
		await run();
	} catch (thrown) {
		return (thrown as { status?: number }).status;
	}
	return undefined;
}

type Refusal = { status: number; data: { action: string; message: string; id: string | null } };

describe('/settings access', () => {
	it('answers 403 on /settings to a viewer who can see no section', async () => {
		const { employee } = await createWorkspace();

		expect(await statusOf(() => loadSettings(event(employee)))).toBe(403);
	});

	it('answers 403 on the project-state catalogue to the employee, for the load and for every action', async () => {
		const { employee } = await createWorkspace();

		expect(await statusOf(() => loadStates(event(employee)))).toBe(403);
		for (const name of ['create', 'rename', 'reorder', 'delete'] as const) {
			expect(await statusOf(() => actions[name](event(employee)))).toBe(403);
		}
	});

	it('lets a technician in', async () => {
		const { technician } = await createWorkspace();

		expect(await statusOf(() => loadSettings(event(technician)))).toBeUndefined();
		expect(await statusOf(() => loadStates(event(technician)))).toBeUndefined();
	});
});

describe('the moved catalogues (#126)', () => {
	it('answers 403 to an employee on each of them', async () => {
		const { employee } = await createWorkspace();

		for (const load of [loadModels, loadCategories, loadManufacturers, loadQueues]) {
			expect(await statusOf(() => load(event(employee)))).toBe(403);
		}
	});

	it('lets a technician open each of them', async () => {
		const { technician } = await createWorkspace();

		for (const load of [loadModels, loadCategories, loadManufacturers, loadQueues]) {
			expect(await statusOf(() => load(event(technician)))).toBeUndefined();
		}
	});
});

describe('/settings/assets/handover-agreements', () => {
	it('answers 403 to an employee, for the load and for every action', async () => {
		const { employee } = await createWorkspace();

		expect(await statusOf(() => loadHandover(event(employee)))).toBe(403);
		for (const name of ['save', 'removeOverride', 'linkDays'] as const) {
			expect(await statusOf(() => handoverActions[name](event(employee)))).toBe(403);
		}
	});

	it('saves a template, its flag and the link validity for a technician', async () => {
		const { technician } = await createWorkspace();

		await handoverActions.save(
			event(technician, { direction: 'delivery', categoryId: '', body: 'Texto' })
		);
		await handoverActions.linkDays(event(technician, { days: '30' }));

		const page = (await loadHandover(event(technician))) as {
			agreements: { versions: { body: string }[] }[];
			linkValidDays: number;
			missingGlobals: string[];
		};
		expect(page.agreements[0].versions[0].body).toBe('Texto');
		expect(page.linkValidDays).toBe(30);
		expect(page.missingGlobals).toEqual(['return']);
	});
});

describe('/settings/assets/labels', () => {
	it('answers 403 to an employee, for the load and for the action', async () => {
		const { employee } = await createWorkspace();

		expect(await statusOf(() => loadLabels(event(employee)))).toBe(403);
		expect(await statusOf(() => labelActions.save(event(employee, { ownerText: 'Mine' })))).toBe(
			403
		);
	});

	it('saves the owner line for a technician and clears it back to the default', async () => {
		const { technician } = await createWorkspace();
		expect(await loadLabels(event(technician))).toMatchObject({ ownerText: null });

		expect(await labelActions.save(event(technician, { ownerText: ' Acme IT ' }))).toEqual({
			saved: true,
			ownerText: 'Acme IT'
		});
		expect(await loadLabels(event(technician))).toMatchObject({ ownerText: 'Acme IT' });

		await labelActions.save(event(technician, { ownerText: '' }));
		expect(await loadLabels(event(technician))).toMatchObject({ ownerText: null });
	});

	it('refuses a line that is too long with the typed text echoed back', async () => {
		const { technician } = await createWorkspace();
		const long = 'x'.repeat(61);

		const refused = (await labelActions.save(event(technician, { ownerText: long }))) as {
			status: number;
			data: { ownerText: string; error: string };
		};

		expect(refused.status).toBe(400);
		expect(refused.data.ownerText).toBe(long);
		expect(refused.data.error).not.toBe('');
	});
});

describe('/settings/assets/locations', () => {
	it('answers 403 to an employee, for the load and for every action', async () => {
		const { employee } = await createWorkspace();

		expect(await statusOf(() => loadLocations(event(employee)))).toBe(403);
		for (const name of ['create', 'update', 'delete'] as const) {
			expect(await statusOf(() => locationActions[name](event(employee)))).toBe(403);
		}
	});

	it('lets a technician in, and the section is visible for assets.manage only', async () => {
		const { technician } = await createWorkspace();

		expect(await statusOf(() => loadLocations(event(technician)))).toBeUndefined();
		for (const name of ['create', 'update', 'delete'] as const) {
			expect(await statusOf(() => locationActions[name](event(technician)))).not.toBe(403);
		}

		const hrefs = (permissions: string[]) =>
			visibleSections(permissions).map((section) => section.href);
		expect(hrefs(['assets.manage'])).toContain('/settings/assets/locations');
		expect(hrefs(['assets.view', 'tickets.manage', 'projects.manage'])).not.toContain(
			'/settings/assets/locations'
		);
	});

	it('creates, nests and lists a location, then refuses to delete it while it is in use', async () => {
		const { technician } = await createWorkspace();

		const created = await locationActions.create(
			event(technician, {
				name: 'Barcelona office',
				code: 'BCN',
				latitude: '41,3874',
				longitude: '2,1686'
			})
		);
		expect(created).toMatchObject({ action: 'create', message: null });

		const [root] = ((await loadLocations(event(technician))) as { locations: { id: string }[] })
			.locations;
		await locationActions.create(event(technician, { name: 'Floor 1', parentId: root.id }));

		const loaded = (await loadLocations(event(technician))) as {
			locations: { path: string; depth: number; assets: number; latitude: number | null }[];
		};
		expect(loaded.locations.map((entry) => [entry.path, entry.depth, entry.assets])).toEqual([
			['Barcelona office', 0, 0],
			['Barcelona office › Floor 1', 1, 0]
		]);
		expect(loaded.locations[0].latitude).toBe(41.3874);

		const refusal = (await locationActions.delete(
			event(technician, { id: root.id })
		)) as unknown as Refusal;
		expect(refusal.data.message).toBe('No se puede eliminar: tiene 1 ubicación hija.');
	});

	it('answers a duplicate on the field it belongs to', async () => {
		const { technician } = await createWorkspace();
		await locationActions.create(event(technician, { name: 'HQ', code: 'HQ' }));

		const refusal = (await locationActions.create(
			event(technician, { name: 'HQ 2', code: 'HQ' })
		)) as unknown as { data: { errors: Record<string, string> } };
		expect(Object.keys(refusal.data.errors)).toEqual(['code']);
	});
});

describe('/settings/platform/branding', () => {
	it('answers 403 to a technician, for the load and for the action', async () => {
		const { technician } = await createWorkspace();

		expect(await statusOf(() => loadBranding(event(technician)))).toBe(403);
		expect(
			await statusOf(() => brandingActions.save(event(technician, { productName: 'Acme Desk' })))
		).toBe(403);
	});

	it('lets an administrator open it and rename the product', async () => {
		const { admin } = await createWorkspace();

		expect(await statusOf(() => loadBranding(event(admin)))).toBeUndefined();
		const saved = await brandingActions.save(event(admin, { productName: 'Acme Desk' }));

		expect(saved).toEqual({ saved: true, productName: 'Acme Desk' });
	});

	it('refuses an invalid name with the typed text echoed back', async () => {
		const { admin } = await createWorkspace();

		const refused = (await brandingActions.save(event(admin, { productName: '   ' }))) as {
			status: number;
			data: { productName: string; error: string };
		};

		expect(refused.status).toBe(400);
		expect(refused.data.productName).toBe('   ');
	});
});

describe('/settings/projects/states', () => {
	it('sends the catalogue in board order with each state’s task count', async () => {
		const { technician, organisation } = await createWorkspace();
		const { backlog } = await statesByGroup(organisation.id);
		const project = await createProject(technician, { name: 'Move' });
		if (!project.ok) throw new Error('setup');
		await createTask(technician, project.value.id, { title: 'Pack', stateId: backlog.id });

		const data = (await loadStates(event(technician))) as {
			states: { id: string; group: string; taskCount: number }[];
		};

		expect(data.states.map((state) => state.group)).toEqual([
			'backlog',
			'unstarted',
			'started',
			'completed',
			'cancelled'
		]);
		expect(data.states.find((state) => state.id === backlog.id)?.taskCount).toBe(1);
	});

	it('creates a state in the chosen group', async () => {
		const { technician } = await createWorkspace();

		await actions.create(event(technician, { name: 'In review', group: 'started' }));

		const created = (await listStatesWithTaskCount(technician)).find((s) => s.name === 'In review');
		expect(created?.group).toBe('started');
	});

	it('refuses a create with an unknown group', async () => {
		const { technician } = await createWorkspace();

		const refused = (await actions.create(
			event(technician, { name: 'Odd', group: 'sideways' })
		)) as Refusal;

		expect(refused.status).toBe(400);
		expect(refused.data.action).toBe('create');
	});

	it('renames a state and cannot change its group, even when asked', async () => {
		const { technician, organisation } = await createWorkspace();
		const { started } = await statesByGroup(organisation.id);

		await actions.rename(event(technician, { id: started.id, name: 'Doing', group: 'completed' }));

		const renamed = (await listStatesWithTaskCount(technician)).find((s) => s.id === started.id);
		expect(renamed?.name).toBe('Doing');
		expect(renamed?.group).toBe('started');
	});

	it('moves a state down and up inside its group', async () => {
		const { technician } = await createWorkspace();
		const first = await createState(technician, { name: 'First', group: 'started' });
		const second = await createState(technician, { name: 'Second', group: 'started' });
		if (!first.ok || !second.ok) throw new Error('setup');
		const namesInStarted = async () =>
			(await listStatesWithTaskCount(technician))
				.filter((state) => state.group === 'started')
				.map((state) => state.name);
		const before = await namesInStarted();

		await actions.reorder(event(technician, { id: first.value.id, direction: 'down' }));
		const afterDown = await namesInStarted();
		await actions.reorder(event(technician, { id: first.value.id, direction: 'up' }));

		expect(afterDown).toEqual([before[0], 'Second', 'First']);
		expect(await namesInStarted()).toEqual(before);
	});

	it('does nothing when asked to move past a group boundary', async () => {
		const { technician, organisation } = await createWorkspace();
		const { completed } = await statesByGroup(organisation.id);
		const before = (await listStatesWithTaskCount(technician)).map((state) => state.id);

		await actions.reorder(event(technician, { id: completed.id, direction: 'up' }));
		await actions.reorder(event(technician, { id: completed.id, direction: 'down' }));

		expect((await listStatesWithTaskCount(technician)).map((state) => state.id)).toEqual(before);
	});

	it('deletes an empty state', async () => {
		const { technician } = await createWorkspace();
		const extra = await createState(technician, { name: 'Extra', group: 'started' });
		if (!extra.ok) throw new Error('setup');

		await actions.delete(event(technician, { id: extra.value.id }));

		expect(
			(await listStatesWithTaskCount(technician)).some((state) => state.id === extra.value.id)
		).toBe(false);
	});

	it('refuses to delete an occupied state, naming the task count, and keeps it', async () => {
		const { technician, organisation } = await createWorkspace();
		const { backlog } = await statesByGroup(organisation.id);
		const project = await createProject(technician, { name: 'Move' });
		if (!project.ok) throw new Error('setup');
		for (const title of ['Pack', 'Label', 'Ship'])
			await createTask(technician, project.value.id, { title, stateId: backlog.id });

		const refused = (await actions.delete(event(technician, { id: backlog.id }))) as Refusal;

		expect(refused.status).toBe(400);
		expect(refused.data.id).toBe(backlog.id);
		expect(refused.data.message).toContain('3');
		expect((await listStatesWithTaskCount(technician)).some((s) => s.id === backlog.id)).toBe(true);
	});

	it('refuses to delete the last state a new task could land in, and keeps it', async () => {
		const { technician, organisation } = await createWorkspace();
		const { backlog, unstarted, started } = await statesByGroup(organisation.id);
		await deleteState(technician, backlog.id);
		await deleteState(technician, unstarted.id);

		const refused = (await actions.delete(event(technician, { id: started.id }))) as Refusal;

		expect(refused.status).toBe(400);
		expect(refused.data.message).not.toBe('');
		expect((await listStatesWithTaskCount(technician)).some((s) => s.id === started.id)).toBe(true);
	});
});

describe('/settings/knowledge', () => {
	const fields = {
		name: 'Ayuda',
		description: '',
		icon: 'life-buoy',
		colour: 'teal',
		audience: 'portal'
	};

	it('answers 403 to a technician and an employee, for the load and for every action', async () => {
		const { technician, employee } = await createWorkspace();

		for (const user of [technician, employee]) {
			expect(await statusOf(() => loadKnowledge(event(user)))).toBe(403);
			for (const name of ['create', 'preview', 'update', 'archive', 'delete'] as const) {
				expect(await statusOf(() => knowledgeActions[name](event(user)))).toBe(403);
			}
		}
	});

	it('lets an admin in, and creates, lists, previews, changes the audience, archives and deletes', async () => {
		const { admin, organisation } = await createWorkspace();

		const created = (await knowledgeActions.create(event(admin, fields))) as { action: string };
		expect(created.action).toBe('create');
		const loaded = (await loadKnowledge(event(admin))) as unknown as {
			spaces: { id: string; name: string }[];
		};
		expect(loaded.spaces.map((space) => space.name)).toEqual(['Ayuda']);
		const id = loaded.spaces[0].id;
		await createPageRow(organisation.id, id, { publishedAt: new Date() });

		const previewed = (await knowledgeActions.preview(event(admin, { id, audience: 'staff' }))) as {
			count: number;
		};
		expect(previewed.count).toBe(1);

		const stale = (await knowledgeActions.update(
			event(admin, { ...fields, id, audience: 'staff', confirmedCount: '7' })
		)) as Refusal;
		expect(stale.status).toBe(400);
		expect(stale.data.id).toBe(id);

		const missing = (await knowledgeActions.update(
			event(admin, { ...fields, id, audience: 'staff' })
		)) as Refusal;
		expect(missing.status).toBe(400);

		const updated = (await knowledgeActions.update(
			event(admin, { ...fields, id, name: 'Soporte', audience: 'staff', confirmedCount: '1' })
		)) as { action: string };
		expect(updated.action).toBe('update');

		const occupied = (await knowledgeActions.delete(event(admin, { id }))) as Refusal;
		expect(occupied.status).toBe(400);

		expect(
			((await knowledgeActions.archive(event(admin, { id }))) as { action: string }).action
		).toBe('archive');
		const archived = (await loadKnowledge({
			locals: { user: admin },
			url: new URL('http://localhost/settings/knowledge?archived=1')
		} as never)) as unknown as { spaces: { name: string; audience: string }[] };
		expect(archived.spaces).toMatchObject([{ name: 'Soporte', audience: 'staff' }]);
	});

	it('refuses an icon outside the closed set on the field it belongs to', async () => {
		const { admin } = await createWorkspace();

		const refused = (await knowledgeActions.create(event(admin, { ...fields, icon: 'skull' }))) as {
			status: number;
			data: { errors: Record<string, string> };
		};

		expect(refused.status).toBe(400);
		expect(Object.keys(refused.data.errors)).toEqual(['icon']);
	});

	it('refuses a duplicate name on the name field', async () => {
		const { admin } = await createWorkspace();
		await knowledgeActions.create(event(admin, fields));

		const refused = (await knowledgeActions.create(event(admin, fields))) as {
			data: { errors: Record<string, string> };
		};

		expect(Object.keys(refused.data.errors)).toEqual(['name']);
	});
});
