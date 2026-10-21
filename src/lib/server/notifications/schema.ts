import { sql } from 'drizzle-orm';
import {
	boolean,
	check,
	index,
	jsonb,
	pgEnum,
	pgTable,
	primaryKey,
	timestamp,
	uniqueIndex,
	uuid
} from 'drizzle-orm/pg-core';
import { organisations, people } from '../directory/schema';
import { projects, tasks } from '../projects/schema';
import { tickets } from '../service-desk/schema';
import type { Snapshot } from './snapshot';
import { NOTIFICATION_CHANNELS, NOTIFICATION_TYPES } from './types';

/**
 * Notifications, preferences and follows (ADR 0040). Cross-cutting like
 * `activity`: this module owns the tables, the domains call `notify` inside their
 * own transaction.
 *
 * It imports the tables of `service-desk` and `projects` for one reason, exactly
 * as `activity` does: a foreign key has to name its table, and the database
 * should refuse a notification about a record that does not exist. The
 * dependency runs one way (a domain calls `notify`; this file points at the
 * domain's table), and no domain imports these tables. ADR 0002's rule binds the
 * domains, and `notifications` is not one of them.
 */

export const notificationType = pgEnum('notification_type', NOTIFICATION_TYPES);
export const notificationChannel = pgEnum('notification_channel', NOTIFICATION_CHANNELS);

export const notifications = pgTable(
	'notifications',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		organisationId: uuid('organisation_id')
			.notNull()
			.references(() => organisations.id, { onDelete: 'cascade' }),
		/** Notifications target people, not users (ADR 0040). */
		recipientPersonId: uuid('recipient_person_id')
			.notNull()
			.references(() => people.id, { onDelete: 'cascade' }),
		actorPersonId: uuid('actor_person_id').references(() => people.id, { onDelete: 'set null' }),
		type: notificationType('type').notNull(),
		ticketId: uuid('ticket_id').references(() => tickets.id, { onDelete: 'cascade' }),
		taskId: uuid('task_id').references(() => tasks.id, { onDelete: 'cascade' }),
		projectId: uuid('project_id').references(() => projects.id, { onDelete: 'cascade' }),
		snapshot: jsonb('snapshot').notNull().$type<Snapshot>(),
		readAt: timestamp('read_at', { withTimezone: true }),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
	},
	(table) => [
		check(
			'notifications_exactly_one_target',
			sql`num_nonnulls(${table.ticketId}, ${table.taskId}, ${table.projectId}) = 1`
		),
		index('notifications_recipient_created').on(table.recipientPersonId, table.createdAt.desc()),
		index('notifications_recipient_unread')
			.on(table.recipientPersonId)
			.where(sql`${table.readAt} is null`)
	]
);

/** Only rows that differ from `DEFAULTS` exist (#302 writes them). */
export const notificationPreferences = pgTable(
	'notification_preferences',
	{
		personId: uuid('person_id')
			.notNull()
			.references(() => people.id, { onDelete: 'cascade' }),
		type: notificationType('type').notNull(),
		channel: notificationChannel('channel').notNull(),
		enabled: boolean('enabled').notNull(),
		updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
	},
	(table) => [primaryKey({ columns: [table.personId, table.type, table.channel] })]
);

/** Created now so #303 and #57 need no migration; nothing writes it yet. */
export const follows = pgTable(
	'follows',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		organisationId: uuid('organisation_id')
			.notNull()
			.references(() => organisations.id, { onDelete: 'cascade' }),
		personId: uuid('person_id')
			.notNull()
			.references(() => people.id, { onDelete: 'cascade' }),
		ticketId: uuid('ticket_id').references(() => tickets.id, { onDelete: 'cascade' }),
		taskId: uuid('task_id').references(() => tasks.id, { onDelete: 'cascade' }),
		projectId: uuid('project_id').references(() => projects.id, { onDelete: 'cascade' }),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
	},
	(table) => [
		check(
			'follows_exactly_one_target',
			sql`num_nonnulls(${table.ticketId}, ${table.taskId}, ${table.projectId}) = 1`
		),
		uniqueIndex('follows_person_ticket')
			.on(table.personId, table.ticketId)
			.where(sql`${table.ticketId} is not null`),
		uniqueIndex('follows_person_task')
			.on(table.personId, table.taskId)
			.where(sql`${table.taskId} is not null`),
		uniqueIndex('follows_person_project')
			.on(table.personId, table.projectId)
			.where(sql`${table.projectId} is not null`)
	]
);

export type NotificationRow = typeof notifications.$inferSelect;
