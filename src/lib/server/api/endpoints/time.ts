import { z } from 'zod';
import { TIME_READ_PERMISSIONS } from '#lib/domain/access.js';
import { DURATION_GRAMMAR, MAX_ENTRY_MINUTES, parseDuration } from '#lib/domain/time.js';
import { can, type Permission } from '../../access/permissions';
import { canReadTimeTarget, redactTimeRows } from '../../links';
import { getTask, readsProjects } from '../../projects';
import { getTicketByTag } from '../../service-desk';
import {
	deleteEntry,
	editEntry,
	entryTarget,
	getEntry,
	isTimeTrackingEnabled,
	listTypes,
	logTime,
	reportEntries,
	reportScope,
	type EditFailure,
	type EntryFailure,
	type ReportFailure,
	type ReportRow,
	type TimeTarget
} from '../../time';
import type { ApiPrincipal } from '../keys';
import {
	created,
	defineEndpoint,
	noContent,
	notFound,
	refusalTable,
	type Endpoint
} from '../registry';
import { invalidField } from './refusals';
import { named, paginationMetaSchema, toMeta } from '../shared-schemas';

/**
 * Time entries over the API (ADR 0052, ADR 0022). Entries are first-person: a
 * key acts as the person behind it, creates entries only for them, and edits or
 * deletes only their own, unless the role holds `time.manage`. The timer is an
 * interactive affordance and has no endpoints; integrations write finished
 * entries. The records are addressed by tag and resolved through their owning
 * domains' read policies before `time` is asked anything (ADR 0050).
 */

const LOG = ['time.log'] as const;

/**
 * Naming the ticket or task is part of logging time on it, as naming an asset
 * is part of `tickets.manage` (`ticket-work.ts`): a key scoped to `time.log`
 * alone does not also need `tickets.view`. The role still decides what it may
 * see, because `can()` intersects, so this widens nothing a role lacks.
 */
function withReads(principal: ApiPrincipal): ApiPrincipal {
	return {
		...principal,
		scopes: [...new Set<Permission>([...principal.scopes, 'tickets.view', 'projects.view'])]
	};
}

const tag = z.string().trim().min(1);
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a date like 2026-10-24.');

/* -------------------------------------------------------------------------- */
/* Wire shapes                                                                */
/* -------------------------------------------------------------------------- */

const timeEntrySchema = named(
	'TimeEntry',
	z.object({
		id: z.uuid(),
		workDate: z.string(),
		person: z.object({ id: z.string(), name: z.string() }),
		type: z.object({ id: z.string(), name: z.string() }),
		minutes: z.number().int(),
		/** Decimal hours, two places: `"1.50"`. */
		hours: z.string(),
		note: z.string().nullable(),
		/** The ticket or task, by its code. `title` is null when the key cannot read that record. */
		record: z.object({
			kind: z.enum(['ticket', 'task']),
			tag: z.string(),
			title: z.string().nullable()
		}),
		/** The project of the task; null on a ticket, and its `name` null when the key cannot read the task. */
		project: z.object({ tag: z.string(), name: z.string().nullable() }).nullable(),
		/** Send it back as `baseRevision` when editing (ADR 0046). */
		revision: z.number().int()
	})
);

function toWire(row: ReportRow): z.input<typeof timeEntrySchema> {
	return {
		id: row.id,
		workDate: row.workDate,
		person: { id: row.personId, name: row.personName },
		type: { id: row.typeId, name: row.typeName },
		minutes: row.minutes,
		hours: (row.minutes / 60).toFixed(2),
		note: row.note,
		record: { kind: row.record.kind, tag: row.record.tag, title: row.record.title },
		project: row.project,
		revision: row.revision
	};
}

/* -------------------------------------------------------------------------- */
/* Refusals                                                                   */
/* -------------------------------------------------------------------------- */

const disabled = {
	as: 'conflict',
	message: 'Time tracking is switched off for this organisation.'
} as const;

/** An act the key may not do and a record it may not see are one answer (ADR 0007). */
const hidden = { as: 'not_found' } as const;

const entryRefusals = {
	forbidden: hidden,
	time_tracking_disabled: disabled,
	record_not_found: hidden,
	entry_not_found: hidden,
	project_archived: { as: 'conflict', message: 'The project is archived: it takes no changes.' },
	invalid_minutes: {
		as: 'field',
		path: 'minutes',
		message: 'Use a whole number of minutes, from 1 to 1440.'
	},
	invalid_date: { as: 'field', path: 'workDate', message: 'Use a real date like 2026-10-24.' },
	future_date: { as: 'field', path: 'workDate', message: 'The work date cannot be in the future.' },
	invalid_type: {
		as: 'field',
		path: 'typeId',
		message: 'Use an active entry type of this organisation.'
	},
	note_too_long: { as: 'field', path: 'note', message: 'The note is too long.' }
} as const;

const createRefusals = refusalTable<EntryFailure>({ ...entryRefusals });

const updateRefusals = refusalTable<EditFailure>({
	...entryRefusals,
	stale_revision: {
		as: 'conflict',
		message: 'The entry changed since it was read.',
		details: ({ revision }) => ({ revision }),
		describe: '`error.details.revision` is the current revision.'
	}
});

const deleteRefusals = refusalTable<EntryFailure>({ ...entryRefusals });

const reportRefusals = refusalTable<ReportFailure>({
	forbidden: hidden,
	time_tracking_disabled: disabled
});

/* -------------------------------------------------------------------------- */
/* Input                                                                      */
/* -------------------------------------------------------------------------- */

/** `minutes` as a number, or `duration` as the text the UI accepts (`1h 30m`, `45m`, `1.5h`). */
const durationFields = {
	minutes: z.number().int().min(1).max(MAX_ENTRY_MINUTES).optional(),
	duration: z
		.string()
		.describe(`The time as text: ${DURATION_GRAMMAR} Send it instead of \`minutes\`.`)
		.optional()
};

function minutesOf(input: { minutes?: number; duration?: string }): number | undefined {
	if (input.duration !== undefined) {
		const parsed = parseDuration(input.duration);
		if (parsed === null) {
			throw invalidField('duration', 'Use 1h 30m, 1h, 45m, 90m or 1.5h, up to 24h.');
		}
		return parsed;
	}
	return input.minutes;
}

async function targetOf(
	principal: ApiPrincipal,
	input: { ticketTag?: string; taskTag?: string }
): Promise<TimeTarget> {
	const actor = withReads(principal);
	if (input.ticketTag !== undefined) {
		const ticket = await getTicketByTag(actor, input.ticketTag);
		if (!ticket.ok) throw notFound('Ticket not found.');
		return { ticketId: ticket.value.id };
	}
	if (!readsProjects(actor)) throw notFound('Task not found.');
	const task = await getTask(actor, input.taskTag!);
	if (!task.ok) throw notFound('Task not found.');
	return { taskId: task.value.id };
}

/**
 * An entry the key has just resolved the record of, as the response shows it:
 * read with the same widened reads that let it name the record (`withReads`).
 */
async function wireOf(principal: ApiPrincipal, row: ReportRow) {
	const [readable] = await redactTimeRows(withReads(principal), [row]);
	return toWire(readable);
}

/**
 * An entry is addressed by id, so its record is resolved before anything is
 * written or shown: one the key can no longer read answers like a missing entry
 * (ADR 0042, ADR 0050).
 */
async function ensureReadable(principal: ApiPrincipal, entryId: string): Promise<void> {
	const target = await entryTarget(principal, entryId);
	if (!target || !(await canReadTimeTarget(withReads(principal), target))) {
		throw notFound('Time entry not found.');
	}
}

/* -------------------------------------------------------------------------- */
/* Endpoints                                                                  */
/* -------------------------------------------------------------------------- */

export const listTimeEntriesEndpoint = defineEndpoint({
	id: 'time.entries.list',
	method: 'GET',
	path: '/time-entries',
	summary: 'List time entries across tickets and tasks, newest work first.',
	description:
		"Returns one page of time entries across tickets and tasks, with the same filters as the `/time` screen: `from` and `to` (inclusive work dates), `personId`, `typeId`, `projectTag` (the tasks of that project), `recordTag` (one ticket or task) and `kind` (`ticket` or `task`: support time against project time). `meta` carries the totals of the whole filtered list and `totalMinutes` its sum. A key whose role holds `time.manage` lists everybody's entries; a key with `time.log` alone lists only the entries of the person behind it, and `personId` cannot widen that. Answers `409 time_tracking_disabled` while the organisation has time tracking switched off.",
	refusalTable: reportRefusals,
	permissions: TIME_READ_PERMISSIONS,
	input: z.object({
		from: day.optional(),
		to: day.optional(),
		personId: z.uuid().optional(),
		typeId: z.uuid().optional(),
		projectTag: tag.optional(),
		recordTag: tag.optional(),
		kind: z.enum(['ticket', 'task']).optional(),
		page: z.coerce.number().optional(),
		perPage: z.coerce.number().optional()
	}),
	output: z.object({
		data: z.array(timeEntrySchema),
		meta: paginationMetaSchema.extend({ totalMinutes: z.number().int() })
	}),
	handler: async ({ principal, input, refuse }) => {
		const { page, perPage, ...filters } = input;
		const result = await reportEntries(principal, filters, { page, perPage });
		if (!result.ok) throw refuse(result.error);

		// Everybody's entries are read with the key's own reads, not widened: a key scoped to
		// `time.manage` alone sees codes, not titles. A key's own entries read as they did when it
		// logged them (`wireOf`): with the reads that let it name the record, still bounded by its role.
		const reads = reportScope(principal) === 'own' ? withReads(principal) : principal;
		const rows = await redactTimeRows(reads, result.value.rows);
		return {
			data: rows.map(toWire),
			meta: { ...toMeta(result.value), totalMinutes: result.value.totalMinutes }
		};
	}
});

export const createTimeEntryEndpoint = defineEndpoint({
	id: 'time.entries.create',
	method: 'POST',
	path: '/time-entries',
	summary: 'Log time on a ticket or a task.',
	description:
		"Logs time on the ticket (`ticketTag`) or the task (`taskTag`), exactly one of them, as the person behind the key: nobody logs on behalf of someone else. The duration is `minutes` (a whole number from 1 to 1440) or `duration` (text such as `1h 30m`, `45m` or `1.5h`; at most 24 hours), exactly one of them. `workDate` is a day that is not in the future in the organisation's time zone. `typeId` defaults to the organisation's default type; see `GET /time-entry-types`. Logging is allowed on resolved or closed tickets and completed tasks, and refused on tasks of an archived project (`409 project_archived`). Answers `409 time_tracking_disabled` while time tracking is switched off.",
	example: {
		taskTag: 'TSK-0042',
		duration: '1h 30m',
		workDate: '2026-10-24',
		note: 'Replaced the toner'
	},
	status: 201,
	refusalTable: createRefusals,
	permissions: LOG,
	input: z
		.object({
			ticketTag: tag.optional(),
			taskTag: tag.optional(),
			...durationFields,
			workDate: day,
			typeId: z.uuid().optional(),
			note: z.string().nullish()
		})
		.refine((value) => (value.ticketTag === undefined) !== (value.taskTag === undefined), {
			message: 'Send exactly one of ticketTag and taskTag.'
		})
		.refine((value) => (value.minutes === undefined) !== (value.duration === undefined), {
			message: 'Send exactly one of minutes and duration.'
		}),
	output: z.object({ data: timeEntrySchema }),
	handler: async ({ principal, input, refuse }) => {
		const minutes = minutesOf(input)!;
		const target = await targetOf(principal, input);

		const outcome = await logTime(principal, target, {
			minutes,
			workDate: input.workDate,
			typeId: input.typeId ?? null,
			note: input.note ?? null
		});
		if (!outcome.ok) throw refuse(outcome.error);

		const row = await getEntry(principal, outcome.value.id);
		return created({ data: await wireOf(principal, row!) }, `/time-entries/${outcome.value.id}`);
	}
});

export const updateTimeEntryEndpoint = defineEndpoint({
	id: 'time.entries.update',
	method: 'PATCH',
	path: '/time-entries/{id}',
	summary: 'Edit a time entry.',
	description:
		'Edits the duration (`minutes` or `duration`), `workDate`, `typeId` or `note` of an entry; a field left out keeps its value, and `note: null` clears it. Only the author edits an entry, or a key whose role holds `time.manage`. `baseRevision` is required: the `revision` the client read. If the entry moved on, nothing is written and the answer is `409 stale_revision` with the current `revision` in `error.details` (ADR 0046). An entry may keep an archived type but not be moved onto one.',
	example: { duration: '2h', baseRevision: 1 },
	refusalTable: updateRefusals,
	permissions: ['time.log', 'time.manage'],
	input: z
		.object({
			id: z.uuid(),
			baseRevision: z.number().int().positive(),
			...durationFields,
			workDate: day.optional(),
			typeId: z.uuid().optional(),
			note: z.string().nullable().optional()
		})
		.refine((value) => value.minutes === undefined || value.duration === undefined, {
			message: 'Send minutes or duration, not both.'
		}),
	output: z.object({ data: timeEntrySchema }),
	handler: async ({ principal, input, refuse }) => {
		// First, before the input is read: `getEntry` answers null while tracking
		// is off, which would surface as a 404 instead of the refusal.
		if (!(await isTimeTrackingEnabled(principal.organisationId))) {
			throw refuse('time_tracking_disabled');
		}
		const minutes = minutesOf(input);
		const current = await getEntry(principal, input.id);
		if (!current) throw notFound('Time entry not found.');
		await ensureReadable(principal, input.id);

		const outcome = await editEntry(principal, input.id, {
			minutes: minutes ?? current.minutes,
			workDate: input.workDate ?? current.workDate,
			typeId: input.typeId ?? current.typeId,
			note: input.note === undefined ? current.note : input.note,
			baseRevision: input.baseRevision
		});
		if (!outcome.ok) throw refuse(outcome.error);

		return { data: await wireOf(principal, (await getEntry(principal, input.id))!) };
	}
});

export const deleteTimeEntryEndpoint = defineEndpoint({
	id: 'time.entries.delete',
	method: 'DELETE',
	path: '/time-entries/{id}',
	summary: 'Delete a time entry.',
	description:
		'Deletes an entry. Only the author deletes an entry, or a key whose role holds `time.manage`. Answers `204` with no body.',
	refusalTable: deleteRefusals,
	permissions: ['time.log', 'time.manage'],
	input: z.object({ id: z.uuid() }),
	output: z.null(),
	handler: async ({ principal, input, refuse }) => {
		// The record is resolved first, but only for an entry the key may change at all:
		// a missing or foreign entry is refused by `deleteEntry` with the same 404.
		if (await getEntry(principal, input.id)) await ensureReadable(principal, input.id);
		const outcome = await deleteEntry(principal, input.id);
		if (!outcome.ok) throw refuse(outcome.error);
		return noContent();
	}
});

export const listTimeEntryTypesEndpoint = defineEndpoint({
	id: 'time.types.list',
	method: 'GET',
	path: '/time-entry-types',
	summary: 'List the time entry types of the organisation.',
	description:
		"Returns the organisation's entry types in display order, archived ones last. Offer only the ones with `archived: false` for new entries; `isDefault` marks the type used when `typeId` is left out. Needs `time.log` or `time.manage`. Answers `409 time_tracking_disabled` while time tracking is switched off.",
	refusalTable: reportRefusals,
	permissions: ['time.log', 'time.manage'],
	input: z.object({}),
	output: z.object({
		data: z.array(
			named(
				'TimeEntryType',
				z.object({
					id: z.uuid(),
					name: z.string(),
					isDefault: z.boolean(),
					archived: z.boolean()
				})
			)
		)
	}),
	handler: async ({ principal, refuse }) => {
		if (!can(principal, 'time.log') && !can(principal, 'time.manage')) throw refuse('forbidden');
		if (!(await isTimeTrackingEnabled(principal.organisationId))) {
			throw refuse('time_tracking_disabled');
		}
		const types = await listTypes(principal.organisationId);
		return {
			data: types.map(({ id, name, isDefault, archived }) => ({ id, name, isDefault, archived }))
		};
	}
});

export const TIME_ENDPOINTS: readonly Endpoint[] = [
	listTimeEntriesEndpoint,
	createTimeEntryEndpoint,
	updateTimeEntryEndpoint,
	deleteTimeEntryEndpoint,
	listTimeEntryTypesEndpoint
];
