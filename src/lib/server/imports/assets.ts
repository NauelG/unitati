import { m } from '#lib/paraglide/messages.js';
import {
	IMPORT_MAX_STATE_VALUES,
	type AssetsMapping,
	type FieldSource
} from '#lib/domain/imports.js';
import { ASSET_STATES, type AssetState } from '#lib/domain/status.js';
import { can } from '../access/permissions';
import {
	RESERVED_ASSET_TAGS,
	addNote,
	advanceAssetTagSequence,
	assignCustody,
	createAssetModel,
	createCategory,
	createManufacturer,
	existingAssetKeys,
	listAssetModels,
	listCategories,
	listManufacturers,
	registerAsset
} from '../assets';
import type { SessionUser } from '../auth/guards';
import { getDb, type Executor } from '../db';
import {
	createLocation,
	createPerson,
	listLocations,
	listPeople,
	personInput,
	type LocationEntry
} from '../directory';
import { failure, success, type Outcome } from '../shared/outcome';
import { parseCsv } from './csv';
import { planLocation, withPlanned } from './locations';
import { matchKey, resolveValue, type ImportField } from './mapping';
import type { CommitHooks, ImportErrorKind } from './people';

export const ASSET_FIELDS: readonly ImportField[] = [
	{
		key: 'assetTag',
		label: () => m.import_field_asset_tag(),
		required: false,
		aliases: ['asset tag', 'tag', 'etiqueta', 'etiqueta de activo', 'placa del activo']
	},
	{
		key: 'name',
		label: () => m.import_field_asset_name(),
		required: false,
		aliases: [
			'name',
			'asset name',
			'item name',
			'title',
			'nombre',
			'nombre del activo',
			'activo nombre'
		]
	},
	{
		key: 'serial',
		label: () => m.import_field_serial(),
		required: false,
		aliases: ['serial', 'serial number', 'serial no', 'numero de serie', 'serie']
	},
	{
		key: 'model',
		label: () => m.import_field_model(),
		required: true,
		aliases: ['model', 'model name', 'asset model', 'assetmodel', 'modelo']
	},
	{
		key: 'manufacturer',
		label: () => m.import_field_manufacturer(),
		required: false,
		aliases: ['manufacturer', 'fabricante']
	},
	{
		key: 'category',
		label: () => m.import_field_category(),
		required: false,
		aliases: ['category', 'categoria']
	},
	{
		key: 'state',
		label: () => m.import_field_state(),
		required: false,
		aliases: ['status', 'status label', 'state', 'estado']
	},
	{
		key: 'custodianEmail',
		label: () => m.import_field_custodian_email(),
		required: false,
		aliases: ['email', 'checked out to: email', 'correo', 'correo del custodio']
	},
	{
		key: 'custodianName',
		label: () => m.import_field_custodian_name(),
		required: false,
		aliases: [
			'checked out to',
			'checked out to: full name',
			'full name',
			'custodian',
			'custodio',
			'asignado a'
		]
	},
	{
		key: 'location',
		label: () => m.import_field_location(),
		required: false,
		aliases: ['location', 'ubicacion']
	},
	{
		key: 'shared',
		label: () => m.import_field_shared(),
		required: false,
		aliases: ['shared', 'compartido']
	},
	{
		key: 'notes',
		label: () => m.import_field_notes(),
		required: false,
		aliases: ['notes', 'asset notes', 'notas']
	}
];

/* -------------------------------------------------------------------------- */
/* State values                                                               */
/* -------------------------------------------------------------------------- */

const STATE_SYNONYMS: Record<AssetState, readonly string[]> = {
	in_stock: [
		'ready to deploy',
		'deployable',
		'in stock',
		'available',
		'disponible',
		'en stock',
		'en almacen'
	],
	in_use: ['deployed', 'in use', 'assigned', 'en uso', 'asignado'],
	in_repair: [
		'pending',
		'broken',
		'out for repair',
		'repair',
		'en reparacion',
		'averiado',
		'pendiente'
	],
	retired: ['archived', 'retired', 'lost', 'stolen', 'undeployable', 'retirado', 'baja', 'perdido']
};

const STATE_BY_KEY = new Map<string, AssetState>(
	(Object.entries(STATE_SYNONYMS) as [AssetState, readonly string[]][]).flatMap(([state, words]) =>
		words.map((word) => [word, state] as const)
	)
);

/**
 * The state a raw cell most likely means: a trailing ` (…)` is stripped
 * (Snipe-IT renders `Ready to Deploy (deployable)`), then the synonyms are
 * looked up. Null when nothing matches, and the user decides.
 */
export function suggestState(raw: string): AssetState | null {
	const stripped = raw.replace(/\s*\([^)]*\)\s*$/, '');
	return STATE_BY_KEY.get(matchKey(stripped)) ?? STATE_BY_KEY.get(matchKey(raw)) ?? null;
}

export type StateValueSuggestion = { value: string; suggested: AssetState | null };

/**
 * For every column that could hold a state (few distinct values), those values
 * with a suggestion. The page reads the one the user picked as the state column.
 */
export function stateValueSuggestions(file: Uint8Array): Record<string, StateValueSuggestion[]> {
	const parsed = parseCsv(file);
	if (!parsed.ok) return {};
	const { headers, rows } = parsed.value;
	const out: Record<string, StateValueSuggestion[]> = {};
	headers.forEach((header, index) => {
		const distinct = new Set<string>();
		for (const row of rows) {
			const value = (row[index] ?? '').trim();
			if (value !== '') distinct.add(value);
			if (distinct.size > IMPORT_MAX_STATE_VALUES) return;
		}
		out[header] = [...distinct].map((value) => ({ value, suggested: suggestState(value) }));
	});
	return out;
}

/* -------------------------------------------------------------------------- */
/* Plan                                                                       */
/* -------------------------------------------------------------------------- */

export type AssetsImportErrorKind =
	| Extract<
			ImportErrorKind,
			'file_unreadable' | 'mapping_missing' | 'duplicate_in_file' | 'location_ambiguous'
	  >
	| 'catalogue_conflict'
	| 'asset_conflict'
	| 'too_many_state_values'
	| 'state_value_unmapped'
	| 'state_invalid'
	| 'reserved_tag'
	| 'serial_taken'
	| 'model_missing'
	| 'model_ambiguous'
	| 'model_needs_manufacturer'
	| 'model_needs_category'
	| 'model_category_conflict'
	| 'custodian_inactive'
	| 'custodian_not_found'
	| 'custodian_ambiguous'
	| 'custodian_email_invalid'
	| 'custodian_name_required'
	| 'invalid_boolean';

export type AssetsImportError = {
	/** Spreadsheet row (the header is 1); null for a problem with the file or mapping. */
	row: number | null;
	column: string | null;
	value: string | null;
	kind: AssetsImportErrorKind;
};

export type AssetsImportWarningKind = 'category_ignored' | 'no_identity';

export type AssetsImportWarning = {
	row: number;
	column: string | null;
	value: string | null;
	kind: AssetsImportWarningKind;
};

export type PlannedAsset = {
	row: number;
	assetTag: string | null;
	name: string;
	serial: string | null;
	/** An existing model id, or `new:model:…` for one this import creates. */
	model: string;
	state: AssetState;
	shared: boolean;
	/** An existing location id, or `new:<path>`. */
	location: string | null;
	/** An existing person id, or `new:person:<email>`. */
	custodian: string | null;
	note: string | null;
};

export type SkippedAsset = {
	row: number;
	assetTag: string | null;
	serial: string | null;
	reason: 'already_exists';
};

export type AssetsPlan = {
	toCreate: PlannedAsset[];
	skipped: SkippedAsset[];
	warnings: AssetsImportWarning[];
	newManufacturers: string[];
	newCategories: string[];
	/** "Manufacturer · Model (Category)". */
	newModels: string[];
	/** Paths, parent first. */
	newLocations: string[];
	newPeople: { fullName: string; email: string }[];
	ignoredColumns: string[];
	errors: AssetsImportError[];
};

type NewModel = { ref: string; name: string; manufacturerRef: string; categoryRef: string };
type NewPerson = { ref: string; fullName: string; email: string };
type PlannedLocation = { path: string; name: string; parentId: string | null };

type Planned = {
	plan: AssetsPlan;
	newManufacturerSteps: { ref: string; name: string }[];
	newCategorySteps: { ref: string; name: string }[];
	newModelSteps: NewModel[];
	newLocationSteps: PlannedLocation[];
	newPersonSteps: NewPerson[];
};

const columnOf = (source: FieldSource | undefined) =>
	source && 'column' in source ? source.column : null;

const isGiven = (source: FieldSource | undefined): source is NonNullable<FieldSource> =>
	source != null && !('fixed' in source && source.fixed.trim() === '');

const TRUE_WORDS = new Set(['si', 'yes', 'y', 'true', '1', 'x']);
const FALSE_WORDS = new Set(['no', 'n', 'false', '0', '']);

function emptyPlan(errors: AssetsImportError[] = []): AssetsPlan {
	return {
		toCreate: [],
		skipped: [],
		warnings: [],
		newManufacturers: [],
		newCategories: [],
		newModels: [],
		newLocations: [],
		newPeople: [],
		ignoredColumns: [],
		errors
	};
}

function emptyPlanned(plan: AssetsPlan): Planned {
	return {
		plan,
		newManufacturerSteps: [],
		newCategorySteps: [],
		newModelSteps: [],
		newLocationSteps: [],
		newPersonSteps: []
	};
}

type WorkingModel = {
	ref: string;
	name: string;
	nameKey: string;
	manufacturerRef: string;
	manufacturerKey: string;
	categoryRef: string;
	categoryKey: string;
	isNew: boolean;
};

/** Pure planning over the current data: nothing is written. */
async function buildPlan(
	actor: SessionUser,
	file: Uint8Array,
	assetsMapping: AssetsMapping,
	executor: Executor
): Promise<Planned> {
	const parsed = parseCsv(file);
	if (!parsed.ok) {
		return emptyPlanned(
			emptyPlan([{ row: null, column: null, value: null, kind: 'file_unreadable' }])
		);
	}
	const { headers, rows } = parsed.value;
	const headerIndex = new Map(headers.map((header, index) => [header, index] as const));
	const mapping = assetsMapping.fields;

	const mappingErrors: AssetsImportError[] = [];
	const mappingError = (kind: AssetsImportErrorKind, column: string | null, value?: string) =>
		mappingErrors.push({ row: null, column, value: value ?? null, kind });
	for (const [key, source] of Object.entries(mapping)) {
		const column = columnOf(source);
		if (column !== null && !headerIndex.has(column)) mappingError('mapping_missing', key);
	}
	if (!isGiven(mapping.model)) mappingError('mapping_missing', 'model');

	// The state: a fixed value must be one of the four; a column must have every
	// distinct value mapped, and not too many of them.
	const stateSource = mapping.state;
	const stateColumn = columnOf(stateSource);
	if (isGiven(stateSource) && 'fixed' in stateSource) {
		if (!ASSET_STATES.includes(stateSource.fixed.trim() as AssetState)) {
			mappingError('state_invalid', 'state', stateSource.fixed.trim());
		}
	} else if (stateColumn !== null && headerIndex.has(stateColumn)) {
		const index = headerIndex.get(stateColumn)!;
		const distinct = new Set<string>();
		for (const row of rows) {
			const value = (row[index] ?? '').trim();
			if (value !== '') distinct.add(value);
		}
		if (distinct.size > IMPORT_MAX_STATE_VALUES) {
			mappingError('too_many_state_values', stateColumn);
		} else {
			for (const value of distinct) {
				const mapped = assetsMapping.stateValues[value];
				if (mapped === undefined) mappingError('state_value_unmapped', stateColumn, value);
				else if (!ASSET_STATES.includes(mapped)) mappingError('state_invalid', stateColumn, value);
			}
		}
	}

	const ignoredColumns = headers.filter(
		(header) => !Object.values(mapping).some((source) => columnOf(source) === header)
	);
	if (mappingErrors.length > 0) {
		return emptyPlanned({ ...emptyPlan(mappingErrors), ignoredColumns });
	}

	const organisationId = actor.organisationId;
	const [manufacturerList, categoryList, modelList, peopleList, locationList, existing] =
		await Promise.all([
			listManufacturers(organisationId, executor),
			listCategories(organisationId, executor),
			listAssetModels(organisationId, executor),
			listPeople(organisationId, { includeInactive: true, executor }),
			listLocations(organisationId, executor),
			existingAssetKeys(organisationId, executor)
		]);

	const manufacturers = new Map(
		manufacturerList.map((entry) => [matchKey(entry.name), { ref: entry.id, name: entry.name }])
	);
	const categories = new Map(
		categoryList.map((entry) => [matchKey(entry.name), { ref: entry.id, name: entry.name }])
	);
	const models: WorkingModel[] = modelList.map((entry) => ({
		ref: entry.id,
		name: entry.name,
		nameKey: matchKey(entry.name),
		manufacturerRef: entry.manufacturerId,
		manufacturerKey: matchKey(entry.manufacturerName),
		categoryRef: entry.categoryId,
		categoryKey: matchKey(entry.categoryName),
		isNew: false
	}));
	const peopleByEmail = new Map(
		peopleList.map((person) => [person.email.toLowerCase(), person] as const)
	);
	const activePeopleByName = new Map<string, string[]>();
	for (const person of peopleList) {
		if (!person.active) continue;
		const key = matchKey(person.fullName);
		activePeopleByName.set(key, [...(activePeopleByName.get(key) ?? []), person.id]);
	}
	const catalogue: LocationEntry[] = [...locationList];
	const canCreatePeople = can(actor, 'people.manage');

	const planned = emptyPlanned(emptyPlan());
	const { plan } = planned;
	plan.ignoredColumns = ignoredColumns;
	const newPeople = new Map<string, NewPerson>();
	const seenTags = new Set<string>();
	const seenSerials = new Set<string>();

	const stateFixed =
		isGiven(stateSource) && 'fixed' in stateSource
			? (stateSource.fixed.trim() as AssetState)
			: null;
	const stateIndex = stateColumn === null ? undefined : headerIndex.get(stateColumn);

	rows.forEach((row, index) => {
		const rowNumber = index + 2;
		const cell = (key: string) => resolveValue(mapping[key], row, headerIndex);
		const col = (key: string) => columnOf(mapping[key]);
		const error = (kind: AssetsImportErrorKind, key: string, value: string | null) =>
			void plan.errors.push({ row: rowNumber, column: col(key), value, kind });
		/** Applied only when the whole row is accepted, so a failed row leaves no ghost entries. */
		const effects: (() => void)[] = [];

		/* Identity and skip */
		const assetTag = cell('assetTag');
		const serial = cell('serial');
		const tagKey = assetTag.toLowerCase();
		const serialKey = serial.toLowerCase();

		if (assetTag !== '' && RESERVED_ASSET_TAGS.has(tagKey))
			return error('reserved_tag', 'assetTag', assetTag);
		if (assetTag !== '' && seenTags.has(tagKey)) {
			return error('duplicate_in_file', 'assetTag', assetTag);
		}
		if (serial !== '' && seenSerials.has(serialKey)) {
			return error('duplicate_in_file', 'serial', serial);
		}
		if (assetTag !== '') seenTags.add(tagKey);
		if (serial !== '') seenSerials.add(serialKey);

		if (assetTag !== '') {
			if (existing.tags.has(tagKey)) {
				plan.skipped.push({
					row: rowNumber,
					assetTag,
					serial: serial || null,
					reason: 'already_exists'
				});
				return;
			}
			if (serial !== '' && existing.serials.has(serialKey)) {
				return error('serial_taken', 'serial', serial);
			}
		} else if (serial !== '' && existing.serials.has(serialKey)) {
			plan.skipped.push({ row: rowNumber, assetTag: null, serial, reason: 'already_exists' });
			return;
		}

		/* Model */
		const modelName = cell('model');
		if (modelName === '') return error('model_missing', 'model', null);
		const manufacturerName = cell('manufacturer');
		const categoryName = cell('category');
		const modelKey = matchKey(modelName);
		const manufacturerKey = matchKey(manufacturerName);
		const categoryKey = matchKey(categoryName);

		const candidates = models.filter(
			(model) =>
				model.nameKey === modelKey &&
				(manufacturerName === '' || model.manufacturerKey === manufacturerKey)
		);
		let modelRef: string;
		if (candidates.length > 1) return error('model_ambiguous', 'model', modelName);
		if (candidates.length === 1) {
			const found = candidates[0];
			modelRef = found.ref;
			if (categoryName !== '' && found.categoryKey !== categoryKey) {
				if (found.isNew) return error('model_category_conflict', 'category', categoryName);
				plan.warnings.push({
					row: rowNumber,
					column: col('category'),
					value: categoryName,
					kind: 'category_ignored'
				});
			}
		} else {
			if (manufacturerName === '') return error('model_needs_manufacturer', 'manufacturer', null);
			if (categoryName === '') return error('model_needs_category', 'category', null);

			const manufacturer = manufacturers.get(manufacturerKey);
			const category = categories.get(categoryKey);
			const manufacturerRef = manufacturer?.ref ?? `new:manufacturer:${manufacturerKey}`;
			const categoryRef = category?.ref ?? `new:category:${categoryKey}`;
			modelRef = `new:model:${manufacturerKey}:${modelKey}`;
			effects.push(() => {
				if (!manufacturer) {
					manufacturers.set(manufacturerKey, { ref: manufacturerRef, name: manufacturerName });
					planned.newManufacturerSteps.push({ ref: manufacturerRef, name: manufacturerName });
				}
				if (!category) {
					categories.set(categoryKey, { ref: categoryRef, name: categoryName });
					planned.newCategorySteps.push({ ref: categoryRef, name: categoryName });
				}
				models.push({
					ref: modelRef,
					name: modelName,
					nameKey: modelKey,
					manufacturerRef,
					manufacturerKey,
					categoryRef,
					categoryKey,
					isNew: true
				});
				planned.newModelSteps.push({
					ref: modelRef,
					name: modelName,
					manufacturerRef,
					categoryRef
				});
			});
		}

		/* Custodian */
		let custodian: string | null = null;
		const custodianEmail = cell('custodianEmail');
		const custodianName = cell('custodianName');
		if (custodianEmail !== '') {
			const email = personInput.shape.email.safeParse(custodianEmail);
			if (!email.success) return error('custodian_email_invalid', 'custodianEmail', custodianEmail);
			const person = peopleByEmail.get(email.data);
			const pending = newPeople.get(email.data);
			if (person) {
				if (!person.active) return error('custodian_inactive', 'custodianEmail', custodianEmail);
				custodian = person.id;
			} else if (pending) {
				custodian = pending.ref;
			} else if (!canCreatePeople) {
				return error('custodian_not_found', 'custodianEmail', custodianEmail);
			} else {
				const fullName = personInput.shape.fullName.safeParse(custodianName);
				if (custodianName === '' || !fullName.success) {
					return error('custodian_name_required', 'custodianName', custodianName || null);
				}
				const created = {
					ref: `new:person:${email.data}`,
					fullName: fullName.data,
					email: email.data
				};
				custodian = created.ref;
				effects.push(() => {
					newPeople.set(created.email, created);
					planned.newPersonSteps.push(created);
				});
			}
		} else if (custodianName !== '') {
			const matches = activePeopleByName.get(matchKey(custodianName)) ?? [];
			if (matches.length === 0) return error('custodian_not_found', 'custodianName', custodianName);
			if (matches.length > 1) return error('custodian_ambiguous', 'custodianName', custodianName);
			custodian = matches[0];
		}

		/* Location */
		let location: string | null = null;
		const rawLocation = cell('location');
		if (rawLocation !== '') {
			const resolution = planLocation(rawLocation, catalogue);
			if (resolution.kind === 'ambiguous')
				return error('location_ambiguous', 'location', rawLocation);
			if (resolution.kind === 'match') location = resolution.location.id;
			else if (resolution.kind === 'create') {
				// The catalogue grows only when the row is accepted; the ids of the new
				// entries are known beforehand because they are derived from the path.
				const probe = [...catalogue];
				const added = withPlanned(probe, resolution);
				location = added[added.length - 1].id;
				effects.push(() => {
					const entries = withPlanned(catalogue, resolution);
					for (const entry of entries) {
						planned.newLocationSteps.push({
							path: entry.path,
							name: entry.name,
							parentId: entry.parentId
						});
					}
				});
			}
		}

		/* Shared */
		const rawShared = cell('shared');
		const sharedKey = matchKey(rawShared);
		if (!TRUE_WORDS.has(sharedKey) && !FALSE_WORDS.has(sharedKey)) {
			return error('invalid_boolean', 'shared', rawShared);
		}
		const shared = TRUE_WORDS.has(sharedKey);

		/* State */
		let state: AssetState = custodian !== null ? 'in_use' : 'in_stock';
		if (stateFixed !== null) state = stateFixed;
		else if (stateIndex !== undefined) {
			const raw = (row[stateIndex] ?? '').trim();
			if (raw !== '') state = assetsMapping.stateValues[raw];
		}

		const note = cell('notes');
		if (assetTag === '' && serial === '') {
			plan.warnings.push({ row: rowNumber, column: null, value: null, kind: 'no_identity' });
		}
		for (const apply of effects) apply();
		plan.toCreate.push({
			row: rowNumber,
			assetTag: assetTag || null,
			name: cell('name') || modelName,
			serial: serial || null,
			model: modelRef,
			state,
			shared,
			location,
			custodian,
			note: note || null
		});
	});

	const names = (refs: { ref: string; name: string }[]) => refs.map((entry) => entry.name);
	plan.newManufacturers = names(planned.newManufacturerSteps);
	plan.newCategories = names(planned.newCategorySteps);
	const manufacturerNames = new Map(planned.newManufacturerSteps.map((e) => [e.ref, e.name]));
	const categoryNames = new Map(planned.newCategorySteps.map((e) => [e.ref, e.name]));
	plan.newModels = planned.newModelSteps.map((model) => {
		const manufacturer =
			manufacturerNames.get(model.manufacturerRef) ??
			manufacturerList.find((entry) => entry.id === model.manufacturerRef)?.name ??
			'';
		const category =
			categoryNames.get(model.categoryRef) ??
			categoryList.find((entry) => entry.id === model.categoryRef)?.name ??
			'';
		return `${manufacturer} · ${model.name} (${category})`;
	});
	plan.newLocations = planned.newLocationSteps.map((step) => step.path);
	plan.newPeople = planned.newPersonSteps.map(({ fullName, email }) => ({ fullName, email }));
	return planned;
}

export async function planAssetsImport(
	actor: SessionUser,
	file: Uint8Array,
	mapping: AssetsMapping
): Promise<AssetsPlan> {
	return (await buildPlan(actor, file, mapping, getDb())).plan;
}

/* -------------------------------------------------------------------------- */
/* Commit                                                                     */
/* -------------------------------------------------------------------------- */

/** Thrown inside the transaction so it rolls back; caught outside it. */
class ImportAborted extends Error {
	constructor(readonly plan: AssetsPlan) {
		super('import aborted');
	}
}

export type AssetsCommitFailure = { kind: 'invalid'; plan: AssetsPlan };

const TAG_NUMBER = /^AST-(\d+)$/i;

/**
 * All or nothing. The plan is built again inside the transaction, because the
 * browser resends the file and nothing is remembered between steps.
 */
export async function commitAssetsImport(
	actor: SessionUser,
	file: Uint8Array,
	mapping: AssetsMapping,
	hooks: CommitHooks = {}
): Promise<Outcome<{ created: number; skipped: number }, AssetsCommitFailure>> {
	try {
		return await getDb().transaction(async (tx) => {
			const built = await buildPlan(actor, file, mapping, tx);
			const { plan } = built;
			if (plan.errors.length > 0) return failure({ kind: 'invalid' as const, plan });
			await hooks.afterPlan?.();

			const abort = (error: AssetsImportError): never => {
				throw new ImportAborted({ ...plan, errors: [error] });
			};
			const options = { executor: tx };
			const ids = new Map<string, string>();
			const resolve = (ref: string) => ids.get(ref) ?? ref;

			/* 1. Catalogue */
			for (const step of built.newManufacturerSteps) {
				const created = await createManufacturer(actor, { name: step.name }, options);
				if (!created.ok) abort(conflict(step.name));
				else ids.set(step.ref, created.value.id);
			}
			for (const step of built.newCategorySteps) {
				const created = await createCategory(actor, { name: step.name }, options);
				if (!created.ok) abort(conflict(step.name));
				else ids.set(step.ref, created.value.id);
			}
			for (const step of built.newModelSteps) {
				const created = await createAssetModel(
					actor,
					{
						name: step.name,
						manufacturerId: resolve(step.manufacturerRef),
						categoryId: resolve(step.categoryRef)
					},
					options
				);
				if (!created.ok) abort(conflict(step.name));
				else ids.set(step.ref, created.value.id);
			}

			/* 2. Locations, parent first */
			for (const step of built.newLocationSteps) {
				const created = await createLocation(
					actor,
					{
						name: step.name,
						parentId: step.parentId === null ? null : resolve(step.parentId),
						code: null,
						address: null,
						notes: null,
						latitude: null,
						longitude: null
					},
					options
				);
				if (!created.ok) abort(conflict(step.path));
				else ids.set(`new:${step.path}`, created.value.id);
			}

			/* 3. Custodians */
			for (const step of built.newPersonSteps) {
				const created = await createPerson(
					actor,
					{ fullName: step.fullName, email: step.email, departmentId: null, locationId: null },
					{ executor: tx, via: 'import' }
				);
				if (!created.ok) abort(conflict(step.email));
				else ids.set(step.ref, created.value.id);
			}

			/*
			 * 4. The tag sequence, before any row without a tag is inserted: a
			 * generated tag must never collide with an explicit one in this file.
			 */
			const tagNumbers = [...plan.toCreate, ...plan.skipped]
				.map((entry) => TAG_NUMBER.exec(entry.assetTag ?? '')?.[1])
				.filter((digits): digits is string => digits !== undefined)
				.map(Number);
			if (tagNumbers.length > 0) {
				await advanceAssetTagSequence(Math.max(...tagNumbers), options);
			}

			/* 5. The assets, in file order */
			for (const asset of plan.toCreate) {
				const registered = await registerAsset(
					actor,
					{
						...(asset.assetTag === null ? {} : { assetTag: asset.assetTag }),
						name: asset.name,
						serial: asset.serial,
						assetModelId: resolve(asset.model),
						state: asset.state,
						shared: asset.shared,
						locationId: asset.location === null ? null : resolve(asset.location)
					},
					{ executor: tx, via: 'import' }
				);
				if (!registered.ok) {
					return abort({
						row: asset.row,
						column: null,
						value: asset.assetTag ?? asset.serial ?? asset.name,
						kind: 'asset_conflict'
					});
				}
				const assetId = registered.value.id;

				if (asset.custodian !== null) {
					const assigned = await assignCustody(actor, assetId, resolve(asset.custodian), options);
					if (!assigned.ok) {
						return abort({
							row: asset.row,
							column: null,
							value: asset.assetTag ?? asset.name,
							kind: 'asset_conflict'
						});
					}
				}
				if (asset.note !== null) {
					const added = await addNote(actor, assetId, asset.note, options);
					if (!added.ok) {
						return abort({
							row: asset.row,
							column: null,
							value: asset.assetTag ?? asset.name,
							kind: 'asset_conflict'
						});
					}
				}
			}
			return success({ created: plan.toCreate.length, skipped: plan.skipped.length });
		});
	} catch (error) {
		if (error instanceof ImportAborted) return failure({ kind: 'invalid', plan: error.plan });
		throw error;
	}
}

const conflict = (value: string): AssetsImportError => ({
	row: null,
	column: null,
	value,
	kind: 'catalogue_conflict'
});
