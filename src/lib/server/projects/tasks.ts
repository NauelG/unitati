import {
	and,
	asc,
	desc,
	eq,
	exists,
	inArray,
	isNull,
	ne,
	notInArray,
	sql,
	type SQL
} from 'drizzle-orm';
import { CLOSED_STATE_GROUPS, isClosedGroup, type StateGroup } from '#lib/domain/status.js';
import { actorColumns, recordActivity } from '../activity';
import type { SessionUser } from '../auth/guards';
import { m } from '#lib/paraglide/messages.js';
import { notify, type PendingEmail } from '../notifications';
import { getDb, type Transaction } from '../db';
import { constraintViolation, uniqueConstraintName } from '../db/errors';
import { people } from '../directory/schema';
import { emit, type DomainEvents } from '../shared/events';
import { failure, success, type Outcome } from '../shared/outcome';
import { page, pageWindow, type Page, type PageRequest } from '../shared/pagination';
import type { ProjectVisibility } from './members';
import { placeBetween, spread } from '../shared/position';
import { matchesQuery } from './search';
import { milestones, projects, states, taskAssignees, tasks } from './schema';
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
	sendAfterCommit,
	tellFollowers,
	type MailDeps,
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

/** A task named by its code and title: a subtask's parent, a refusal's list. */
export type TaskRef = { taskTag: string; title: string };

/**
 * A task's children as the viewer may count them (ADR 0055 §10). `total` and
 * `completed` cover the visible, non-cancelled ones, the milestone formula;
 * `restricted` the children the viewer cannot see, whatever their state.
 */
export type SubtaskCounts = { total: number; completed: number; restricted: number };

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
	/** The milestone the task counts towards, of its own project. */
	milestoneId: string | null;
	milestoneName: string | null;
	/** `YYYY-MM-DD`. */
	dueDate: string | null;
	/** Place in the board column; only the order of two of them means anything. */
	position: number;
	assignees: TaskAssigneeView[];
	/** The task this one is a subtask of; `null` too when the viewer cannot see it (ADR 0042). */
	parent: TaskRef | null;
	subtasks: SubtaskCounts;
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
	milestoneId: tasks.milestoneId,
	milestoneName: milestones.name,
	dueDate: tasks.dueDate,
	position: tasks.position,
	/** Read to find the parent, never handed out: a hidden parent must not leak its id. */
	parentTaskId: tasks.parentTaskId,
	createdAt: tasks.createdAt,
	updatedAt: tasks.updatedAt
};

function tasksWithRelations() {
	return getDb()
		.select(taskColumns)
		.from(tasks)
		.innerJoin(projects, eq(tasks.projectId, projects.id))
		.innerJoin(states, eq(tasks.stateId, states.id))
		.leftJoin(milestones, eq(tasks.milestoneId, milestones.id));
}

type TaskRow = Awaited<ReturnType<typeof tasksWithRelations>>[number];

const NO_SUBTASKS: SubtaskCounts = { total: 0, completed: 0, restricted: 0 };

/**
 * Assignees, parent and subtask counts: further queries rather than joins, so a
 * task with three assignees is still one row. Each relative is read through the
 * viewer's own scope (ADR 0055 §9): seeing a task never grants sight of its
 * parent or its children, which is why a hidden parent reads as `null` and
 * hidden children only as a count.
 */
async function withRelations(viewer: SessionUser, rows: TaskRow[]): Promise<TaskView[]> {
	if (rows.length === 0) return [];

	const ids = rows.map((row) => row.id);
	const parentIds = [
		...new Set(rows.flatMap((row) => (row.parentTaskId === null ? [] : [row.parentTaskId])))
	];
	const visible = requireTaskScope(viewer);

	const [assigned, parents, children] = await Promise.all([
		getDb()
			.select({
				taskId: taskAssignees.taskId,
				personId: taskAssignees.personId,
				fullName: people.fullName
			})
			.from(taskAssignees)
			.innerJoin(people, eq(taskAssignees.personId, people.id))
			.where(inArray(taskAssignees.taskId, ids))
			.orderBy(asc(people.fullName), asc(people.id)),
		parentIds.length === 0
			? []
			: getDb()
					.select({ id: tasks.id, taskTag: tasks.taskTag, title: tasks.title })
					.from(tasks)
					.where(and(visible, inArray(tasks.id, parentIds))),
		getDb()
			.select({
				parentTaskId: tasks.parentTaskId,
				total: sql<number>`(count(*) filter (where (${visible}) and ${states.group} <> 'cancelled'))::int`,
				completed: sql<number>`(count(*) filter (where (${visible}) and ${states.group} = 'completed'))::int`,
				restricted: sql<number>`(count(*) filter (where not (${visible})))::int`
			})
			.from(tasks)
			.innerJoin(states, eq(tasks.stateId, states.id))
			.where(inArray(tasks.parentTaskId, ids))
			.groupBy(tasks.parentTaskId)
	]);

	return rows.map(({ parentTaskId, ...row }) => {
		const parent = parents.find((candidate) => candidate.id === parentTaskId);
		const counts = children.find((entry) => entry.parentTaskId === row.id);
		return {
			...row,
			position: Number(row.position),
			assignees: assigned
				.filter((entry) => entry.taskId === row.id)
				.map(({ personId, fullName }) => ({ personId, fullName })),
			parent: parent ? { taskTag: parent.taskTag, title: parent.title } : null,
			subtasks: counts
				? { total: counts.total, completed: counts.completed, restricted: counts.restricted }
				: NO_SUBTASKS
		};
	});
}

export interface TaskListRequest {
	projectId?: string;
	/** A person: the tasks they are one of the assignees of. */
	assignee?: string;
	group?: StateGroup;
	/** A milestone id, or `'none'` for the tasks that have no milestone. */
	milestone?: string;
	/** A task id: its subtasks. */
	parentTaskId?: string;
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
		request.milestone === 'none'
			? isNull(tasks.milestoneId)
			: request.milestone
				? eq(tasks.milestoneId, request.milestone)
				: undefined,
		request.parentTaskId ? eq(tasks.parentTaskId, request.parentTaskId) : undefined,
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

	if (!paging) return withRelations(viewer, await ordered);

	const window = pageWindow(paging);
	const rows = await ordered.limit(window.limit).offset(window.offset);
	const [counted] = await getDb()
		.select({ total: sql<number>`count(*)::int` })
		.from(tasks)
		.innerJoin(states, eq(tasks.stateId, states.id))
		.where(where);

	return page(await withRelations(viewer, rows), counted?.total ?? 0, window);
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

	return withRelations(viewer, rows);
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
	const [task] = await withRelations(viewer, rows);

	return task ? success(task) : failure('task_not_found');
}

/**
 * The subtasks of a task the viewer can see, in board order: only the visible
 * ones, the rest are `subtasks.restricted` on the parent (ADR 0055 §9). **The
 * caller has resolved the parent in the viewer's scope first.**
 */
export async function subtasksOf(viewer: SessionUser, taskId: string): Promise<TaskView[]> {
	return listTasks(viewer, { parentTaskId: taskId });
}

/* -------------------------------------------------------------------------- */
/* Writes                                                                     */
/* -------------------------------------------------------------------------- */

/** Why a task cannot go under a parent (ADR 0055), shared by creation and `setTaskParent`. */
export type ParentFailure = 'parent_not_found' | 'parent_is_subtask' | 'parent_closed';

export type CreateTaskFailure =
	| ProjectWriteFailure
	| ParentFailure
	| 'state_not_found'
	| 'milestone_not_found'
	| 'duplicate_task_tag';
export type UpdateTaskFailure = TaskWriteFailure | 'duplicate_task_tag';
export type AssignFailure = TaskWriteFailure | 'person_not_found' | 'not_a_member';
export type MoveTaskFailure =
	| TaskWriteFailure
	| 'state_not_found'
	| 'invalid_neighbours'
	/** A child left a closed group while its parent is closed. */
	| 'parent_closed'
	/** A parent entered a closed group while these children are open. */
	| { kind: 'open_subtasks'; subtasks: TaskRef[] };
export type SetTaskParentFailure =
	TaskWriteFailure | ParentFailure | 'same_task' | 'task_has_subtasks';

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

	// Born in a milestone: `task.created` covers it, no `task.milestone.changed`.
	if (values.milestoneId && !(await milestoneOfProject(tx, projectId, values.milestoneId))) {
		return failure('milestone_not_found' as const);
	}

	// Born as a subtask: the same rules as `setTaskParent`, and `task.created` says so.
	let parent: ParentCandidate | null = null;
	if (values.parentTaskId) {
		const found = await parentFor(tx, actor, projectId, values.parentTaskId, state.group);
		if (!found.ok) return found;
		parent = found.value;
	}

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
			// A subtask inherits its parent's milestone, and nothing else (ADR 0055 §11).
			milestoneId: parent ? parent.milestoneId : (values.milestoneId ?? null),
			parentTaskId: parent?.id ?? null,
			position: String(placed.position),
			taskTag: values.taskTag
		})
		.returning({ id: tasks.id, taskTag: tasks.taskTag, title: tasks.title });

	await recordActivity(tx, {
		organisationId: actor.organisationId,
		...actorColumns(actor),
		target: { taskId: task.id },
		verb: 'task.created',
		payload: {
			taskTag: task.taskTag,
			title: task.title,
			...(parent ? { parent: parentSnapshot(parent) } : {})
		}
	});

	return success({ id: task.id, taskTag: task.taskTag });
}

type ParentCandidate = {
	id: string;
	taskTag: string;
	title: string;
	parentTaskId: string | null;
	milestoneId: string | null;
	group: StateGroup;
};

/**
 * A task as a history entry names it (ADR 0055 §12): the code and title as they
 * read now, with the id so a reader who cannot see it gets them redacted
 * (`redactWorkEntries`, ADR 0042).
 */
const parentSnapshot = (task: { id: string; taskTag: string; title: string }) => ({
	taskId: task.id,
	taskTag: task.taskTag,
	title: task.title
});

/** A task of the project, as a parent candidate. Out of the actor's scope reads as absent. */
async function parentCandidate(
	tx: Transaction,
	actor: SessionUser,
	projectId: string,
	taskId: string
): Promise<ParentCandidate | null> {
	const [row] = await tx
		.select({
			id: tasks.id,
			taskTag: tasks.taskTag,
			title: tasks.title,
			parentTaskId: tasks.parentTaskId,
			milestoneId: tasks.milestoneId,
			group: states.group
		})
		.from(tasks)
		.innerJoin(states, eq(tasks.stateId, states.id))
		.where(and(eq(tasks.id, taskId), eq(tasks.projectId, projectId), requireTaskScope(actor)));
	return row ?? null;
}

/**
 * The parent a task of group `childGroup` may go under, in project `projectId`
 * (ADR 0055). Another project's task, or one out of the actor's scope, is
 * `parent_not_found` (ADR 0042 semantics). One level only: a subtask cannot be a
 * parent. An open task cannot go under a closed parent.
 *
 * **Assumes the project lock is held**, which is what serialises two writes that
 * could together build a second level (A under B while B goes under C).
 */
async function parentFor(
	tx: Transaction,
	actor: SessionUser,
	projectId: string,
	parentTaskId: string,
	childGroup: StateGroup
): Promise<Outcome<ParentCandidate, ParentFailure>> {
	const parent = await parentCandidate(tx, actor, projectId, parentTaskId);
	if (!parent) return failure('parent_not_found');
	if (parent.parentTaskId !== null) return failure('parent_is_subtask');
	if (isClosedGroup(parent.group) && !isClosedGroup(childGroup)) return failure('parent_closed');
	return success(parent);
}

/** The milestone, when it exists **in this project**: another project's reads as absent. */
async function milestoneOfProject(
	tx: Transaction,
	projectId: string,
	milestoneId: string
): Promise<{ id: string; name: string } | null> {
	const [row] = await tx
		.select({ id: milestones.id, name: milestones.name })
		.from(milestones)
		.where(and(eq(milestones.id, milestoneId), eq(milestones.projectId, projectId)));
	return row ?? null;
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
		// The milestone was deleted between the check and the insert.
		if (constraintViolation(error)?.constraint === 'tasks_milestone_same_project_fk') {
			return failure('milestone_not_found');
		}
		// Unreachable under the project lock; kept so a broken invariant reads as missing.
		if (constraintViolation(error)?.constraint === 'tasks_parent_same_project_fk') {
			return failure('parent_not_found');
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
	input: UpdateTaskInput,
	deps: TaskMailDeps = {}
): Promise<Outcome<void, UpdateTaskFailure>> {
	requireManage(actor);
	const values = updateTaskInput.parse(input);

	let emails: PendingEmail[] = [];
	try {
		const outcome = await getDb().transaction(async (tx) => {
			const locked = await lockTask(tx, actor, taskId);
			if (!locked.ok) return locked;
			const { task, project } = locked.value;

			if (values.dueDate !== undefined && values.dueDate !== task.dueDate) {
				await recordActivity(tx, {
					organisationId: actor.organisationId,
					...actorColumns(actor),
					target: { taskId },
					verb: 'task.due.changed',
					payload: { from: task.dueDate, to: values.dueDate }
				});
				emails = await tellFollowers(
					tx,
					actor,
					project,
					{ taskId },
					{ code: values.taskTag ?? task.taskTag, title: values.title ?? task.title },
					m.follow_summary_task_due()
				);
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
		if (outcome.ok) sendAfterCommit(emails, deps);
		return outcome;
	} catch (error) {
		if (uniqueConstraintName(error) === 'tasks_org_tag') return failure('duplicate_task_tag');
		throw error;
	}
}

/**
 * Puts the task in a milestone of **its own project**, or takes it out (`null`).
 * `milestone_not_found` when the milestone does not exist or belongs to another
 * project: not-found semantics, as ADR 0042. Setting the same value writes and
 * records nothing.
 */
export async function setTaskMilestone(
	actor: SessionUser,
	taskId: string,
	milestoneId: string | null
): Promise<Outcome<void, TaskWriteFailure | 'milestone_not_found'>> {
	requireManage(actor);

	return getDb().transaction(async (tx) => {
		const locked = await lockTask(tx, actor, taskId);
		if (!locked.ok) return locked;
		const { task } = locked.value;

		const to = milestoneId ? await milestoneOfProject(tx, task.projectId, milestoneId) : null;
		if (milestoneId && !to) return failure('milestone_not_found' as const);
		if ((task.milestoneId ?? null) === milestoneId) return success(undefined);

		const from = task.milestoneId
			? await milestoneOfProject(tx, task.projectId, task.milestoneId)
			: null;

		await tx.update(tasks).set({ milestoneId, updatedAt: new Date() }).where(eq(tasks.id, taskId));

		await recordActivity(tx, {
			organisationId: actor.organisationId,
			...actorColumns(actor),
			target: { taskId },
			verb: 'task.milestone.changed',
			payload: { from, to }
		});

		return success(undefined);
	});
}

/**
 * Puts the task under a parent of **its own project**, or promotes it to a
 * top-level task (`null`). The only function that writes `parent_task_id` after
 * creation (ADR 0055 §4), under the project lock, which serialises every pair of
 * writes that could together build a second level.
 *
 * - `same_task`; `parent_not_found` for a task of another project or out of the
 *   actor's scope; `parent_is_subtask` when the parent has a parent;
 *   `task_has_subtasks` when the task already has children; `parent_closed` when
 *   the parent is closed and the task is open.
 * - Setting the parent the task already has writes and records nothing.
 * - Records `task.parent.changed` on the child only, with snapshots. The task's
 *   milestone is left alone.
 */
export async function setTaskParent(
	actor: SessionUser,
	taskId: string,
	parentTaskId: string | null
): Promise<Outcome<void, SetTaskParentFailure>> {
	requireManage(actor);

	return getDb().transaction(async (tx) => {
		const locked = await lockTask(tx, actor, taskId);
		if (!locked.ok) return locked;
		const { task } = locked.value;

		if (parentTaskId === task.id) return failure('same_task' as const);
		if ((task.parentTaskId ?? null) === parentTaskId) return success(undefined);

		let to: ParentCandidate | null = null;
		if (parentTaskId !== null) {
			const [state] = await tx
				.select({ group: states.group })
				.from(states)
				.where(eq(states.id, task.stateId));
			const found = await parentFor(tx, actor, task.projectId, parentTaskId, state.group);
			if (!found.ok) return found;
			to = found.value;

			const [child] = await tx
				.select({ id: tasks.id })
				.from(tasks)
				.where(eq(tasks.parentTaskId, task.id))
				.limit(1);
			if (child) return failure('task_has_subtasks' as const);
		}

		await writeParent(tx, actor, task, to);

		return success(undefined);
	});
}

/**
 * The one statement that changes `parent_task_id` after creation, and its
 * `task.parent.changed` on the child (ADR 0055 §4, §12). Shared by
 * `setTaskParent` and by `moveTaskToProject`, which detaches a subtask before
 * moving it; both have validated the change and hold the project lock.
 */
export async function writeParent(
	tx: Transaction,
	actor: SessionUser,
	task: { id: string; parentTaskId: string | null },
	to: { id: string; taskTag: string; title: string } | null
): Promise<void> {
	const [from] = task.parentTaskId
		? await tx
				.select({ id: tasks.id, taskTag: tasks.taskTag, title: tasks.title })
				.from(tasks)
				.where(eq(tasks.id, task.parentTaskId))
		: [];

	await tx
		.update(tasks)
		.set({ parentTaskId: to?.id ?? null, updatedAt: new Date() })
		.where(eq(tasks.id, task.id));

	await recordActivity(tx, {
		organisationId: actor.organisationId,
		...actorColumns(actor),
		target: { taskId: task.id },
		verb: 'task.parent.changed',
		payload: { from: from ? parentSnapshot(from) : null, to: to ? parentSnapshot(to) : null }
	});
}

/* ----------------------------- assignees ----------------------------------- */

export type TaskMailDeps = MailDeps;

/** Adds one assignee; whether they were new. Nothing is announced here, see `announceAssignment`. */
async function addAssignee(
	tx: Transaction,
	actor: SessionUser,
	taskId: string,
	person: { id: string; fullName: string }
): Promise<boolean> {
	const inserted = await tx
		.insert(taskAssignees)
		.values({ organisationId: actor.organisationId, taskId, personId: person.id })
		.onConflictDoNothing()
		.returning({ personId: taskAssignees.personId });
	if (inserted.length === 0) return false;

	await recordActivity(tx, {
		organisationId: actor.organisationId,
		...actorColumns(actor),
		target: { taskId },
		verb: 'task.assigned',
		payload: { toPersonId: person.id, toPersonName: person.fullName }
	});
	return true;
}

/**
 * One notification for one assignment change: the people newly added hear
 * `task.assigned`, and the followers hear that the assignees changed. Together,
 * so a follower who is also assigned gets the one that says most (#57). Only
 * people newly added are told: setting the same set again announces nothing.
 */
async function announceAssignment(
	tx: Transaction,
	actor: SessionUser,
	task: { id: string; taskTag: string; title: string },
	project: typeof projects.$inferSelect,
	added: readonly string[]
): Promise<PendingEmail[]> {
	return notify(tx, {
		organisationId: actor.organisationId,
		actorPersonId: actor.personId,
		target: { taskId: task.id },
		snapshot: { code: task.taskTag, title: task.title, actorName: actor.name },
		followerSummary: m.follow_summary_task_assignees(),
		recipients: added.map((personId) => ({ personId, type: 'task.assigned' as const })),
		followers: true,
		audience: await notificationAudience(tx, project)
	});
}

/** Also used by `members.ts` when a member leaves a project. Whether they were on the task. */
export async function removeAssignee(
	tx: Transaction,
	actor: SessionUser,
	taskId: string,
	person: { id: string; fullName: string }
): Promise<boolean> {
	const removed = await tx
		.delete(taskAssignees)
		.where(and(eq(taskAssignees.taskId, taskId), eq(taskAssignees.personId, person.id)))
		.returning({ personId: taskAssignees.personId });
	if (removed.length === 0) return false;

	await recordActivity(tx, {
		organisationId: actor.organisationId,
		...actorColumns(actor),
		target: { taskId },
		verb: 'task.unassigned',
		payload: { fromPersonId: person.id, fromPersonName: person.fullName }
	});
	return true;
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

		if (await addAssignee(tx, actor, taskId, person)) {
			const { task, project } = locked.value;
			emails = await announceAssignment(tx, actor, task, project, [person.id]);
		}
		return success(undefined);
	});

	sendAfterCommit(emails, deps);
	return outcome;
}

/** Idempotent: removing somebody who is not on the task writes nothing. */
export async function unassign(
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

		if (await removeAssignee(tx, actor, taskId, person)) {
			const { task, project } = locked.value;
			emails = await announceAssignment(tx, actor, task, project, []);
		}
		return success(undefined);
	});

	sendAfterCommit(emails, deps);
	return outcome;
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
		let changed = false;
		for (const leaving of current.filter((entry) => !keep.has(entry.personId))) {
			const removed = await removeAssignee(tx, actor, taskId, {
				id: leaving.personId,
				fullName: leaving.fullName
			});
			changed ||= removed;
		}
		const added: string[] = [];
		for (const person of incoming) {
			if (await addAssignee(tx, actor, taskId, person)) added.push(person.id);
		}
		if (changed || added.length > 0) {
			emails.push(...(await announceAssignment(tx, actor, task, project, added)));
		}

		return success(undefined);
	});

	// A failure rolled everything back, so there is nothing to announce.
	if (outcome.ok) sendAfterCommit(emails, deps);
	return outcome;
}

/* -------------------------------- moving ----------------------------------- */

/**
 * The subtask rules of a move (ADR 0055 §6). Only a move that crosses between
 * an open and a closed group is concerned; reordering, or going from one closed
 * state to another, is not. Nothing cascades: the move is refused instead.
 *
 * - A parent entering a closed group with an open child: `open_subtasks`, listing them.
 * - A child leaving a closed group while its parent is closed: `parent_closed`.
 */
async function familyRefusal(
	tx: Transaction,
	task: { id: string; parentTaskId: string | null },
	fromGroup: StateGroup,
	toGroup: StateGroup
): Promise<Exclude<MoveTaskFailure, TaskWriteFailure | 'state_not_found'> | null> {
	if (!isClosedGroup(fromGroup) && isClosedGroup(toGroup)) {
		const open = await tx
			.select({ taskTag: tasks.taskTag, title: tasks.title })
			.from(tasks)
			.innerJoin(states, eq(tasks.stateId, states.id))
			.where(
				and(eq(tasks.parentTaskId, task.id), notInArray(states.group, [...CLOSED_STATE_GROUPS]))
			)
			.orderBy(asc(tasks.taskTag));
		if (open.length > 0) return { kind: 'open_subtasks', subtasks: open };
	}

	if (isClosedGroup(fromGroup) && !isClosedGroup(toGroup) && task.parentTaskId !== null) {
		const [parent] = await tx
			.select({ group: states.group })
			.from(tasks)
			.innerJoin(states, eq(tasks.stateId, states.id))
			.where(eq(tasks.id, task.parentTaskId));
		if (parent && isClosedGroup(parent.group)) return 'parent_closed';
	}

	return null;
}

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
	neighbours: MoveNeighbours = {},
	deps: TaskMailDeps = {}
): Promise<Outcome<void, MoveTaskFailure>> {
	requireManage(actor);

	let completedEvent: DomainEvents['task.completed'] | null = null;
	const emails: PendingEmail[] = [];

	const outcome = await getDb().transaction(async (tx) => {
		const locked = await lockTask(tx, actor, taskId);
		if (!locked.ok) return locked;
		const { task, project } = locked.value;

		const [target] = await tx
			.select()
			.from(states)
			.where(and(eq(states.id, toStateId), eq(states.organisationId, actor.organisationId)));
		if (!target) return failure('state_not_found' as const);

		const [from] = await tx
			.select({ id: states.id, name: states.name, group: states.group })
			.from(states)
			.where(eq(states.id, task.stateId));

		const refused = await familyRefusal(tx, task, from.group, target.group);
		if (refused) return failure(refused);

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

			// Followers of the task hear every change of state (#57); those of the
			// project only hear that one of its tasks was completed.
			emails.push(
				...(await tellFollowers(
					tx,
					actor,
					project,
					{ taskId: task.id },
					{ code: task.taskTag, title: task.title },
					m.follow_summary_task_state({ state: target.name })
				))
			);

			if (from.group !== 'completed' && target.group === 'completed') {
				emails.push(
					...(await tellFollowers(
						tx,
						actor,
						project,
						{ projectId: project.id },
						{ code: project.projectTag, title: project.name },
						m.follow_summary_project_task_completed({ code: task.taskTag, title: task.title })
					))
				);
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
	if (outcome.ok) sendAfterCommit(emails, deps);
	if (outcome.ok && completedEvent) emit('task.completed', completedEvent);

	return outcome;
}
