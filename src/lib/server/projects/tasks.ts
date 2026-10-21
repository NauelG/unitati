import { and, asc, desc, eq, exists, inArray, ne, sql, type SQL } from 'drizzle-orm';
import type { StateGroup } from '#lib/domain/status.js';
import { actorColumns, recordActivity } from '../activity';
import type { SessionUser } from '../auth/guards';
import { notify, sendNotificationEmails, type PendingEmail } from '../notifications';
import { getDb, type Transaction } from '../db';
import { constraintViolation, uniqueConstraintName } from '../db/errors';
import { people } from '../directory/schema';
import { emit, type DomainEvents } from '../shared/events';
import type { Mailer } from '../shared/mail';
import { runtimeMailer, runtimeOrigin } from '../shared/runtime';
import { failure, success, type Outcome } from '../shared/outcome';
import { page, pageWindow, type Page, type PageRequest } from '../shared/pagination';
import type { ProjectVisibility } from './members';
import { placeBetween, spread } from './position';
import { matchesQuery } from './search';
import { projects, states, taskAssignees, tasks } from './schema';
import { requireManage, requireTaskScope } from './scope';
import { defaultTaskState } from './states';
import {
	createTaskInput,
	updateTaskInput,
	type CreateTaskInput,
	type UpdateTaskInput
} from './validation';
import {
	canBeAssigned,
	findPerson,
	notificationAudience,
	lockProject,
	lockTask,
	type ProjectWriteFailure,
	type TaskWriteFailure
} from './writes';

/**
 * Tasks: reading them (scoped by who is asking) and the writes that change them.
 *
 * **`moveTask` is the only function that changes `state_id` or `position`.**
 * `createTask` chooses where a task starts, `updateTask` has no key for either,
 * and nothing else touches them.
 */

/* -------------------------------------------------------------------------- */
/* Reads                                                                      */
/* -------------------------------------------------------------------------- */

export type TaskAssigneeView = { personId: string; fullName: string };

export type TaskView = {
	id: string;
	taskTag: string;
	projectId: string;
	projectTag: string;
	projectName: string;
	/** The project is archived, so the task is read-only. */
	projectArchived: boolean;
	/** Members-only: assignees must be members of the project (ADR 0042). */
	projectVisibility: ProjectVisibility;
	title: string;
	description: string | null;
	stateId: string;
	stateName: string;
	stateGroup: StateGroup;
	/** `YYYY-MM-DD`. */
	dueDate: string | null;
	/** Place in the board column; only the order of two of them means anything. */
	position: number;
	assignees: TaskAssigneeView[];
	createdAt: Date;
	updatedAt: Date;
};

const taskColumns = {
	id: tasks.id,
	taskTag: tasks.taskTag,
	projectId: tasks.projectId,
	projectTag: projects.projectTag,
	projectName: projects.name,
	projectArchived: sql<boolean>`${projects.archivedAt} is not null`,
	projectVisibility: projects.visibility,
	title: tasks.title,
	description: tasks.description,
	stateId: tasks.stateId,
	stateName: states.name,
	stateGroup: states.group,
	dueDate: tasks.dueDate,
	position: tasks.position,
	createdAt: tasks.createdAt,
	updatedAt: tasks.updatedAt
};

function tasksWithRelations() {
	return getDb()
		.select(taskColumns)
		.from(tasks)
		.innerJoin(projects, eq(tasks.projectId, projects.id))
		.innerJoin(states, eq(tasks.stateId, states.id));
}

type TaskRow = Awaited<ReturnType<typeof tasksWithRelations>>[number];

/** A second query rather than a join, so a task with three assignees is still one row. */
async function withAssignees(rows: TaskRow[]): Promise<TaskView[]> {
	if (rows.length === 0) return [];

	const assigned = await getDb()
		.select({
			taskId: taskAssignees.taskId,
			personId: taskAssignees.personId,
			fullName: people.fullName
		})
		.from(taskAssignees)
		.innerJoin(people, eq(taskAssignees.personId, people.id))
		.where(
			inArray(
				taskAssignees.taskId,
				rows.map((row) => row.id)
			)
		)
		.orderBy(asc(people.fullName), asc(people.id));

	return rows.map((row) => ({
		...row,
		position: Number(row.position),
		assignees: assigned
			.filter((entry) => entry.taskId === row.id)
			.map(({ personId, fullName }) => ({ personId, fullName }))
	}));
}

export interface TaskListRequest {
	projectId?: string;
	/** A person: the tasks they are one of the assignees of. */
	assignee?: string;
	group?: StateGroup;
	q?: string;
}

/**
 * Board order: the state's group and position, then the task's place in its
 * column. Given a `PageRequest`, answers one `Page` whose total is counted over
 * the same scoped query, so it never includes a task the viewer cannot see.
 */
export async function listTasks(
	viewer: SessionUser,
	request?: TaskListRequest
): Promise<TaskView[]>;
export async function listTasks(
	viewer: SessionUser,
	request: TaskListRequest,
	paging: PageRequest
): Promise<Page<TaskView>>;
export async function listTasks(
	viewer: SessionUser,
	request: TaskListRequest = {},
	paging?: PageRequest
): Promise<TaskView[] | Page<TaskView>> {
	const term = request.q?.trim();
	const where = and(
		requireTaskScope(viewer),
		request.projectId ? eq(tasks.projectId, request.projectId) : undefined,
		request.group ? eq(states.group, request.group) : undefined,
		request.assignee ? hasAssignee(request.assignee) : undefined,
		term ? matchesQuery(tasks.search, term) : undefined
	);
	const ordered = tasksWithRelations()
		.where(where)
		.orderBy(
			asc(states.group),
			asc(states.position),
			asc(states.name),
			asc(tasks.position),
			asc(tasks.id)
		);

	if (!paging) return withAssignees(await ordered);

	const window = pageWindow(paging);
	const rows = await ordered.limit(window.limit).offset(window.offset);
	const [counted] = await getDb()
		.select({ total: sql<number>`count(*)::int` })
		.from(tasks)
		.innerJoin(states, eq(tasks.stateId, states.id))
		.where(where);

	return page(await withAssignees(rows), counted?.total ?? 0, window);
}

function hasAssignee(personId: string): SQL {
	return exists(
		getDb()
			.select({ one: sql`1` })
			.from(taskAssignees)
			.where(and(eq(taskAssignees.taskId, tasks.id), eq(taskAssignees.personId, personId)))
	);
}

/**
 * The viewer's own open work: tasks assigned to them whose state is still ahead
 * of them (`unstarted` or `started`). A viewer with no directory record has no
 * assignments, so the answer is zero rather than a query on a null person.
 */
export async function countOpenTasks(viewer: SessionUser): Promise<number> {
	if (viewer.personId === null) return 0;

	const [row] = await getDb()
		.select({ count: sql<number>`count(*)::int` })
		.from(tasks)
		.innerJoin(states, eq(tasks.stateId, states.id))
		.where(
			and(
				requireTaskScope(viewer),
				hasAssignee(viewer.personId),
				inArray(states.group, OPEN_TASK_GROUPS)
			)
		);

	return row?.count ?? 0;
}

/** The viewer's own open tasks, most recently touched first: the overview's "Your work". */
export async function myOpenTasks(viewer: SessionUser, limit = 5): Promise<TaskView[]> {
	if (viewer.personId === null) return [];

	const rows = await tasksWithRelations()
		.where(
			and(
				requireTaskScope(viewer),
				hasAssignee(viewer.personId),
				inArray(states.group, OPEN_TASK_GROUPS)
			)
		)
		.orderBy(desc(tasks.updatedAt), asc(tasks.id))
		.limit(limit);

	return withAssignees(rows);
}

/** The groups that count as "open" for someone's own work. */
export const OPEN_TASK_GROUPS: StateGroup[] = ['unstarted', 'started'];

/** The task behind a `/tasks/TSK-0001` URL (ADR 0010). */
export async function getTask(
	viewer: SessionUser,
	taskTag: string
): Promise<Outcome<TaskView, 'task_not_found'>> {
	const rows = await tasksWithRelations()
		.where(and(requireTaskScope(viewer), eq(tasks.taskTag, taskTag)))
		.limit(1);
	const [task] = await withAssignees(rows);

	return task ? success(task) : failure('task_not_found');
}

/* -------------------------------------------------------------------------- */
/* Writes                                                                     */
/* -------------------------------------------------------------------------- */

export type CreateTaskFailure = ProjectWriteFailure | 'state_not_found' | 'duplicate_task_tag';
export type UpdateTaskFailure = TaskWriteFailure | 'duplicate_task_tag';
export type AssignFailure = TaskWriteFailure | 'person_not_found' | 'not_a_member';
export type MoveTaskFailure = TaskWriteFailure | 'state_not_found' | 'invalid_neighbours';

/** The tasks of one board column in order, optionally leaving one out. */
export async function columnOf(
	tx: Transaction,
	projectId: string,
	stateId: string,
	except?: string
) {
	const rows = await tx
		.select({ id: tasks.id, position: tasks.position })
		.from(tasks)
		.where(
			and(
				eq(tasks.projectId, projectId),
				eq(tasks.stateId, stateId),
				except ? ne(tasks.id, except) : undefined
			)
		)
		.orderBy(asc(tasks.position), asc(tasks.id));

	return rows.map((row) => ({ id: row.id, position: Number(row.position) }));
}

/**
 * The body of `createTask`, for a caller that owns the transaction (an
 * escalation, #149, creates the task and links it atomically).
 *
 * Does **not** catch constraint violations: in Postgres they abort the whole
 * transaction, so only the owner of it can decide what to do. `createTask`
 * maps them to failures; a caller that passes no explicit tag cannot trigger
 * `tasks_org_tag`.
 */
export async function openTask(
	tx: Transaction,
	actor: SessionUser,
	projectId: string,
	values: ReturnType<typeof createTaskInput.parse>
): Promise<Outcome<{ id: string; taskTag: string }, CreateTaskFailure>> {
	requireManage(actor);

	const locked = await lockProject(tx, actor, projectId);
	if (!locked.ok) return locked;

	const state = values.stateId
		? (
				await tx
					.select()
					.from(states)
					.where(
						and(eq(states.id, values.stateId), eq(states.organisationId, actor.organisationId))
					)
			)[0]
		: await defaultTaskState(tx, actor.organisationId);
	if (!state) return failure('state_not_found' as const);

	const column = await columnOf(tx, projectId, state.id);
	const placed = placeBetween(column.at(-1)?.position ?? null, null);
	// Nothing follows the last task, so the end of a column never needs a renumber.
	if (!('position' in placed)) throw new Error('Appending to a column cannot renumber it.');

	const [task] = await tx
		.insert(tasks)
		.values({
			organisationId: actor.organisationId,
			projectId,
			title: values.title,
			description: values.description,
			dueDate: values.dueDate ?? null,
			stateId: state.id,
			position: String(placed.position),
			taskTag: values.taskTag
		})
		.returning({ id: tasks.id, taskTag: tasks.taskTag, title: tasks.title });

	await recordActivity(tx, {
		organisationId: actor.organisationId,
		...actorColumns(actor),
		target: { taskId: task.id },
		verb: 'task.created',
		payload: { taskTag: task.taskTag, title: task.title }
	});

	return success({ id: task.id, taskTag: task.taskTag });
}

/**
 * Opens a task in the project, in `stateId` or, when none is given, in the first
 * open state (`defaultTaskState`), at the end of that column.
 */
export async function createTask(
	actor: SessionUser,
	projectId: string,
	input: CreateTaskInput
): Promise<Outcome<{ id: string; taskTag: string }, CreateTaskFailure>> {
	requireManage(actor);
	const values = createTaskInput.parse(input);

	try {
		return await getDb().transaction((tx) => openTask(tx, actor, projectId, values));
	} catch (error) {
		if (uniqueConstraintName(error) === 'tasks_org_tag') return failure('duplicate_task_tag');
		// The state was deleted between the check and the insert.
		if (constraintViolation(error)?.constraint === 'tasks_state_id_states_id_fk') {
			return failure('state_not_found');
		}
		throw error;
	}
}

/**
 * Title, description, due date and tag. **Not** the project (#120), the state or
 * the position (`moveTask`): there is no key for them to arrive under.
 */
export async function updateTask(
	actor: SessionUser,
	taskId: string,
	input: UpdateTaskInput
): Promise<Outcome<void, UpdateTaskFailure>> {
	requireManage(actor);
	const values = updateTaskInput.parse(input);

	try {
		return await getDb().transaction(async (tx) => {
			const locked = await lockTask(tx, actor, taskId);
			if (!locked.ok) return locked;
			const { task } = locked.value;

			if (values.dueDate !== undefined && values.dueDate !== task.dueDate) {
				await recordActivity(tx, {
					organisationId: actor.organisationId,
					...actorColumns(actor),
					target: { taskId },
					verb: 'task.due.changed',
					payload: { from: task.dueDate, to: values.dueDate }
				});
			}

			await tx
				.update(tasks)
				.set({
					title: values.title,
					description: values.description,
					dueDate: values.dueDate,
					taskTag: values.taskTag,
					updatedAt: new Date()
				})
				.where(eq(tasks.id, taskId));

			return success(undefined);
		});
	} catch (error) {
		if (uniqueConstraintName(error) === 'tasks_org_tag') return failure('duplicate_task_tag');
		throw error;
	}
}

/* ----------------------------- assignees ----------------------------------- */

/** Mail collaborators, injectable so specs need no SMTP; default to the runtime's. */
export interface TaskMailDeps {
	mailer?: Mailer | null;
	origin?: string;
}

function sendAfterCommit(emails: PendingEmail[], deps: TaskMailDeps): void {
	const mailer = deps.mailer === undefined ? runtimeMailer() : deps.mailer;
	void sendNotificationEmails(mailer, emails, deps.origin ?? runtimeOrigin());
}

/** Returns the mails to send once the caller's transaction has committed. */
async function addAssignee(
	tx: Transaction,
	actor: SessionUser,
	task: { id: string; taskTag: string; title: string },
	project: typeof projects.$inferSelect,
	person: { id: string; fullName: string }
): Promise<PendingEmail[]> {
	const taskId = task.id;
	const inserted = await tx
		.insert(taskAssignees)
		.values({ organisationId: actor.organisationId, taskId, personId: person.id })
		.onConflictDoNothing()
		.returning({ personId: taskAssignees.personId });
	if (inserted.length === 0) return [];

	await recordActivity(tx, {
		organisationId: actor.organisationId,
		...actorColumns(actor),
		target: { taskId },
		verb: 'task.assigned',
		payload: { toPersonId: person.id, toPersonName: person.fullName }
	});

	// Only a person newly added is told: `onConflictDoNothing` above returned early
	// for anyone already on the task, so setting the same set again notifies nobody.
	return notify(tx, {
		organisationId: actor.organisationId,
		actorPersonId: actor.personId,
		target: { taskId },
		snapshot: { code: task.taskTag, title: task.title, actorName: actor.name },
		recipients: [{ personId: person.id, type: 'task.assigned' }],
		audience: await notificationAudience(tx, project)
	});
}

/** Also used by `members.ts` when a member leaves a project. */
export async function removeAssignee(
	tx: Transaction,
	actor: SessionUser,
	taskId: string,
	person: { id: string; fullName: string }
): Promise<void> {
	const removed = await tx
		.delete(taskAssignees)
		.where(and(eq(taskAssignees.taskId, taskId), eq(taskAssignees.personId, person.id)))
		.returning({ personId: taskAssignees.personId });
	if (removed.length === 0) return;

	await recordActivity(tx, {
		organisationId: actor.organisationId,
		...actorColumns(actor),
		target: { taskId },
		verb: 'task.unassigned',
		payload: { fromPersonId: person.id, fromPersonName: person.fullName }
	});
}

/** Idempotent: assigning somebody already on the task writes nothing. */
export async function assign(
	actor: SessionUser,
	taskId: string,
	personId: string,
	deps: TaskMailDeps = {}
): Promise<Outcome<void, AssignFailure>> {
	requireManage(actor);

	let emails: PendingEmail[] = [];
	const outcome = await getDb().transaction(async (tx) => {
		const locked = await lockTask(tx, actor, taskId);
		if (!locked.ok) return locked;

		const person = await findPerson(tx, actor.organisationId, personId);
		if (!person) return failure('person_not_found' as const);
		if (!(await canBeAssigned(tx, locked.value.project, person.id))) {
			return failure('not_a_member' as const);
		}

		emails = await addAssignee(tx, actor, locked.value.task, locked.value.project, person);
		return success(undefined);
	});

	sendAfterCommit(emails, deps);
	return outcome;
}

/** Idempotent: removing somebody who is not on the task writes nothing. */
export async function unassign(
	actor: SessionUser,
	taskId: string,
	personId: string
): Promise<Outcome<void, AssignFailure>> {
	requireManage(actor);

	return getDb().transaction(async (tx) => {
		const locked = await lockTask(tx, actor, taskId);
		if (!locked.ok) return locked;

		const person = await findPerson(tx, actor.organisationId, personId);
		if (!person) return failure('person_not_found' as const);

		await removeAssignee(tx, actor, taskId, person);
		return success(undefined);
	});
}

/**
 * Makes the assignees exactly `personIds`: one entry per person added or
 * removed, nothing for a person who stays. All or nothing — an unknown person
 * aborts the whole change.
 */
export async function setAssignees(
	actor: SessionUser,
	taskId: string,
	personIds: readonly string[],
	deps: TaskMailDeps = {}
): Promise<Outcome<void, AssignFailure>> {
	requireManage(actor);
	const wanted = [...new Set(personIds)];

	const emails: PendingEmail[] = [];
	const outcome = await getDb().transaction(async (tx) => {
		const locked = await lockTask(tx, actor, taskId);
		if (!locked.ok) return locked;
		const { task, project } = locked.value;

		const incoming = [];
		for (const personId of wanted) {
			const person = await findPerson(tx, actor.organisationId, personId);
			if (!person) return failure('person_not_found' as const);
			if (!(await canBeAssigned(tx, project, person.id))) {
				return failure('not_a_member' as const);
			}
			incoming.push(person);
		}

		const current = await tx
			.select({ personId: taskAssignees.personId, fullName: people.fullName })
			.from(taskAssignees)
			.innerJoin(people, eq(taskAssignees.personId, people.id))
			.where(eq(taskAssignees.taskId, taskId));

		const keep = new Set(wanted);
		for (const leaving of current.filter((entry) => !keep.has(entry.personId))) {
			await removeAssignee(tx, actor, taskId, { id: leaving.personId, fullName: leaving.fullName });
		}
		for (const person of incoming)
			emails.push(...(await addAssignee(tx, actor, task, project, person)));

		return success(undefined);
	});

	// A failure rolled everything back, so there is nothing to announce.
	if (outcome.ok) sendAfterCommit(emails, deps);
	return outcome;
}

/* -------------------------------- moving ----------------------------------- */

export interface MoveNeighbours {
	/** The task the moved one is dropped **before**: it ends up directly below the moved task. */
	before?: string;
	/** The task the moved one is dropped **after**: it ends up directly above the moved task. */
	after?: string;
}

/**
 * Moves a task to a column and a place in it. The only function that writes
 * `state_id` or `position`.
 *
 * - No neighbours: the end of the target column.
 * - `after` and/or `before`: between them (the midpoint of their positions);
 *   with only one, between it and its actual neighbour in the column.
 * - A gap below `MIN_GAP` renumbers the column in the same transaction.
 * - A move within the same state records nothing; a move across states records
 *   exactly one `task.state.changed`, with the state names as they read now.
 * - A move from any other group into `completed` emits `task.completed` once
 *   the transaction has committed (ADR 0024). `projects` does not know who
 *   listens.
 *
 * Neighbours must be other tasks of the same project in the target column.
 */
export async function moveTask(
	actor: SessionUser,
	taskId: string,
	toStateId: string,
	neighbours: MoveNeighbours = {}
): Promise<Outcome<void, MoveTaskFailure>> {
	requireManage(actor);

	let completedEvent: DomainEvents['task.completed'] | null = null;

	const outcome = await getDb().transaction(async (tx) => {
		const locked = await lockTask(tx, actor, taskId);
		if (!locked.ok) return locked;
		const { task } = locked.value;

		const [target] = await tx
			.select()
			.from(states)
			.where(and(eq(states.id, toStateId), eq(states.organisationId, actor.organisationId)));
		if (!target) return failure('state_not_found' as const);

		const column = await columnOf(tx, task.projectId, target.id, task.id);

		const above =
			neighbours.after === undefined ? -1 : column.findIndex((t) => t.id === neighbours.after);
		const below =
			neighbours.before === undefined
				? column.length
				: column.findIndex((t) => t.id === neighbours.before);
		if (neighbours.after !== undefined && above === -1)
			return failure('invalid_neighbours' as const);
		if (neighbours.before !== undefined && below === -1)
			return failure('invalid_neighbours' as const);

		// Which two tasks bracket the drop. With one named neighbour the other is
		// whoever actually sits next to it; with none, the drop is the end.
		let lowerIndex: number;
		let upperIndex: number;
		if (neighbours.after !== undefined && neighbours.before !== undefined) {
			if (above >= below) return failure('invalid_neighbours' as const);
			lowerIndex = above;
			upperIndex = below;
		} else if (neighbours.after !== undefined) {
			lowerIndex = above;
			upperIndex = above + 1;
		} else if (neighbours.before !== undefined) {
			lowerIndex = below - 1;
			upperIndex = below;
		} else {
			lowerIndex = column.length - 1;
			upperIndex = column.length;
		}

		const bracket = () => ({
			lower: lowerIndex >= 0 ? column[lowerIndex].position : null,
			upper: upperIndex < column.length ? column[upperIndex].position : null
		});

		let placed = placeBetween(bracket().lower, bracket().upper);

		if ('renumber' in placed) {
			const renumbered = spread(column.length);
			for (const [index, position] of renumbered.entries()) {
				column[index].position = position;
				await tx
					.update(tasks)
					.set({ position: String(position) })
					.where(eq(tasks.id, column[index].id));
			}
			placed = placeBetween(bracket().lower, bracket().upper);
		}
		if (!('position' in placed)) throw new Error('A renumbered column always has room.');

		await tx
			.update(tasks)
			.set({ stateId: target.id, position: String(placed.position), updatedAt: new Date() })
			.where(eq(tasks.id, task.id));

		if (task.stateId !== target.id) {
			const [from] = await tx
				.select({ id: states.id, name: states.name, group: states.group })
				.from(states)
				.where(eq(states.id, task.stateId));

			await recordActivity(tx, {
				organisationId: actor.organisationId,
				...actorColumns(actor),
				target: { taskId: task.id },
				verb: 'task.state.changed',
				payload: {
					fromStateId: from.id,
					fromStateName: from.name,
					toStateId: target.id,
					toStateName: target.name
				}
			});

			if (from.group !== 'completed' && target.group === 'completed') {
				completedEvent = {
					organisationId: actor.organisationId,
					taskId: task.id,
					taskTag: task.taskTag,
					taskTitle: task.title,
					fromStateName: from.name,
					toStateName: target.name,
					actorPersonId: actor.personId,
					occurredAt: new Date()
				};
			}
		}

		return success(undefined);
	});

	// After commit, never inside the transaction: a rolled-back move emits nothing.
	if (outcome.ok && completedEvent) emit('task.completed', completedEvent);

	return outcome;
}
