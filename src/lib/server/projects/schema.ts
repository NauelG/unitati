import { sql, type SQL } from 'drizzle-orm';
import {
	check,
	date,
	foreignKey,
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
 * recorded in #10. Milestones are not a phase either: their status is derived
 * like progress, from their dates and their tasks. They are the one hard-deleted
 * row in the domain, because deleting a milestone destroys no work: its tasks
 * stay, detached (ADR 0054).
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

/**
 * Who may see a project (ADR 0042). `organisation` is every viewer the role
 * rules already admit; `members` narrows that to the people listed in
 * `project_members`, plus admins.
 */
export const projectVisibility = pgEnum('project_visibility', ['organisation', 'members']);

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
		visibility: projectVisibility('visibility').notNull().default('organisation'),
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

/**
 * A dated checkpoint inside one project: a named range that groups some of its
 * tasks (ADR 0054). Status and progress are derived on read and never stored.
 * Identity is the UUID only: no tag, no sequence, no position, no archive.
 */
export const milestones = pgTable(
	'milestones',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		organisationId: uuid('organisation_id')
			.notNull()
			.references(() => organisations.id, { onDelete: 'cascade' }),
		projectId: uuid('project_id')
			.notNull()
			.references(() => projects.id, { onDelete: 'cascade' }),
		/** 1 to 200 characters, trimmed; enforced in the domain. */
		name: text('name').notNull(),
		/** Markdown; the length is enforced in the domain. */
		description: text('description'),
		/** Calendar days, `YYYY-MM-DD`. */
		startDate: date('start_date', { mode: 'string' }).notNull(),
		targetDate: date('target_date', { mode: 'string' }).notNull(),
		...timestamps
	},
	(table) => [
		/** The target of the composite foreign key on `tasks`. */
		unique('milestones_project_id_id').on(table.projectId, table.id),
		check('milestones_dates_ordered', sql`${table.startDate} <= ${table.targetDate}`),
		index('milestones_project_order_idx').on(table.projectId, table.startDate, table.targetDate)
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
		/** 0 or 1 milestone, of the task's own project: see `tasks_milestone_same_project_fk`. */
		milestoneId: uuid('milestone_id'),
		/**
		 * The task this one is a subtask of, of the same project (ADR 0055): see
		 * `tasks_parent_same_project_fk`. One level only, which the domain enforces
		 * under the project lock; `setTaskParent` is the only writer after creation.
		 */
		parentTaskId: uuid('parent_task_id'),
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
		index('tasks_milestone_idx').on(table.milestoneId),
		index('tasks_search_gin').using('gin', table.search),
		/**
		 * Composite, so the database refuses a milestone of another project. With the
		 * default `MATCH SIMPLE` a task whose `milestone_id` is null is not checked.
		 * **The migration is hand-edited:** Drizzle emits `ON DELETE set null`, which
		 * would also null `project_id` (NOT NULL) and fail every milestone delete; the
		 * SQL carries `ON DELETE SET NULL ("milestone_id")`, which Drizzle cannot
		 * express (PostgreSQL 15+).
		 */
		foreignKey({
			name: 'tasks_milestone_same_project_fk',
			columns: [table.projectId, table.milestoneId],
			foreignColumns: [milestones.projectId, milestones.id]
		}).onDelete('set null'),
		/** The target of `tasks_parent_same_project_fk`. */
		unique('tasks_project_id_unique').on(table.projectId, table.id),
		/**
		 * A parent of the task's own project (ADR 0055), the shape of
		 * `tasks_milestone_same_project_fk` and **hand-edited the same way** to
		 * `ON DELETE SET NULL ("parent_task_id")`. `MATCH SIMPLE`: a task without a
		 * parent is not checked. Checked at the end of each statement, so a family
		 * changes project in one `UPDATE` (`reparentTask`).
		 */
		foreignKey({
			name: 'tasks_parent_same_project_fk',
			columns: [table.projectId, table.parentTaskId],
			foreignColumns: [table.projectId, table.id]
		}).onDelete('set null'),
		check(
			'tasks_parent_not_self',
			sql`${table.parentTaskId} is null or ${table.parentTaskId} <> ${table.id}`
		),
		index('tasks_parent_idx').on(table.parentTaskId)
	]
);

/**
 * The people a `members` project is visible to. Rows survive a switch back to
 * `organisation` so that switching again restores the same list. Admins see
 * every project and are not listed unless they were added.
 */
export const projectMembers = pgTable(
	'project_members',
	{
		projectId: uuid('project_id')
			.notNull()
			.references(() => projects.id, { onDelete: 'cascade' }),
		personId: uuid('person_id')
			.notNull()
			.references(() => people.id, { onDelete: 'cascade' }),
		organisationId: uuid('organisation_id')
			.notNull()
			.references(() => organisations.id, { onDelete: 'cascade' }),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
	},
	(table) => [
		primaryKey({ columns: [table.projectId, table.personId] }),
		index('project_members_person_idx').on(table.personId)
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
export type ProjectMember = typeof projectMembers.$inferSelect;
export type Task = typeof tasks.$inferSelect;
export type Milestone = typeof milestones.$inferSelect;
export type TaskAssignee = typeof taskAssignees.$inferSelect;
export type ProjectAttachment = typeof projectAttachments.$inferSelect;
export type TaskAttachment = typeof taskAttachments.$inferSelect;

/**
 * Free-text comments on projects. One table per domain (ADR 0043): the
 * foreign key is real, and the author survives as `null` if the person is deleted.
 */
export const projectComments = pgTable(
	'project_comments',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		organisationId: uuid('organisation_id')
			.notNull()
			.references(() => organisations.id, { onDelete: 'cascade' }),
		projectId: uuid('project_id')
			.notNull()
			.references(() => projects.id, { onDelete: 'cascade' }),
		authorPersonId: uuid('author_person_id').references(() => people.id, { onDelete: 'set null' }),
		body: text('body').notNull(),
		...timestamps
	},
	(table) => [index('project_comments_project_created').on(table.projectId, table.createdAt)]
);

/**
 * Free-text comments on tasks. One table per domain (ADR 0043): the
 * foreign key is real, and the author survives as `null` if the person is deleted.
 */
export const taskComments = pgTable(
	'task_comments',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		organisationId: uuid('organisation_id')
			.notNull()
			.references(() => organisations.id, { onDelete: 'cascade' }),
		taskId: uuid('task_id')
			.notNull()
			.references(() => tasks.id, { onDelete: 'cascade' }),
		authorPersonId: uuid('author_person_id').references(() => people.id, { onDelete: 'set null' }),
		body: text('body').notNull(),
		...timestamps
	},
	(table) => [index('task_comments_task_created').on(table.taskId, table.createdAt)]
);
