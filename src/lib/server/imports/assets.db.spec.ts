import { and, asc, eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import type { AssetsMapping } from '#lib/domain/imports.js';
import type { AssetState } from '#lib/domain/status.js';
import { activity } from '../activity/schema';
import { handovers } from '../assets/schema';
import { addNote, assetModels, assets, categories, manufacturers, registerAsset } from '../assets';
import { createCatalogue, createOrganisation, createViewer } from '../assets/testing/fixtures';
import { getDb } from '../db';
import { createPerson, locations, people } from '../directory';
import { ASSET_FIELDS, commitAssetsImport, planAssetsImport, suggestMapping } from '.';

const utf8 = (text: string) => new TextEncoder().encode(text);

const HEADER =
	'Tag,Name,Serial,Model,Manufacturer,Category,Status,Email,Custodian,Location,Shared,Notes';

const STATES: Record<string, AssetState> = {
	'In use': 'in_use',
	'In stock': 'in_stock',
	Repair: 'in_repair',
	Gone: 'retired'
};

const mappingFor = (header = HEADER): AssetsMapping => ({
	fields: suggestMapping(ASSET_FIELDS, header.split(',')),
	stateValues: STATES
});

const file = (...rows: string[]) => utf8([HEADER, ...rows].join('\n') + '\n');

async function setup() {
	const organisation = await createOrganisation();
	const admin = await createViewer(organisation.id, 'admin');
	const technician = await createViewer(organisation.id, 'technician', 'Tess Nician');
	return { organisation, admin, actor: admin, technician };
}

const counts = async () => ({
	assets: (await getDb().select().from(assets)).length,
	manufacturers: (await getDb().select().from(manufacturers)).length,
	categories: (await getDb().select().from(categories)).length,
	models: (await getDb().select().from(assetModels)).length,
	locations: (await getDb().select().from(locations)).length,
	people: (await getDb().select().from(people)).length,
	activity: (await getDb().select().from(activity)).length
});

const verbsOf = async (assetId: string) =>
	(
		await getDb()
			.select({ verb: activity.verb, payload: activity.payload })
			.from(activity)
			.where(eq(activity.assetId, assetId))
			.orderBy(asc(activity.occurredAt))
	).map((entry) => entry.verb);

/** The ten-asset scenario of the issue: 2 manufacturers, 1 category, 3 models, 2 locations, 1 person. */
async function bigScenario() {
	const scenario = await setup();
	const { organisation, admin } = scenario;
	// "Monitors" and its model already exist, so only one category is new.
	const { modelId } = await createCatalogue(
		organisation.id,
		'Existing laptop',
		'Apple',
		'Monitors'
	);
	for (const tag of ['AST-0001', 'AST-0002']) {
		await registerAsset(admin, { assetTag: tag, name: tag, assetModelId: modelId });
	}
	const rows = [
		'AST-0900,Ada laptop,S-1,ThinkPad T14,Lenovo,Laptops,In use,new@acme.test,New Person,HQ › Floor 9,No,Bought used',
		'AST-0901,Second laptop,S-2,ThinkPad T14,Lenovo,Laptops,In stock,,,HQ › Floor 9,No,',
		'AST-0902,Third laptop,,ThinkPad X1,Lenovo,Laptops,,,,,No,',
		'AST-0903,Screen,S-4,UltraSharp,Dell,Monitors,Repair,,,HQ,Sí,Cracked corner',
		',Loose A,S-5,UltraSharp,Dell,Monitors,,,,,,',
		',Loose B,S-6,ThinkPad X1,Lenovo,,,,,,,Needs a charger',
		',Loose C,S-7,ThinkPad T14,,,,new@acme.test,,,,',
		',No identity A,,ThinkPad T14,,,,,,,,',
		',No identity B,,UltraSharp,,,Gone,,,,,',
		',,,ThinkPad X1,,,,,,,,',
		'AST-0001,Already here,,ThinkPad T14,,,,,,,,',
		'AST-0002,Also here,,ThinkPad T14,,,,,,,,'
	];
	return { ...scenario, rows, data: file(...rows), mapping: mappingFor() };
}

describe('the assets import', () => {
	it('previews exactly what it will create, and creating does exactly that', async () => {
		const { actor, data, mapping } = await bigScenario();
		const before = await counts();

		const plan = await planAssetsImport(actor, data, mapping);
		expect(plan.errors).toEqual([]);
		expect(plan.toCreate).toHaveLength(10);
		expect(plan.skipped.map((skipped) => skipped.assetTag)).toEqual(['AST-0001', 'AST-0002']);
		expect(plan.newManufacturers).toEqual(['Lenovo', 'Dell']);
		expect(plan.newCategories).toEqual(['Laptops']);
		expect(plan.newModels).toEqual([
			'Lenovo · ThinkPad T14 (Laptops)',
			'Lenovo · ThinkPad X1 (Laptops)',
			'Dell · UltraSharp (Monitors)'
		]);
		expect(plan.newLocations).toEqual(['HQ', 'HQ › Floor 9']);
		expect(plan.newPeople).toEqual([{ fullName: 'New Person', email: 'new@acme.test' }]);
		expect(plan.warnings.filter((warning) => warning.kind === 'no_identity')).toHaveLength(3);
		expect(await counts()).toEqual(before);

		const outcome = await commitAssetsImport(actor, data, mapping);
		expect(outcome).toEqual({ ok: true, value: { created: 10, skipped: 2 } });

		const after = await counts();
		expect(after.assets - before.assets).toBe(10);
		expect(after.manufacturers - before.manufacturers).toBe(2);
		expect(after.categories - before.categories).toBe(1);
		expect(after.models - before.models).toBe(3);
		expect(after.locations - before.locations).toBe(2);
		expect(after.people - before.people).toBe(1);

		const created = await getDb()
			.select()
			.from(assets)
			.where(eq(assets.organisationId, actor.organisationId));
		const generated = created.filter((asset) => /^Loose|^No identity|^ThinkPad/.test(asset.name));
		expect(generated).toHaveLength(6);
		for (const asset of generated) {
			expect(Number(asset.assetTag.replace('AST-', ''))).toBeGreaterThan(900);
		}
	});

	it('writes asset.created via import, then custody and notes, and no state or location events', async () => {
		const { actor, data, mapping } = await bigScenario();
		// Even if every category already required a signature: an import records history.
		await getDb().update(categories).set({ requiresHandover: true });
		await commitAssetsImport(actor, data, mapping);
		expect(await getDb().select().from(handovers)).toHaveLength(0);

		const byName = async (name: string) =>
			(
				await getDb()
					.select()
					.from(assets)
					.where(and(eq(assets.name, name), eq(assets.organisationId, actor.organisationId)))
			)[0];

		const ada = await byName('Ada laptop');
		expect(await verbsOf(ada.id)).toEqual(['asset.created', 'custody.assigned', 'note.added']);
		expect(ada.state).toBe('in_use');
		expect(ada.custodianPersonId).not.toBeNull();

		const created = await getDb()
			.select()
			.from(activity)
			.where(eq(activity.assetId, ada.id))
			.orderBy(asc(activity.occurredAt));
		expect(created[0].payload).toEqual({ assetTag: 'AST-0900', name: 'Ada laptop', via: 'import' });

		const screen = await byName('Screen');
		expect(await verbsOf(screen.id)).toEqual(['asset.created', 'note.added']);
		expect(screen).toMatchObject({ state: 'in_repair', shared: true });
		expect(screen.locationId).not.toBeNull();

		const loose = await byName('Loose C');
		expect(await verbsOf(loose.id)).toEqual(['asset.created', 'custody.assigned']);
		expect(loose.state).toBe('in_use');

		const all = await getDb()
			.select({ verb: activity.verb })
			.from(activity)
			.where(eq(activity.organisationId, actor.organisationId));
		expect(all.some((entry) => entry.verb === 'state.changed')).toBe(false);
		expect(all.some((entry) => entry.verb === 'location.changed')).toBe(false);

		const retired = await byName('No identity B');
		expect(retired.state).toBe('retired');
	});

	it('leaves a free generated tag for an asset registered by hand afterwards', async () => {
		const { actor, data, mapping } = await bigScenario();
		await commitAssetsImport(actor, data, mapping);
		const [model] = await getDb()
			.select()
			.from(assetModels)
			.where(eq(assetModels.organisationId, actor.organisationId))
			.limit(1);

		const next = await registerAsset(actor, { name: 'By hand', assetModelId: model.id });
		expect(next.ok).toBe(true);
		if (next.ok) expect(Number(next.value.assetTag.replace('AST-', ''))).toBeGreaterThan(909);
	});

	it('creates nothing the second time except the rows without a tag or a serial', async () => {
		const { actor, data, mapping } = await bigScenario();
		await commitAssetsImport(actor, data, mapping);
		const before = await counts();

		const again = await commitAssetsImport(actor, data, mapping);
		// Three rows have neither tag nor serial, as the warning says.
		expect(again).toEqual({ ok: true, value: { created: 3, skipped: 9 } });
		const after = await counts();
		expect(after.assets - before.assets).toBe(3);
		expect(after.manufacturers).toBe(before.manufacturers);
		expect(after.models).toBe(before.models);
		expect(after.people).toBe(before.people);
	});

	it.each([
		[
			'an ambiguous model',
			'model_ambiguous',
			async (organisationId: string) => {
				await createCatalogue(organisationId, 'Twin', 'Maker A', 'Cat A');
				await createCatalogue(organisationId, 'Twin', 'Maker B', 'Cat B');
			},
			',Row,,Twin,,,,,,,,'
		],
		[
			'an unknown custodian name',
			'custodian_not_found',
			null,
			',Row,,Thing,Acme,Gear,,,Nobody Here,,,'
		],
		['an invalid boolean', 'invalid_boolean', null, ',Row,,Thing,Acme,Gear,,,,,maybe,'],
		[
			'a serial that belongs to another asset',
			'serial_taken',
			async (organisationId: string) => {
				const { modelId } = await createCatalogue(organisationId, 'Old', 'Old Co', 'Old Cat');
				await getDb().insert(assets).values({
					organisationId,
					assetModelId: modelId,
					name: 'Holder',
					serial: 'TAKEN'
				});
			},
			'NEW-1,Row,TAKEN,Thing,Acme,Gear,,,,,,'
		]
	])('writes nothing at all when a row has %s', async (_label, kind, prepare, badRow) => {
		const { organisation, actor } = await setup();
		await prepare?.(organisation.id);
		const data = file(
			'NEW-0,Good,,Fresh,NewCo,NewCat,,newbie@acme.test,Newbie Person,New place › Floor,,A note',
			badRow
		);
		const before = await counts();

		const outcome = await commitAssetsImport(actor, data, mappingFor());
		expect(outcome.ok).toBe(false);
		if (!outcome.ok) expect(outcome.error.plan.errors.map((e) => e.kind)).toEqual([kind]);
		expect(await counts()).toEqual(before);
	});

	it('rolls everything back when a catalogue write collides after the plan was valid', async () => {
		const { actor, data, mapping } = await bigScenario();
		const before = await counts();

		const outcome = await commitAssetsImport(actor, data, mapping, {
			afterPlan: async () => {
				await getDb()
					.insert(manufacturers)
					.values({ organisationId: actor.organisationId, name: 'Dell' });
			}
		});

		expect(outcome.ok).toBe(false);
		if (!outcome.ok) expect(outcome.error.plan.errors[0].kind).toBe('catalogue_conflict');
		const after = await counts();
		expect(after).toEqual({ ...before, manufacturers: before.manufacturers + 1 });
	});

	it('refuses a custodian email that does not exist to a technician, but an admin creates the person', async () => {
		const data = file(',Row,,Thing,Acme,Gear,,ghost@acme.test,Ghost Person,,,');

		const { admin, technician } = await setup();
		const refused = await planAssetsImport(technician, data, mappingFor());
		expect(refused.errors.map((error) => error.kind)).toEqual(['custodian_not_found']);

		const plan = await planAssetsImport(admin, data, mappingFor());
		expect(plan.errors).toEqual([]);
		expect(plan.newPeople).toEqual([{ fullName: 'Ghost Person', email: 'ghost@acme.test' }]);
		await commitAssetsImport(admin, data, mappingFor());
		expect(
			(await getDb().select().from(people).where(eq(people.email, 'ghost@acme.test'))).length
		).toBe(1);

		const nameless = await planAssetsImport(
			admin,
			file(',Row,,Thing,Acme,Gear,,other@acme.test,,,,'),
			mappingFor()
		);
		expect(nameless.errors.map((error) => error.kind)).toEqual(['custodian_name_required']);
	});

	it('resolves a custodian by name only among active people, and never creates one', async () => {
		const { organisation, actor } = await setup();
		const created = await createPerson(actor, {
			fullName: 'Grace Hopper',
			email: 'grace@acme.test',
			departmentId: null,
			locationId: null
		});
		if (!created.ok) throw new Error('fixture failed');
		const data = file(
			',One,,Thing,Acme,Gear,,,Grace Hopper,,,',
			',Two,,Thing,Acme,Gear,,,Nobody,,,'
		);

		const plan = await planAssetsImport(actor, data, mappingFor());
		expect(plan.toCreate[0].custodian).toBe(created.value.id);
		expect(plan.errors.map((error) => error.kind)).toEqual(['custodian_not_found']);
		expect(plan.newPeople).toEqual([]);

		await getDb().update(people).set({ active: false }).where(eq(people.id, created.value.id));
		const inactive = await planAssetsImport(
			actor,
			file(',One,,Thing,Acme,Gear,,grace@acme.test,,,,'),
			mappingFor()
		);
		expect(inactive.errors.map((error) => error.kind)).toEqual(['custodian_inactive']);
		void organisation;
	});

	it('plans model rules: ambiguity, new models, category conflicts and ignored categories', async () => {
		const { organisation, actor } = await setup();
		await createCatalogue(organisation.id, 'Known', 'Maker', 'Real category');

		const plan = await planAssetsImport(
			actor,
			file(
				',A,,Known,,Other category,,,,,,',
				',B,,Fresh,,Cat,,,,,,',
				',C,,Fresh,Maker,,,,,,,',
				',D,,Fresh,Maker,Cat,,,,,,',
				',E,,Fresh,Maker,Different,,,,,,'
			),
			mappingFor()
		);
		expect(plan.warnings).toEqual([
			{ row: 2, column: 'Category', value: 'Other category', kind: 'category_ignored' },
			...plan.warnings.filter((warning) => warning.kind === 'no_identity')
		]);
		expect(plan.errors.map((error) => [error.row, error.kind])).toEqual([
			[3, 'model_needs_manufacturer'],
			[4, 'model_needs_category'],
			[6, 'model_category_conflict']
		]);
	});

	it('reports a reserved tag and a repeated tag or serial', async () => {
		const { actor } = await setup();
		const plan = await planAssetsImport(
			actor,
			file(
				'models,A,,Thing,Acme,Gear,,,,,,',
				'T-1,B,S-1,Thing,Acme,Gear,,,,,,',
				't-1,C,,Thing,Acme,Gear,,,,,,',
				',D,s-1,Thing,Acme,Gear,,,,,,'
			),
			mappingFor()
		);
		expect(plan.errors.map((error) => [error.row, error.kind])).toEqual([
			[2, 'reserved_tag'],
			[4, 'duplicate_in_file'],
			[5, 'duplicate_in_file']
		]);
	});

	describe('state values', () => {
		it('blocks the preview while a distinct value is unmapped', async () => {
			const { actor } = await setup();
			const plan = await planAssetsImport(
				actor,
				file(',A,,Thing,Acme,Gear,Mystery,,,,,'),
				mappingFor()
			);
			expect(plan.errors).toEqual([
				{ row: null, column: 'Status', value: 'Mystery', kind: 'state_value_unmapped' }
			]);
		});

		it('refuses a state column with more than 50 distinct values', async () => {
			const { actor } = await setup();
			const rows = Array.from({ length: 51 }, (_, i) => `,A${i},,Thing,Acme,Gear,Value ${i},,,,,`);
			const plan = await planAssetsImport(actor, file(...rows), mappingFor());
			expect(plan.errors.map((error) => error.kind)).toEqual(['too_many_state_values']);
		});

		it('defaults an empty state to in_use with a custodian and in_stock without', async () => {
			const { actor } = await setup();
			const data = file(
				',A,,Thing,Acme,Gear,,new@acme.test,New Person,,,',
				',B,,Thing,Acme,Gear,,,,,,'
			);
			const plan = await planAssetsImport(actor, data, mappingFor());
			expect(plan.toCreate.map((asset) => asset.state)).toEqual(['in_use', 'in_stock']);
		});

		it('accepts a fixed state among the four, and refuses any other', async () => {
			const { actor } = await setup();
			const data = file(',A,,Thing,Acme,Gear,,,,,,');
			const fixed = (value: string): AssetsMapping => {
				const base = mappingFor();
				return { ...base, fields: { ...base.fields, state: { fixed: value } } };
			};
			expect((await planAssetsImport(actor, data, fixed('retired'))).toCreate[0].state).toBe(
				'retired'
			);
			expect(
				(await planAssetsImport(actor, data, fixed('lost'))).errors.map((e) => e.kind)
			).toEqual(['state_invalid']);
		});
	});

	it('leaves the callers of the executor-aware writes unchanged without options', async () => {
		const { admin } = await setup();
		const { modelId } = await createCatalogue(admin.organisationId);
		const registered = await registerAsset(admin, { name: 'Plain', assetModelId: modelId });
		expect(registered.ok).toBe(true);
		if (!registered.ok) return;
		const note = await addNote(admin, registered.value.id, 'hello');
		expect(note.ok).toBe(true);
		expect(await verbsOf(registered.value.id)).toEqual(['asset.created', 'note.added']);
		const [created] = await getDb()
			.select()
			.from(activity)
			.where(and(eq(activity.assetId, registered.value.id), eq(activity.verb, 'asset.created')));
		expect(created.payload).toEqual({ assetTag: registered.value.assetTag, name: 'Plain' });
	});
});
