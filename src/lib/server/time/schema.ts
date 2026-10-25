import { sql } from 'drizzle-orm';
import {
	boolean,
	check,
	date,
	index,
	integer,
	pgTable,
	text,
	timestamp,
	uniqueIndex,
	uuid
} from 'drizzle-orm/pg-core';
import { timestamps } from '../shared/columns';
import { organisations, people } from '../directory/schema';
import { tasks } from '../projects/schema';
import { tickets } from '../service-desk/schema';

/**
 * Time tracking's tables (ADR 0051). Cross-cutting like `activity`: typed
 * nullable foreign keys to the two records time can be logged on, and a `CHECK`
 * that exactly one is set, so the database refuses an entry on nothing or on two
 * records and a ticket or task cannot be left with entries pointing at it.
 */

/** The organisation's catalogue of what kind of work an entry records. */
export const timeEntryTypes = pgTable(
	'time_entry_types',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		organisationId: uuid('organisation_id')
			.notNull()
			.references(() => organisations.id, { onDelete: 'cascade' }),
		name: text('name').notNull(),
		/** Display order. */
		position: integer('position').notNull(),
		isDefault: boolean('is_default').notNull().default(false),
		/** Null is active. An archived type is not offered, but keeps its entries. */
		archivedAt: timestamp('archived_at', { withTimezone: true }),
		...timestamps
	},
	(table) => [
		check('time_entry_types_name_not_empty', sql`length(trim(${table.name})) > 0`),
		// Unique among the types still on offer: an archived name can be taken again.
		uniqueIndex('time_entry_types_org_name')
			.on(table.organisationId, sql`lower(${table.name})`)
			.where(sql`${table.archivedAt} is null`),
		uniqueIndex('time_entry_types_org_default')
			.on(table.organisationId)
			.where(sql`${table.isDefault} and ${table.archivedAt} is null`)
	]
);

export const timeEntries = pgTable(
	'time_entries',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		organisationId: uuid('organisation_id')
			.notNull()
			.references(() => organisations.id, { onDelete: 'cascade' }),
		// Exactly one of the two is set. Cascade matches `activity`: today neither
		// tickets nor tasks are hard-deleted.
		ticketId: uuid('ticket_id').references(() => tickets.id, { onDelete: 'cascade' }),
		taskId: uuid('task_id').references(() => tasks.id, { onDelete: 'cascade' }),
		/** The author. An entry is first-person, and nobody is deleted while one points at them. */
		personId: uuid('person_id')
			.notNull()
			.references(() => people.id, { onDelete: 'restrict' }),
		typeId: uuid('type_id')
			.notNull()
			.references(() => timeEntryTypes.id, { onDelete: 'restrict' }),
		minutes: integer('minutes').notNull(),
		/** A calendar date, not an instant: `YYYY-MM-DD` in and out. Never in the future (validated in the domain). */
		workDate: date('work_date', { mode: 'string' }).notNull(),
		note: text('note'),
		/** ADR 0046: bumped on every edit, compared by the API's `baseRevision`. */
		revision: integer('revision').notNull().default(1),
		...timestamps
	},
	(table) => [
		check('time_entries_minutes_positive', sql`${table.minutes} > 0`),
		check(
			'time_entries_exactly_one_target',
			sql`num_nonnulls(${table.ticketId}, ${table.taskId}) = 1`
		),
		index('time_entries_org_work_date').on(table.organisationId, table.workDate),
		index('time_entries_ticket').on(table.ticketId),
		index('time_entries_task').on(table.taskId),
		index('time_entries_person_work_date').on(table.personId, table.workDate)
	]
);

/** The timer somebody has running: server-side, so it survives devices and reloads. */
export const runningTimers = pgTable(
	'running_timers',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		organisationId: uuid('organisation_id')
			.notNull()
			.references(() => organisations.id, { onDelete: 'cascade' }),
		/** Unique: one running timer per person. */
		personId: uuid('person_id')
			.notNull()
			.unique()
			.references(() => people.id, { onDelete: 'cascade' }),
		ticketId: uuid('ticket_id').references(() => tickets.id, { onDelete: 'cascade' }),
		taskId: uuid('task_id').references(() => tasks.id, { onDelete: 'cascade' }),
		startedAt: timestamp('started_at', { withTimezone: true }).notNull()
	},
	(table) => [
		check(
			'running_timers_exactly_one_target',
			sql`num_nonnulls(${table.ticketId}, ${table.taskId}) = 1`
		)
	]
);

export type TimeEntryType = typeof timeEntryTypes.$inferSelect;
export type TimeEntryRow = typeof timeEntries.$inferSelect;
export type RunningTimerRow = typeof runningTimers.$inferSelect;
