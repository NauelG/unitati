import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { getDb } from '../db';
import { people } from '../directory/schema';
import {
	addNote,
	assetTimeline,
	assignCustody,
	changeLocation,
	changeState,
	listAssets,
	registerAsset,
	returnCustody,
	type AssetView
} from '.';
import { assets } from './schema';
import {
	createAsset,
	createCatalogue,
	createLocation,
	createOrganisation,
	createPerson,
	createViewer
} from './testing/fixtures';

/**
 * The asset lifecycle and the history it writes: the acceptance criteria of #7
 * that need rows rather than a screen.
 *
 * The screens themselves, `AssetTimeline` and the seed are PR 3; what is proved
 * here is that the data those screens will render is correct, which is the half
 * that cannot be checked by looking.
 */

/** Narrows a row the way a caller with full visibility would, and says so loudly
 * if the redaction unexpectedly applied. */
function full(row: AssetView | undefined) {
	if (row?.visibility !== 'full') {
		throw new Error(`expected a full row, got ${row?.visibility ?? 'nothing'}`);
	}
	return row;
}

async function workspace() {
	const organisation = await createOrganisation();
	const { modelId } = await createCatalogue(organisation.id);
	const technician = await createViewer(organisation.id, 'technician', 'Grace Hopper');

	return { organisation, modelId, technician };
}

/**
 * The first acceptance criterion, minus its screen: a technician registers an
 * asset, assigns it to a person, and takes it back. Three events, newest first.
 */
describe('register, assign, return', () => {
	it('leaves three events on the timeline, newest first', async () => {
		const { organisation, modelId, technician } = await workspace();
		const ada = await createPerson(organisation.id, 'Ada Lovelace');

		const registered = await registerAsset(technician, {
			name: 'A laptop',
			assetModelId: modelId
		});
		if (!registered.ok) throw new Error(registered.error);

		await assignCustody(technician, registered.value.id, ada.id);
		await returnCustody(technician, registered.value.id);

		const timeline = await assetTimeline(technician, registered.value.assetTag);
		if (!timeline.ok) throw new Error(timeline.error);

		expect(timeline.value.map((entry) => entry.verb)).toEqual([
			'custody.returned',
			'custody.assigned',
			'asset.created'
		]);
	});

	it('records who the asset went to, by id and by name', async () => {
		const { organisation, modelId, technician } = await workspace();
		const ada = await createPerson(organisation.id, 'Ada Lovelace');
		const registered = await registerAsset(technician, { name: 'A laptop', assetModelId: modelId });
		if (!registered.ok) throw new Error(registered.error);

		await assignCustody(technician, registered.value.id, ada.id);

		const timeline = await assetTimeline(technician, registered.value.assetTag);
		const assigned = timeline.ok
			? timeline.value.find((entry) => entry.verb === 'custody.assigned')
			: undefined;

		expect(assigned?.verb === 'custody.assigned' ? assigned.payload : null).toEqual({
			toPersonId: ada.id,
			toPersonName: 'Ada Lovelace'
		});
	});

	it('sets and clears the custodian on the asset itself', async () => {
		const { organisation, modelId, technician } = await workspace();
		const ada = await createPerson(organisation.id, 'Ada Lovelace');
		const registered = await registerAsset(technician, { name: 'A laptop', assetModelId: modelId });
		if (!registered.ok) throw new Error(registered.error);

		await assignCustody(technician, registered.value.id, ada.id);
		const held = await getDb()
			.select({ custodian: assets.custodianPersonId })
			.from(assets)
			.where(eq(assets.id, registered.value.id));

		await returnCustody(technician, registered.value.id);
		const freed = await getDb()
			.select({ custodian: assets.custodianPersonId })
			.from(assets)
			.where(eq(assets.id, registered.value.id));

		expect([held[0].custodian, freed[0].custodian]).toEqual([ada.id, null]);
	});

	it('refuses to take back an asset nobody holds', async () => {
		const { modelId, technician } = await workspace();
		const registered = await registerAsset(technician, { name: 'A laptop', assetModelId: modelId });
		if (!registered.ok) throw new Error(registered.error);

		const result = await returnCustody(technician, registered.value.id);

		expect(result).toEqual({ ok: false, error: 'not_in_custody' });
	});

	it('refuses to assign an asset to somebody in another organisation', async () => {
		const { modelId, technician } = await workspace();
		const globex = await createOrganisation('Globex', 'globex');
		const outsider = await createPerson(globex.id, 'Grace Outside');
		const registered = await registerAsset(technician, { name: 'A laptop', assetModelId: modelId });
		if (!registered.ok) throw new Error(registered.error);

		const result = await assignCustody(technician, registered.value.id, outsider.id);

		expect(result).toEqual({ ok: false, error: 'person_not_found' });
	});
});

/**
 * The acceptance criterion about snapshots, and the reason ADR 0009 stores an
 * identifier *and* a name: a record of the past that changes is not an audit
 * trail.
 */
describe('a custody entry survives its person’s rename', () => {
	it('still says the name it was assigned under', async () => {
		const { organisation, modelId, technician } = await workspace();
		const ada = await createPerson(organisation.id, 'Ada Lovelace');
		const registered = await registerAsset(technician, { name: 'A laptop', assetModelId: modelId });
		if (!registered.ok) throw new Error(registered.error);
		await assignCustody(technician, registered.value.id, ada.id);

		await getDb().update(people).set({ fullName: 'Ada Byron' }).where(eq(people.id, ada.id));

		const timeline = await assetTimeline(technician, registered.value.assetTag);
		const assigned = timeline.ok
			? timeline.value.find((entry) => entry.verb === 'custody.assigned')
			: undefined;

		expect(assigned?.verb === 'custody.assigned' ? assigned.payload.toPersonName : null).toBe(
			'Ada Lovelace'
		);
	});

	it('keeps the identifier pointing at the renamed person, so the link still works', async () => {
		const { organisation, modelId, technician } = await workspace();
		const ada = await createPerson(organisation.id, 'Ada Lovelace');
		const registered = await registerAsset(technician, { name: 'A laptop', assetModelId: modelId });
		if (!registered.ok) throw new Error(registered.error);
		await assignCustody(technician, registered.value.id, ada.id);

		await getDb().update(people).set({ fullName: 'Ada Byron' }).where(eq(people.id, ada.id));

		const timeline = await assetTimeline(technician, registered.value.assetTag);
		const assigned = timeline.ok
			? timeline.value.find((entry) => entry.verb === 'custody.assigned')
			: undefined;

		expect(assigned?.verb === 'custody.assigned' ? assigned.payload.toPersonId : null).toBe(ada.id);
	});
});

describe('state changes', () => {
	it('records what the state was and what it became', async () => {
		const { modelId, technician } = await workspace();
		const registered = await registerAsset(technician, { name: 'A laptop', assetModelId: modelId });
		if (!registered.ok) throw new Error(registered.error);

		await changeState(technician, registered.value.id, 'in_repair');

		const timeline = await assetTimeline(technician, registered.value.assetTag);
		const changed = timeline.ok
			? timeline.value.find((entry) => entry.verb === 'state.changed')
			: undefined;

		expect(changed?.verb === 'state.changed' ? changed.payload : null).toEqual({
			from: 'in_stock',
			to: 'in_repair'
		});
	});

	/** A timeline full of entries saying nothing happened is a timeline nobody reads. */
	it('writes nothing when the state is already the one asked for', async () => {
		const { modelId, technician } = await workspace();
		const registered = await registerAsset(technician, { name: 'A laptop', assetModelId: modelId });
		if (!registered.ok) throw new Error(registered.error);

		await changeState(technician, registered.value.id, 'in_stock');

		const timeline = await assetTimeline(technician, registered.value.assetTag);

		expect(timeline.ok ? timeline.value.map((entry) => entry.verb) : []).toEqual(['asset.created']);
	});

	/** The two axes do not constrain each other, through the domain as well as in
	 * the schema: an asset keeps its custodian across a state change. */
	it('leaves custody alone', async () => {
		const { organisation, modelId, technician } = await workspace();
		const ada = await createPerson(organisation.id, 'Ada Lovelace');
		const registered = await registerAsset(technician, { name: 'A laptop', assetModelId: modelId });
		if (!registered.ok) throw new Error(registered.error);
		await assignCustody(technician, registered.value.id, ada.id);

		await changeState(technician, registered.value.id, 'in_repair');

		const [row] = await getDb()
			.select({ state: assets.state, custodian: assets.custodianPersonId })
			.from(assets)
			.where(eq(assets.id, registered.value.id));

		expect(row).toEqual({ state: 'in_repair', custodian: ada.id });
	});
});

describe('location changes', () => {
	it('records both ends, each of which may be nothing', async () => {
		const { organisation, modelId, technician } = await workspace();
		const floor = await createLocation(organisation.id, 'Planta 2');
		const registered = await registerAsset(technician, { name: 'A laptop', assetModelId: modelId });
		if (!registered.ok) throw new Error(registered.error);

		await changeLocation(technician, registered.value.id, floor.id);

		const timeline = await assetTimeline(technician, registered.value.assetTag);
		const moved = timeline.ok
			? timeline.value.find((entry) => entry.verb === 'location.changed')
			: undefined;

		expect(moved?.verb === 'location.changed' ? moved.payload : null).toEqual({
			fromLocationId: null,
			fromLocationName: null,
			toLocationId: floor.id,
			toLocationName: 'Planta 2'
		});
	});

	it('refuses a location from another organisation', async () => {
		const { modelId, technician } = await workspace();
		const globex = await createOrganisation('Globex', 'globex');
		const elsewhere = await createLocation(globex.id, 'Another building');
		const registered = await registerAsset(technician, { name: 'A laptop', assetModelId: modelId });
		if (!registered.ok) throw new Error(registered.error);

		const result = await changeLocation(technician, registered.value.id, elsewhere.id);

		expect(result).toEqual({ ok: false, error: 'location_not_found' });
	});
});

describe('notes', () => {
	it('puts free text on the timeline', async () => {
		const { modelId, technician } = await workspace();
		const registered = await registerAsset(technician, { name: 'A laptop', assetModelId: modelId });
		if (!registered.ok) throw new Error(registered.error);

		await addNote(technician, registered.value.id, '  Keyboard replaced under warranty  ');

		const timeline = await assetTimeline(technician, registered.value.assetTag);
		const note = timeline.ok
			? timeline.value.find((entry) => entry.verb === 'note.added')
			: undefined;

		expect(note?.verb === 'note.added' ? note.payload.text : null).toBe(
			'Keyboard replaced under warranty'
		);
	});

	it('refuses an empty note', async () => {
		const { modelId, technician } = await workspace();
		const registered = await registerAsset(technician, { name: 'A laptop', assetModelId: modelId });
		if (!registered.ok) throw new Error(registered.error);

		expect(await addNote(technician, registered.value.id, '   ')).toEqual({
			ok: false,
			error: 'empty_note'
		});
	});
});

/**
 * The duplicate paths. These are the tests that caught the real bug: Drizzle
 * wraps the driver's error, so reading `error.code` directly finds nothing and
 * a duplicate tag escapes as a 500 instead of arriving as a typed outcome.
 */
describe('registerAsset, on a collision', () => {
	it('reports a duplicate tag as a business failure', async () => {
		const { organisation, modelId, technician } = await workspace();
		await createAsset(organisation.id, modelId, { assetTag: 'AST-TAKEN' });

		const result = await registerAsset(technician, {
			name: 'A laptop',
			assetModelId: modelId,
			assetTag: 'AST-TAKEN'
		});

		expect(result).toEqual({ ok: false, error: 'duplicate_asset_tag' });
	});

	it('reports a duplicate serial as a business failure', async () => {
		const { organisation, modelId, technician } = await workspace();
		await createAsset(organisation.id, modelId, { assetTag: 'AST-OTHER', serial: 'C02X1234' });

		const result = await registerAsset(technician, {
			name: 'A laptop',
			assetModelId: modelId,
			serial: 'C02X1234'
		});

		expect(result).toEqual({ ok: false, error: 'duplicate_serial' });
	});

	it('writes no asset.created entry for an asset it could not create', async () => {
		const { organisation, modelId, technician } = await workspace();
		await createAsset(organisation.id, modelId, { assetTag: 'AST-TAKEN' });

		await registerAsset(technician, {
			name: 'A laptop',
			assetModelId: modelId,
			assetTag: 'AST-TAKEN'
		});

		const stored = await getDb()
			.select({ tag: assets.assetTag })
			.from(assets)
			.where(eq(assets.organisationId, organisation.id));

		expect(stored).toEqual([{ tag: 'AST-TAKEN' }]);
	});

	/** The Zod gate, reached through the domain function rather than directly. */
	it('refuses an asset with no model before touching the database', async () => {
		const { organisation, technician } = await workspace();

		await expect(
			// @ts-expect-error the schema requires a model; this is the runtime backstop.
			registerAsset(technician, { name: 'A laptop' })
		).rejects.toThrow();

		const stored = await getDb()
			.select({ id: assets.id })
			.from(assets)
			.where(eq(assets.organisationId, organisation.id));

		expect(stored).toEqual([]);
	});
});

/**
 * Server-side pagination from the first list screen.
 *
 * What these tests prove is the *window*: page 2 of 200 returns rows 26 to 50
 * and reports a total of 200. They do **not** prove that the window was applied
 * by Postgres rather than by JavaScript — an in-memory slice would produce
 * byte-identical output, so claiming otherwise from these assertions would be a
 * claim the test cannot support.
 *
 * That half was verified by reading the server's own statement log
 * (`log_statement='all'`) while this spec ran. The listing issues:
 *
 *     select ... from "assets" inner join "asset_models" ... left join
 *     "locations" ... where "assets"."organisation_id" = $1
 *     order by "assets"."asset_tag" asc limit $2 offset $3
 *
 * and the total comes from `select count(*)::int from (<that same query>)
 * "matching"`, with no limit or offset. The SQL text is not asserted here on
 * purpose: pinning a generated query string would fail on every harmless
 * Drizzle release, and it is the kind of claim worth re-checking by observation
 * rather than freezing.
 */
describe('listAssets pagination', () => {
	const bulk = async (organisationId: string, modelId: string, howMany: number) => {
		await getDb()
			.insert(assets)
			.values(
				Array.from({ length: howMany }, (_, index) => ({
					organisationId,
					assetModelId: modelId,
					assetTag: `AST-${String(index + 1).padStart(4, '0')}`,
					name: `Asset ${index + 1}`
				}))
			);
	};

	it('returns the second page of 200 assets and reports the total', async () => {
		const { organisation, modelId, technician } = await workspace();
		await bulk(organisation.id, modelId, 200);

		const result = await listAssets(technician, { page: 2 });

		expect({
			returned: result.rows.length,
			total: result.total,
			pageCount: result.pageCount,
			first: full(result.rows[0]).assetTag,
			last: full(result.rows.at(-1)).assetTag
		}).toEqual({
			returned: 25,
			total: 200,
			pageCount: 8,
			first: 'AST-0026',
			last: 'AST-0050'
		});
	});

	it('reports the total of a filtered listing, not of the table', async () => {
		const { organisation, modelId, technician } = await workspace();
		await bulk(organisation.id, modelId, 30);
		await createAsset(organisation.id, modelId, { assetTag: 'AST-9999', name: 'Projector' });

		const result = await listAssets(technician, { search: 'projector' });

		expect({ returned: result.rows.length, total: result.total }).toEqual({
			returned: 1,
			total: 1
		});
	});

	it('clamps a page beyond the end to an empty page rather than failing', async () => {
		const { organisation, modelId, technician } = await workspace();
		await bulk(organisation.id, modelId, 5);

		const result = await listAssets(technician, { page: 99 });

		expect({ rows: result.rows.length, total: result.total }).toEqual({ rows: 0, total: 5 });
	});
});

/**
 * Full-text search over the generated `tsvector` columns: `simple` + `unaccent`,
 * never the Spanish dictionary.
 *
 * The issue's criterion names `macbook` and "`mcbook`-without-accent". The
 * first matches, and so does every accent variation of the real word. `mcbook`
 * does **not**, and cannot: `unaccent` strips diacritics, it does not correct
 * typos — a missing letter is a different word to a `tsvector`. That is
 * reported on the pull request rather than ticked, and pinned by the last test
 * here so the limit is recorded rather than rediscovered.
 */
describe('listAssets search', () => {
	const seeded = async () => {
		const { organisation, modelId, technician } = await workspace();
		// One asset named with the accent, and one whose *model* carries it, so
		// both vectors in the filter are exercised.
		await createAsset(organisation.id, modelId, {
			assetTag: 'AST-0001',
			name: 'MacBook Pró de l’Ada'
		});
		const { modelId: printerModel } = await createCatalogue(
			organisation.id,
			'LaserJet 400',
			'HP',
			'Printers'
		);
		await createAsset(organisation.id, printerModel, {
			assetTag: 'AST-0002',
			name: 'Impressora de planta'
		});

		return { organisation, modelId, technician };
	};

	const tagsFor = async (term: string) => {
		const { technician } = await seeded();
		const result = await listAssets(technician, { search: term });
		return result.rows.map((row) => row.assetTag);
	};

	it('matches the plain lowercase word', async () => {
		expect(await tagsFor('macbook')).toEqual(['AST-0001']);
	});

	it('matches whatever case is typed', async () => {
		expect(await tagsFor('MACBOOK')).toEqual(['AST-0001']);
	});

	it('matches an accented word typed without its accent', async () => {
		expect(await tagsFor('pro')).toEqual(['AST-0001']);
	});

	it('matches an accented word typed with its accent', async () => {
		expect(await tagsFor('pró')).toEqual(['AST-0001']);
	});

	it('matches two words without raising a syntax error', async () => {
		expect(await tagsFor('macbook pro')).toEqual(['AST-0001']);
	});

	/** The model's own vector, so searching a model finds every machine of it. */
	it('matches on the model’s name as well as the asset’s', async () => {
		expect(await tagsFor('laserjet')).toEqual(['AST-0002']);
	});

	it('matches an asset tag', async () => {
		expect(await tagsFor('AST-0002')).toEqual(['AST-0002']);
	});

	it('returns nothing for a term that matches nothing', async () => {
		expect(await tagsFor('tractor')).toEqual([]);
	});

	/**
	 * Recorded, not wished away. Correcting a transposed or missing letter needs
	 * trigram similarity (`pg_trgm`), which is a different index and a different
	 * ranking story; it is not in this slice's scope.
	 */
	it('does not match a misspelling, because unaccent is not a spellchecker', async () => {
		expect(await tagsFor('mcbook')).toEqual([]);
	});

	it('matches a serial for somebody who may read serials', async () => {
		const { organisation, modelId, technician } = await workspace();
		await createAsset(organisation.id, modelId, {
			assetTag: 'AST-0001',
			name: 'A laptop',
			serial: 'C02X1234'
		});

		const result = await listAssets(technician, { search: 'C02X1234' });

		expect(result.rows.map((row) => row.assetTag)).toEqual(['AST-0001']);
	});
});

/**
 * The search box must not answer questions the payload refuses.
 *
 * `assets.search` covers name, tag **and serial**, so an employee who may read
 * only the name and location of a shared asset could otherwise type a serial
 * and learn from the result whether it belonged to that asset — redaction with
 * an oracle behind it. The narrow surface matches `search_shared` instead, and
 * these are the tests that keep it that way.
 */
describe('search does not leak what the payload redacts', () => {
	const sharedPrinter = async () => {
		const organisation = await createOrganisation();
		const { modelId } = await createCatalogue(organisation.id, 'LaserJet 400', 'HP', 'Printers');
		const employee = await createViewer(organisation.id, 'employee', 'Ada Lovelace');

		await createAsset(organisation.id, modelId, {
			assetTag: 'AST-0001',
			name: 'Floor printer',
			serial: 'SECRET-SERIAL',
			shared: true
		});

		return { organisation, modelId, employee };
	};

	it('lets an employee find a shared asset by its name', async () => {
		const { employee } = await sharedPrinter();

		const result = await listAssets(employee, { search: 'printer' });

		expect(result.rows.map((row) => row.assetTag)).toEqual(['AST-0001']);
	});

	it('lets an employee find a shared asset by its tag', async () => {
		const { employee } = await sharedPrinter();

		const result = await listAssets(employee, { search: 'AST-0001' });

		expect(result.rows.map((row) => row.assetTag)).toEqual(['AST-0001']);
	});

	it('does not let an employee confirm a shared asset’s serial', async () => {
		const { employee } = await sharedPrinter();

		const result = await listAssets(employee, { search: 'SECRET-SERIAL' });

		expect(result.rows).toEqual([]);
	});

	/** The model is not in the shared payload either, so it is not searchable. */
	it('does not let an employee learn a shared asset’s model', async () => {
		const { employee } = await sharedPrinter();

		const result = await listAssets(employee, { search: 'laserjet' });

		expect(result.rows).toEqual([]);
	});
});

/**
 * ADR 0007 grants an employee the name and location of a shared asset and
 * explicitly not its history, so holding `assets.view.shared` must not be
 * enough to read a timeline.
 */
describe('assetTimeline visibility', () => {
	it('refuses the history of a shared asset to an employee', async () => {
		const { organisation, modelId, technician } = await workspace();
		const employee = await createViewer(organisation.id, 'employee', 'Ada Lovelace');
		const registered = await registerAsset(technician, {
			name: 'Floor printer',
			assetModelId: modelId,
			shared: true
		});
		if (!registered.ok) throw new Error(registered.error);

		const timeline = await assetTimeline(employee, registered.value.assetTag);

		expect(timeline).toEqual({ ok: false, error: 'history_not_visible' });
	});

	it('gives an employee the history of the asset in their own custody', async () => {
		const { organisation, modelId, technician } = await workspace();
		const employee = await createViewer(organisation.id, 'employee', 'Ada Lovelace');
		const registered = await registerAsset(technician, {
			name: 'Ada’s laptop',
			assetModelId: modelId
		});
		if (!registered.ok) throw new Error(registered.error);
		await assignCustody(technician, registered.value.id, employee.personId!);

		const timeline = await assetTimeline(employee, registered.value.assetTag);

		expect(timeline.ok ? timeline.value.map((entry) => entry.verb) : []).toEqual([
			'custody.assigned',
			'asset.created'
		]);
	});

	it('does not confirm the existence of an asset outside the viewer’s scope', async () => {
		const { organisation, modelId, technician } = await workspace();
		const employee = await createViewer(organisation.id, 'employee', 'Ada Lovelace');
		const registered = await registerAsset(technician, {
			name: 'Somebody else’s laptop',
			assetModelId: modelId
		});
		if (!registered.ok) throw new Error(registered.error);

		const timeline = await assetTimeline(employee, registered.value.assetTag);

		expect(timeline).toEqual({ ok: false, error: 'asset_not_found' });
	});
});
