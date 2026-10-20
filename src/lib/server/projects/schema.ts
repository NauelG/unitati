import { sql, type SQL } from 'drizzle-orm';
import {
	date,
	index,
	integer,
	numeric,
	pgEnum,
	pgSequence,
	pgTable,
	primaryKey,
	text,
	timestamp,
	unique,
	uuid
} from 'drizzle-orm/pg-core';
import { STATE_GROUPS } from '#lib/domain/status.js';
import { timestamps } from '../shared/columns';
import { searchVector, tsvector } from '../shared/search-vector';
import { organisations, people } from '../directory/schema';

/**
 * Projects, their tasks, and the catalogue of states a task moves through.
 *
 * Foreign keys into `directory` are legitimate (ADR 0002). Nothing here points
 * at `assets` or `service-desk`: projects relate to them through `links`
 * (ADR 0005).
 *
 * **No phase, no deletion.** A project's progress is derived from where its
 * tasks sit (`projectProgress`), and projects archive while tasks go to a
 * `cancelled` state, so a code and its history never disappear. The reasons are
 * recorded in #10.
 *
 * Prose is searched with the **Spanish** dictionary, like tickets: a task title
 * is a sentence, and "mudanzas" has to find "Mudanza". The vectors go through
 * `immutable_unaccent` for the same reason (see `shared/search-vector.ts`).
 */

/** `PRJ-####` and `TSK-####` come from these (ADR 0010). One sequence per entity type. */
export const projectCodeSequence = pgSequence('project_code_seq');
export const taskCodeSequence = pgSequence('task_code_seq');

/** Built from the shared vocabulary, never restated (ADR 0011). */
export const stateGroup = pgEnum('state_group', STATE_GROUPS);

/**
 * The organisation's board columns. `name` and `position` belong to the
 * organisation; `group` is the product's and is fixed at creation, because
 * changing it would rewrite what every past move into this state meant.
 */
export const states = pgTable(
	'states',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		organisationId: uuid('organisation_id')
			.notNull()
			.references(() => organisations.id, { onDelete: 'cascade' }),
		name: text('name').notNull(),
		group: stateGroup('group').notNull(),
		/** Order within the group; board order is (group, position). */
		position: integer('position').notNull(),
		...timestamps
	},
	(table) => [unique('states_org_name').on(table.organisationId, table.name)]
);

export const projects = pgTable(
	'projects',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		organisationId: uuid('organisation_id')
			.notNull()
			.references(() => organisations.id, { onDelete: 'cascade' }),
		/** Generated, then editable: the default is a starting value (ADR 0010). */
		projectTag: text('project_tag')
			.notNull()
			.default(sql`'PRJ-' || lpad(nextval('project_code_seq')::text, 4, '0')`),
		name: text('name').notNull(),
		description: text('description'),
		ownerPersonId: uuid('owner_person_id').references(() => people.id, { onDelete: 'set null' }),
		/** A calendar date, not an instant: `YYYY-MM-DD` in and out. */
		dueDate: date('due_date', { mode: 'string' }),
		/** Archived means read-only. There is no delete. */
		archivedAt: timestamp('archived_at', { withTimezone: true }),
		search: tsvector('search')
			.notNull()
			.generatedAlwaysAs((): SQL =>
				searchVector('spanish', `coalesce("name", '') || ' ' || coalesce("description", '')`)
			),
		...timestamps
	},
	(table) => [
		unique('projects_org_tag').on(table.organisationId, table.projectTag),
		index('projects_org_idx').on(table.organisationId),
		index('projects_owner_idx').on(table.ownerPersonId),
		index('projects_search_gin').using('gin', table.search)
	]
);

export const tasks = pgTable(
	'tasks',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		organisationId: uuid('organisation_id')
			.notNull()
			.references(() => organisations.id, { onDelete: 'cascade' }),
		taskTag: text('task_tag')
			.notNull()
			.default(sql`'TSK-' || lpad(nextval('task_code_seq')::text, 4, '0')`),
		/** Moving a task between projects is #120; nothing here accepts a new one. */
		projectId: uuid('project_id')
			.notNull()
			.references(() => projects.id, { onDelete: 'cascade' }),
		title: text('title').notNull(),
		description: text('description'),
		/**
		 * `restrict`: deleting a state that tasks still sit in must fail loudly, not
		 * silently orphan a board column.
		 */
		stateId: uuid('state_id')
			.notNull()
			.references(() => states.id, { onDelete: 'restrict' }),
		dueDate: date('due_date', { mode: 'string' }),
		/** Fractional index within the board column; see `position.ts`. Read back as a string. */
		position: numeric('position').notNull(),
		search: tsvector('search')
			.notNull()
			.generatedAlwaysAs((): SQL =>
				searchVector('spanish', `coalesce("title", '') || ' ' || coalesce("description", '')`)
			),
		...timestamps
	},
	(table) => [
		unique('tasks_org_tag').on(table.organisationId, table.taskTag),
		index('tasks_column_idx').on(table.projectId, table.stateId, table.position),
		index('tasks_state_idx').on(table.stateId),
		index('tasks_search_gin').using('gin', table.search)
	]
);

/** Many people per task. The pair is the key; "my tasks" reads by `person_id`. */
export const taskAssignees = pgTable(
	'task_assignees',
	{
		organisationId: uuid('organisation_id')
			.notNull()
			.references(() => organisations.id, { onDelete: 'cascade' }),
		taskId: uuid('task_id')
			.notNull()
			.references(() => tasks.id, { onDelete: 'cascade' }),
		personId: uuid('person_id')
			.notNull()
			.references(() => people.id, { onDelete: 'cascade' }),
		...timestamps
	},
	(table) => [
		primaryKey({ columns: [table.taskId, table.personId] }),
		index('task_assignees_person_idx').on(table.personId)
	]
);

/**
 * Files attached to a project or to a task (ADR 0039). Each domain owns its
 * attachments table and shares only the byte store, so these cannot be the
 * service desk's `attachments`. They hang off the record itself, not off a
 * comment: tasks have no comment thread. Bytes live in `Storage`, keyed by
 * `storage_key`.
 */
export const projectAttachments = pgTable(
	'project_attachments',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		organisationId: uuid('organisation_id')
			.notNull()
			.references(() => organisations.id, { onDelete: 'cascade' }),
		projectId: uuid('project_id')
			.notNull()
			.references(() => projects.id, { onDelete: 'cascade' }),
		uploadedByPersonId: uuid('uploaded_by_person_id').references(() => people.id, {
			onDelete: 'set null'
		}),
		filename: text('filename').notNull(),
		/** `application/octet-stream` when the browser sends none. */
		contentType: text('content_type').notNull(),
		byteSize: integer('byte_size').notNull(),
		/** Server-generated and opaque: never derived from the filename or the request. */
		storageKey: text('storage_key').notNull().unique(),
		...timestamps
	},
	(table) => [index('project_attachments_project_idx').on(table.projectId)]
);

export const taskAttachments = pgTable(
	'task_attachments',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		organisationId: uuid('organisation_id')
			.notNull()
			.references(() => organisations.id, { onDelete: 'cascade' }),
		taskId: uuid('task_id')
			.notNull()
			.references(() => tasks.id, { onDelete: 'cascade' }),
		uploadedByPersonId: uuid('uploaded_by_person_id').references(() => people.id, {
			onDelete: 'set null'
		}),
		filename: text('filename').notNull(),
		/** `application/octet-stream` when the browser sends none. */
		contentType: text('content_type').notNull(),
		byteSize: integer('byte_size').notNull(),
		/** Server-generated and opaque: never derived from the filename or the request. */
		storageKey: text('storage_key').notNull().unique(),
		...timestamps
	},
	(table) => [index('task_attachments_task_idx').on(table.taskId)]
);

export type State = typeof states.$inferSelect;
export type Project = typeof projects.$inferSelect;
export type Task = typeof tasks.$inferSelect;
export type TaskAssignee = typeof taskAssignees.$inferSelect;
export type ProjectAttachment = typeof projectAttachments.$inferSelect;
export type TaskAttachment = typeof taskAttachments.$inferSelect;
