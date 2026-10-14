import { describe, expect, it } from 'vitest';
import { getDb } from '#lib/server/db/index.js';
import { assets } from '#lib/server/assets/index.js';
import {
	createAsset,
	createCatalogue,
	createLocation,
	createOrganisation,
	createPerson,
	createViewer
} from '#lib/server/assets/testing/fixtures.js';
import { load as loadList } from './+page.server';
import { load as loadDetail } from './[tag]/+page.server';
import { load as loadNew } from './new/+page.server';
import { load as loadEdit, actions as editActions } from './[tag]/edit/+page.server';
import type { AssetView } from '#lib/server/assets/index.js';
import type { SessionUser } from '#lib/server/auth/guards.js';
import type { Page } from '#lib/server/shared/pagination.js';

/**
 * What the browser is actually sent. The domain specs prove that
 * `listAssets` redacts; this proves that the *routes* hand the browser nothing
 * but what it returned — the acceptance criterion's "payload delivered to the
 * browser", and the part the Verification section asks to be checked with
 * devtools open. A `load` return value is serialised verbatim into the page
 * data, so `JSON.stringify` of it is the payload.
 *
 * The `load` functions are called directly with the slice of the event they
 * read. They need no SvelteKit runtime: redirects and 404s are exceptions they
 * throw, and the specs assert on those.
 */

type Event<T extends (...args: never[]) => unknown> = Parameters<T>[0];

/**
 * SvelteKit types a `load` as returning `Record<string, any>` (or nothing at
 * all), which would turn every assertion below into one about `any`. The
 * shapes the screens actually rely on are restated here, so a spec that reads
 * `data.result.rows` is checked against the domain's real types.
 */
interface ListData {
	result: Page<AssetView>;
	seesWholeInventory: boolean;
	canManage: boolean;
}

interface DetailData {
	asset: AssetView;
	/** Unawaited by `load` (#89, streaming): the rail resolves after the critical payload above. */
	timelineRail: Promise<{ timeline: unknown[] | null; recentTickets: number }>;
	canManage: boolean;
	canCheckout: boolean;
	people: unknown[];
	locations: unknown[];
}

const loaded = async <T>(run: unknown): Promise<T> => (await run) as T;

const listEvent = (user: SessionUser | null, query = ''): Event<typeof loadList> =>
	({ locals: { user }, url: new URL(`http://localhost/assets${query}`) }) as Event<typeof loadList>;

const detailEvent = (user: SessionUser | null, tag: string): Event<typeof loadDetail> =>
	({ locals: { user }, params: { tag } }) as Event<typeof loadDetail>;

/** An organisation with: a shared printer, Eva's laptop, and somebody else's laptop. */
async function floor() {
	const organisation = await createOrganisation();
	const eva = await createViewer(organisation.id, 'employee', 'Eva Employee');
	const grace = await createPerson(organisation.id, 'Grace Hopper');
	const { modelId } = await createCatalogue(organisation.id, 'LaserJet 400', 'HP', 'Printers');
	const lobby = await createLocation(organisation.id, 'Lobby');

	const printer = await createAsset(organisation.id, modelId, {
		name: 'Floor printer',
		assetTag: 'AST-0001',
		serial: 'SECRET-PRINTER-SERIAL',
		shared: true,
		locationId: lobby.id,
		state: 'in_use'
	});
	const evaLaptop = await createAsset(organisation.id, modelId, {
		name: 'Eva laptop',
		assetTag: 'AST-0002',
		serial: 'EVA-OWN-SERIAL',
		custodianPersonId: eva.personId
	});
	const graceLaptop = await createAsset(organisation.id, modelId, {
		name: 'Grace laptop',
		assetTag: 'AST-0003',
		serial: 'GRACE-PRIVATE-SERIAL',
		custodianPersonId: grace.id
	});

	return { organisation, eva, printer, evaLaptop, graceLaptop };
}

describe('the list an employee is sent', () => {
	it('carries their own equipment in full and nothing of anybody else’s', async () => {
		const { eva } = await floor();

		const data = await loaded<ListData>(loadList(listEvent(eva)));
		const wire = JSON.stringify(data);

		expect(wire).toContain('EVA-OWN-SERIAL');
		expect(wire).not.toContain('GRACE-PRIVATE-SERIAL');
		expect(data.result.total).toBe(2);
	});

	it('gives a shared row exactly four keys: no serial, custody, model, state or id', async () => {
		const { eva } = await floor();

		const data = await loaded<ListData>(loadList(listEvent(eva)));
		const printer = data.result.rows.find((row) => row.assetTag === 'AST-0001');

		expect(printer).toBeDefined();
		expect(Object.keys(printer!).sort()).toEqual([
			'assetTag',
			'locationName',
			'name',
			'visibility'
		]);
		expect(JSON.stringify(data)).not.toContain('SECRET-PRINTER-SERIAL');
	});

	it('does not let a search confirm what the row would not show', async () => {
		const { eva } = await floor();

		// Searching somebody else's serial must not reveal that it exists…
		const theirs = await loaded<ListData>(loadList(listEvent(eva, '?q=GRACE-PRIVATE-SERIAL')));
		expect(theirs.result.total).toBe(0);

		// …nor the shared printer's, which the shared view does not disclose.
		const printer = await loaded<ListData>(loadList(listEvent(eva, '?q=SECRET-PRINTER-SERIAL')));
		expect(printer.result.total).toBe(0);
	});
});

describe('the page an employee is sent for one asset', () => {
	it('is name, tag and location for a shared asset, and no history', async () => {
		const { eva } = await floor();

		const data = await loaded<DetailData>(loadDetail(detailEvent(eva, 'AST-0001')));

		expect(Object.keys(data.asset).sort()).toEqual([
			'assetTag',
			'locationName',
			'name',
			'visibility'
		]);
		expect((await data.timelineRail).timeline).toBeNull();
		expect(JSON.stringify(data)).not.toContain('SECRET-PRINTER-SERIAL');
	});

	it('is the whole asset, and its history, for equipment they hold', async () => {
		const { eva } = await floor();

		const data = await loaded<DetailData>(loadDetail(detailEvent(eva, 'AST-0002')));

		expect(data.asset).toMatchObject({ visibility: 'full', serial: 'EVA-OWN-SERIAL' });
		expect((await data.timelineRail).timeline).not.toBeNull();
	});

	it('is a 404 for somebody else’s equipment, as if it did not exist', async () => {
		const { eva } = await floor();

		await expect(loadDetail(detailEvent(eva, 'AST-0003'))).rejects.toMatchObject({ status: 404 });
		await expect(loadDetail(detailEvent(eva, 'AST-9999'))).rejects.toMatchObject({ status: 404 });
	});

	it('offers an employee no people and no locations to pick from', async () => {
		const { eva } = await floor();

		const data = await loaded<DetailData>(loadDetail(detailEvent(eva, 'AST-0002')));

		expect(data.canManage).toBe(false);
		expect(data.canCheckout).toBe(false);
		expect(data.people).toEqual([]);
		expect(data.locations).toEqual([]);
	});
});

describe('the screens an employee cannot reach', () => {
	it.each([['/assets/new', () => loadNew({ locals: { user: null } } as Event<typeof loadNew>)]])(
		'redirects an anonymous visitor away from %s',
		async (_path, run) => {
			await expect(run()).rejects.toMatchObject({ status: 303 });
		}
	);

	it('answers 404 for the registering and edit screens', async () => {
		const { eva } = await floor();

		await expect(loadNew({ locals: { user: eva } } as Event<typeof loadNew>)).rejects.toMatchObject(
			{
				status: 404
			}
		);
		await expect(
			loadEdit({ locals: { user: eva }, params: { tag: 'AST-0002' } } as Event<typeof loadEdit>)
		).rejects.toMatchObject({ status: 404 });
	});
});

interface NewFormData {
	form: { errors: Record<string, unknown> };
	modelForm: { errors: Record<string, unknown> };
}

describe('the register form a technician is sent', () => {
	it('carries no validation errors on first load, in any language', async () => {
		// `load` seeds the asset form with `{ state: 'in_stock' }` so the select
		// starts on a real value. Superforms treats any seed data as "posted",
		// which — unless `errors: false` is set — validates it immediately and
		// ships Zod's English sentences (`Too small: expected string to have
		// >=1 characters`, `Invalid UUID`) as `$errors.name` / `$errors.assetModelId`
		// before the visitor has touched the form. `AssetFields` renders
		// `error={$errors.name?.[0]}` unconditionally, so this is the exact seam
		// that painted the leaked English on `/assets/new`.
		const { organisation } = await floor();
		const technician = await createViewer(organisation.id, 'technician', 'Grace Technician');

		const data = await loaded<NewFormData>(
			loadNew({ locals: { user: technician } } as Event<typeof loadNew>)
		);

		expect(data.form.errors).toEqual({});
		expect(data.modelForm.errors).toEqual({});
	});

	it('answers in Spanish, not raw Zod, for a blank Name/Model submitted to the edit action', async () => {
		// Same leak, other form surface (issue #102's "Done when" asks for
		// both): `editActions.default` runs `targetOf` — a real database read —
		// before validating the form, so this one needs the `floor()` fixture
		// and belongs in the DB project, not alongside the plain action specs.
		const { organisation } = await floor();
		const technician = await createViewer(organisation.id, 'technician', 'Grace Technician');

		const fd = new FormData();
		fd.set('name', '');
		const request = new Request('http://localhost/assets/AST-0001/edit', {
			method: 'POST',
			body: fd
		});

		const result = (await editActions.default({
			request,
			locals: { user: technician },
			params: { tag: 'AST-0001' }
		} as Event<typeof editActions.default>)) as unknown as {
			status: number;
			data: { form: { errors: Record<string, string[]> } };
		};

		expect(result.status).toBe(400);
		expect(result.data.form.errors.name).toEqual(['Escribe un nombre.']);
		expect(result.data.form.errors.assetModelId).toEqual(['Elige un modelo.']);
		expect(JSON.stringify(result)).not.toContain('Too small');
	});
});

describe('the list a technician is sent', () => {
	it('is the whole inventory, with every column filled', async () => {
		const { organisation } = await floor();
		const technician = await createViewer(organisation.id, 'technician', 'Grace Technician');

		const data = await loaded<ListData>(loadList(listEvent(technician)));

		expect(data.result.total).toBe(3);
		expect(data.seesWholeInventory).toBe(true);
		expect(data.canManage).toBe(true);
		expect(data.result.rows.every((row) => row.visibility === 'full')).toBe(true);
	});

	it('pages on the server and reports the total', async () => {
		const { organisation, printer } = await floor();
		const technician = await createViewer(organisation.id, 'technician', 'Grace Technician');
		for (let index = 4; index <= 30; index += 1) {
			await createAsset(organisation.id, printer.assetModelId, {
				name: `Extra ${index}`,
				assetTag: `AST-${String(index).padStart(4, '0')}`
			});
		}

		const first = await loaded<ListData>(loadList(listEvent(technician)));
		const second = await loaded<ListData>(loadList(listEvent(technician, '?page=2')));

		expect(first.result.rows).toHaveLength(25);
		expect(first.result.total).toBe(30);
		expect(second.result.rows).toHaveLength(5);
		expect(second.result.rows[0].assetTag).toBe('AST-0026');
		expect(await getDb().$count(assets)).toBe(30);
	});
});
