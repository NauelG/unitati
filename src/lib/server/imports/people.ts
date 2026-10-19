import { m } from '#lib/paraglide/messages.js';
import type { FieldSource, Mapping } from '#lib/domain/imports.js';
import type { SessionUser } from '../auth/guards';
import { getDb, type Executor } from '../db';
import {
	createDepartment,
	createLocation,
	createPerson,
	departmentInput,
	listDepartments,
	listLocations,
	listPeople,
	personInput,
	type LocationEntry
} from '../directory';
import { failure, success, type Outcome } from '../shared/outcome';
import { parseCsv } from './csv';
import { planLocation, withPlanned } from './locations';
import { matchKey, resolveValue, type ImportField } from './mapping';

export const PEOPLE_FIELDS: readonly ImportField[] = [
	{
		key: 'fullName',
		label: () => m.import_field_full_name(),
		required: true,
		aliases: ['full name', 'name', 'display name', 'nombre completo', 'nombre']
	},
	{
		key: 'firstName',
		label: () => m.import_field_first_name(),
		required: false,
		aliases: ['first name', 'nombre']
	},
	{
		key: 'lastName',
		label: () => m.import_field_last_name(),
		required: false,
		aliases: ['last name', 'apellidos']
	},
	{
		key: 'email',
		label: () => m.import_field_email(),
		required: true,
		aliases: ['email', 'correo', 'correo electronico']
	},
	{
		key: 'department',
		label: () => m.import_field_department(),
		required: false,
		aliases: ['department', 'departamento']
	},
	{
		key: 'location',
		label: () => m.import_field_location(),
		required: false,
		aliases: ['location', 'ubicacion']
	}
];

export type ImportErrorKind =
	| 'file_unreadable'
	| 'mapping_missing'
	| 'full_name_missing'
	| 'full_name_too_long'
	| 'email_missing'
	| 'email_invalid'
	| 'duplicate_in_file'
	| 'duplicate_email'
	| 'department_too_long'
	| 'location_ambiguous'
	| 'catalogue_conflict';

export type ImportError = {
	/** Spreadsheet row (the header is 1); null for a problem with the file or mapping. */
	row: number | null;
	column: string | null;
	value: string | null;
	kind: ImportErrorKind;
};

export type PlannedPerson = {
	row: number;
	fullName: string;
	email: string;
	/** An existing department, a new one by name, or none. */
	department: { id: string } | { newName: string } | null;
	/** An existing location, a new one by path (`new:<path>`), or none. */
	location: { id: string } | null;
};

export type PeoplePlan = {
	toCreate: PlannedPerson[];
	skipped: { row: number; email: string }[];
	newDepartments: string[];
	/** Paths, parent first. */
	newLocations: string[];
	ignoredColumns: string[];
	errors: ImportError[];
};

type PlannedLocation = { path: string; name: string; parentId: string | null };

type Planned = { plan: PeoplePlan; newLocationSteps: PlannedLocation[] };

const columnOf = (source: FieldSource | undefined) =>
	source && 'column' in source ? source.column : null;

const isGiven = (source: FieldSource | undefined): source is NonNullable<FieldSource> =>
	source != null && !('fixed' in source && source.fixed.trim() === '');

function emptyPlan(errors: ImportError[] = []): PeoplePlan {
	return {
		toCreate: [],
		skipped: [],
		newDepartments: [],
		newLocations: [],
		ignoredColumns: [],
		errors
	};
}

/** Pure planning over the current data: nothing is written. */
async function buildPlan(
	actor: SessionUser,
	file: Uint8Array,
	mapping: Mapping,
	executor: Executor
): Promise<Planned> {
	const parsed = parseCsv(file);
	if (!parsed.ok) {
		return {
			plan: emptyPlan([{ row: null, column: null, value: null, kind: 'file_unreadable' }]),
			newLocationSteps: []
		};
	}
	const { headers, rows } = parsed.value;
	const headerIndex = new Map(headers.map((header, index) => [header, index] as const));

	const mappingErrors: ImportError[] = [];
	const missing = (key: string) =>
		mappingErrors.push({ row: null, column: key, value: null, kind: 'mapping_missing' });
	for (const [key, source] of Object.entries(mapping)) {
		const column = columnOf(source);
		if (column !== null && !headerIndex.has(column)) missing(key);
	}
	if (!isGiven(mapping.email)) missing('email');
	const splitName = isGiven(mapping.firstName) && isGiven(mapping.lastName);
	if (!isGiven(mapping.fullName) && !splitName) missing('fullName');
	const ignoredColumns = headers.filter(
		(header) => !Object.values(mapping).some((source) => columnOf(source) === header)
	);
	if (mappingErrors.length > 0) {
		return { plan: { ...emptyPlan(mappingErrors), ignoredColumns }, newLocationSteps: [] };
	}

	const organisationId = actor.organisationId;
	const [existingPeople, departments, locationList] = await Promise.all([
		listPeople(organisationId, { includeInactive: true, executor }),
		listDepartments(organisationId, executor),
		listLocations(organisationId, executor)
	]);
	const existingEmails = new Set(existingPeople.map((person) => person.email.toLowerCase()));
	const departmentIds = new Map(departments.map((d) => [matchKey(d.name), d.id] as const));
	const catalogue: LocationEntry[] = [...locationList];

	const plan = emptyPlan();
	plan.ignoredColumns = ignoredColumns;
	const newLocationSteps: PlannedLocation[] = [];
	const newDepartmentKeys = new Map<string, string>();
	const seenEmails = new Set<string>();

	const nameColumn = columnOf(mapping.fullName) ?? columnOf(mapping.firstName);
	const emailColumn = columnOf(mapping.email);

	rows.forEach((row, index) => {
		const rowNumber = index + 2;
		const cell = (key: string) => resolveValue(mapping[key], row, headerIndex);
		const error = (kind: ImportErrorKind, column: string | null, value: string | null) =>
			plan.errors.push({ row: rowNumber, column, value, kind });

		const rawEmail = cell('email');
		if (rawEmail === '') return void error('email_missing', emailColumn, null);
		const email = personInput.shape.email.safeParse(rawEmail);
		if (!email.success) return void error('email_invalid', emailColumn, rawEmail);

		if (seenEmails.has(email.data)) return void error('duplicate_in_file', emailColumn, email.data);
		seenEmails.add(email.data);
		if (existingEmails.has(email.data)) {
			plan.skipped.push({ row: rowNumber, email: email.data });
			return;
		}

		const rawName = isGiven(mapping.fullName)
			? cell('fullName')
			: [cell('firstName'), cell('lastName')].filter((part) => part !== '').join(' ');
		if (rawName === '') return void error('full_name_missing', nameColumn, null);
		const fullName = personInput.shape.fullName.safeParse(rawName);
		if (!fullName.success) return void error('full_name_too_long', nameColumn, rawName);

		let department: PlannedPerson['department'] = null;
		const rawDepartment = cell('department');
		if (rawDepartment !== '') {
			const named = departmentInput.safeParse({ name: rawDepartment });
			if (!named.success) {
				return void error('department_too_long', columnOf(mapping.department), rawDepartment);
			}
			const key = matchKey(named.data.name);
			const existing = departmentIds.get(key);
			if (existing) department = { id: existing };
			else {
				if (!newDepartmentKeys.has(key)) newDepartmentKeys.set(key, named.data.name);
				department = { newName: newDepartmentKeys.get(key)! };
			}
		}

		let location: PlannedPerson['location'] = null;
		const rawLocation = cell('location');
		if (rawLocation !== '') {
			const resolution = planLocation(rawLocation, catalogue);
			if (resolution.kind === 'ambiguous') {
				return void error('location_ambiguous', columnOf(mapping.location), rawLocation);
			}
			if (resolution.kind === 'match') location = { id: resolution.location.id };
			else if (resolution.kind === 'create') {
				const added = withPlanned(catalogue, resolution);
				for (const entry of added) {
					newLocationSteps.push({ path: entry.path, name: entry.name, parentId: entry.parentId });
				}
				location = { id: added[added.length - 1].id };
			}
		}

		plan.toCreate.push({
			row: rowNumber,
			fullName: fullName.data,
			email: email.data,
			department,
			location
		});
	});

	plan.newDepartments = [...newDepartmentKeys.values()];
	plan.newLocations = newLocationSteps.map((step) => step.path);
	return { plan, newLocationSteps };
}

export async function planPeopleImport(
	actor: SessionUser,
	file: Uint8Array,
	mapping: Mapping
): Promise<PeoplePlan> {
	return (await buildPlan(actor, file, mapping, getDb())).plan;
}

/** Thrown inside the transaction so it rolls back; caught outside it. */
class ImportAborted extends Error {
	constructor(readonly plan: PeoplePlan) {
		super('import aborted');
	}
}

export type CommitFailure = { kind: 'invalid'; plan: PeoplePlan };

/** Test seam: runs after the plan is built and before the first write. */
export type CommitHooks = { afterPlan?: () => Promise<void> };

/**
 * All or nothing. The plan is built again inside the transaction, because the
 * browser resends the file and nothing is remembered between steps: what was
 * previewed may no longer be true, and what is written is what is true now.
 */
export async function commitPeopleImport(
	actor: SessionUser,
	file: Uint8Array,
	mapping: Mapping,
	hooks: CommitHooks = {}
): Promise<Outcome<{ created: number; skipped: number }, CommitFailure>> {
	try {
		return await getDb().transaction(async (tx) => {
			const { plan, newLocationSteps } = await buildPlan(actor, file, mapping, tx);
			if (plan.errors.length > 0) return failure({ kind: 'invalid' as const, plan });
			await hooks.afterPlan?.();

			const abort = (error: ImportError): never => {
				throw new ImportAborted({ ...plan, errors: [error] });
			};

			const departmentIds = new Map<string, string>();
			for (const name of plan.newDepartments) {
				const created = await createDepartment(actor, { name }, { executor: tx });
				if (!created.ok)
					abort({ row: null, column: null, value: name, kind: 'catalogue_conflict' });
				else departmentIds.set(name, created.value.id);
			}

			const locationIds = new Map<string, string>();
			for (const step of newLocationSteps) {
				const parentId =
					step.parentId === null ? null : (locationIds.get(step.parentId) ?? step.parentId);
				const created = await createLocation(
					actor,
					{
						name: step.name,
						parentId,
						code: null,
						address: null,
						notes: null,
						latitude: null,
						longitude: null
					},
					{ executor: tx }
				);
				if (!created.ok)
					abort({ row: null, column: null, value: step.path, kind: 'catalogue_conflict' });
				else locationIds.set(`new:${step.path}`, created.value.id);
			}

			for (const person of plan.toCreate) {
				const departmentId =
					person.department === null
						? null
						: 'id' in person.department
							? person.department.id
							: departmentIds.get(person.department.newName)!;
				const locationId =
					person.location === null
						? null
						: (locationIds.get(person.location.id) ?? person.location.id);
				const created = await createPerson(
					actor,
					{ fullName: person.fullName, email: person.email, departmentId, locationId },
					{ executor: tx, via: 'import' }
				);
				if (!created.ok) {
					abort({ row: person.row, column: null, value: person.email, kind: 'duplicate_email' });
				}
			}
			return success({ created: plan.toCreate.length, skipped: plan.skipped.length });
		});
	} catch (error) {
		if (error instanceof ImportAborted) return failure({ kind: 'invalid', plan: error.plan });
		throw error;
	}
}
