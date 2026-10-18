import { and, asc, eq, inArray, isNotNull, isNull, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { STATE_GROUPS, type StateGroup } from '#lib/domain/status.js';
import { actorColumns, recordActivity } from '../activity';
import type { SessionUser } from '../auth/guards';
import { getDb, type Transaction } from '../db';
import { uniqueConstraintName } from '../db/errors';
import { people } from '../directory/schema';
import { failure, success, type Outcome } from '../shared/outcome';
import { page, pageWindow, type Page, type PageRequest } from '../shared/pagination';
import { matchesQuery } from './search';
import { projects, states, tasks } from './schema';
import { requireManage, requireProjectScope, requireTaskScope } from './scope';
import {
	createProjectInput,
	updateProjectInput,
	type CreateProjectInput,
	type UpdateProjectInput
} from './validation';
import { findPerson, lockProject, type ProjectWriteFailure } from './writes';

/**
 * Projects: reading them (scoped by who is asking) and the writes that change
 * them. An event is recorded in `activity` inside its own transaction
 * (ADR 0009); edits to the name and description are not events, as tickets do
 * not log theirs either.
 *
 * **Archived means read-only, and there is no delete.** Every write below goes
 * through `lockProject`, which refuses an archived project with a typed error;
 * `unarchiveProject` is the one write allowed on one, and after it the same
 * writes succeed.
 */

/* -------------------------------------------------------------------------- */
/* Reads                                                                      */
/* -------------------------------------------------------------------------- */

const owner = alias(people, 'owner');

const projectColumns = {
	id: projects.id,
	projectTag: projects.projectTag,
	name: projects.name,
	description: projects.description,
	ownerPersonId: projects.ownerPersonId,
	ownerName: owner.fullName,
	dueDate: projects.dueDate,
	archivedAt: projects.archivedAt,
	createdAt: projects.createdAt,
	updatedAt: projects.updatedAt
};

export type ProjectView = {
	id: string;
	projectTag: string;
	name: string;
	description: string | null;
	ownerPersonId: string | null;
	ownerName: string | null;
	/** `YYYY-MM-DD`. */
	dueDate: string | null;
	archivedAt: Date | null;
	createdAt: Date;
	updatedAt: Date;
};

function projectsWithOwner() {
	return getDb()
		.select(projectColumns)
		.from(projects)
		.leftJoin(owner, eq(projects.ownerPersonId, owner.id));
}

export interface ProjectListRequest {
	/** `true`: only the archived ones. Omitted or `false`: only the active ones. */
	archived?: boolean;
	q?: string;
}

/**
 * Active by default; the soonest due date first, projects with none last. Given
 * a `PageRequest`, answers one `Page` whose total is counted over the same
 * scoped query, so it never includes a project the viewer cannot see.
 */
export async function listProjects(
	viewer: SessionUser,
	request?: ProjectListRequest
): Promise<ProjectView[]>;
export async function listProjects(
	viewer: SessionUser,
	request: ProjectListRequest,
	paging: PageRequest
): Promise<Page<ProjectView>>;
export async function listProjects(
	viewer: SessionUser,
	request: ProjectListRequest = {},
	paging?: PageRequest
): Promise<ProjectView[] | Page<ProjectView>> {
	const term = request.q?.trim();
	const where = and(
		requireProjectScope(viewer),
		request.archived ? isNotNull(projects.archivedAt) : isNull(projects.archivedAt),
		term ? matchesQuery(projects.search, term) : undefined
	);
	const ordered = projectsWithOwner()
		.where(where)
		.orderBy(sql`${projects.dueDate} asc nulls last`, asc(projects.name), asc(projects.id));

	if (!paging) return ordered;

	const window = pageWindow(paging);
	const rows = await ordered.limit(window.limit).offset(window.offset);
	const [counted] = await getDb()
		.select({ total: sql<number>`count(*)::int` })
		.from(projects)
		.where(where);

	return page(rows, counted?.total ?? 0, window);
}

/** How many active projects the viewer can see; the sidebar's count. */
export async function countActiveProjects(viewer: SessionUser): Promise<number> {
	const [row] = await getDb()
		.select({ count: sql<number>`count(*)::int` })
		.from(projects)
		.where(and(requireProjectScope(viewer), isNull(projects.archivedAt)));

	return row?.count ?? 0;
}

/** The project behind a `/projects/PRJ-0001` URL (ADR 0010). */
export async function getProject(
	viewer: SessionUser,
	projectTag: string
): Promise<Outcome<ProjectView, 'project_not_found'>> {
	const [row] = await projectsWithOwner()
		.where(and(requireProjectScope(viewer), eq(projects.projectTag, projectTag)))
		.limit(1);

	return row ? success(row) : failure('project_not_found');
}

function zeroCounts(): Record<StateGroup, number> {
	return Object.fromEntries(STATE_GROUPS.map((group) => [group, 0])) as Record<StateGroup, number>;
}

export type ProjectProgress = {
	/** Task count per group; every group is present, zero or not. */
	counts: Record<StateGroup, number>;
	total: number;
	/** completed ÷ (total − cancelled), `0` when nothing is left to count. */
	ratio: number;
};

/**
 * Where a project stands, derived from where its tasks sit — there is no phase
 * column to keep in step. Counts what the viewer may see: an employee's progress
 * is that of the tasks assigned to them, not a window onto everybody else's.
 */
export async function projectProgress(
	viewer: SessionUser,
	projectId: string
): Promise<Outcome<ProjectProgress, 'project_not_found'>> {
	const [visible] = await getDb()
		.select({ id: projects.id })
		.from(projects)
		.where(and(requireProjectScope(viewer), eq(projects.id, projectId)));
	if (!visible) return failure('project_not_found');

	const rows = await getDb()
		.select({ group: states.group, count: sql<number>`count(*)::int` })
		.from(tasks)
		.innerJoin(states, eq(tasks.stateId, states.id))
		.where(and(requireTaskScope(viewer), eq(tasks.projectId, projectId)))
		.groupBy(states.group);

	const counts = zeroCounts();
	for (const row of rows) counts[row.group] = row.count;

	const total = STATE_GROUPS.reduce((sum, group) => sum + counts[group], 0);
	const counted = total - counts.cancelled;

	return success({ counts, total, ratio: counted === 0 ? 0 : counts.completed / counted });
}

/**
 * Task counts per group for several projects in one query, for a list that shows
 * each project's progress. A project with no visible task is present with all
 * zeros, so the caller never has to special-case a missing key.
 */
export async function projectProgressMany(
	viewer: SessionUser,
	projectIds: string[]
): Promise<Record<string, Record<StateGroup, number>>> {
	const result: Record<string, Record<StateGroup, number>> = {};
	for (const id of projectIds) result[id] = zeroCounts();
	if (projectIds.length === 0) return result;

	const rows = await getDb()
		.select({
			projectId: tasks.projectId,
			group: states.group,
			count: sql<number>`count(*)::int`
		})
		.from(tasks)
		.innerJoin(states, eq(tasks.stateId, states.id))
		.where(and(requireTaskScope(viewer), inArray(tasks.projectId, projectIds)))
		.groupBy(tasks.projectId, states.group);

	for (const row of rows) result[row.projectId][row.group] = row.count;
	return result;
}

/* -------------------------------------------------------------------------- */
/* Writes                                                                     */
/* -------------------------------------------------------------------------- */

export type CreateProjectFailure = 'owner_not_found' | 'duplicate_project_tag';
export type UpdateProjectFailure = ProjectWriteFailure | CreateProjectFailure;

/**
 * The body of `createProject`, for a caller that owns the transaction (an
 * escalation, #149). Like `openTask`, it leaves constraint violations to its
 * caller.
 */
export async function openProject(
	tx: Transaction,
	actor: SessionUser,
	values: ReturnType<typeof createProjectInput.parse>
): Promise<Outcome<{ id: string; projectTag: string }, CreateProjectFailure>> {
	requireManage(actor);

	if (values.ownerPersonId && !(await findPerson(tx, actor.organisationId, values.ownerPersonId))) {
		return failure('owner_not_found' as const);
	}

	const [project] = await tx
		.insert(projects)
		.values({
			organisationId: actor.organisationId,
			name: values.name,
			description: values.description,
			ownerPersonId: values.ownerPersonId ?? null,
			dueDate: values.dueDate ?? null,
			projectTag: values.projectTag
		})
		.returning({ id: projects.id, projectTag: projects.projectTag, name: projects.name });

	await recordActivity(tx, {
		organisationId: actor.organisationId,
		...actorColumns(actor),
		target: { projectId: project.id },
		verb: 'project.created',
		payload: { projectTag: project.projectTag, name: project.name }
	});

	return success({ id: project.id, projectTag: project.projectTag });
}

export async function createProject(
	actor: SessionUser,
	input: CreateProjectInput
): Promise<Outcome<{ id: string; projectTag: string }, CreateProjectFailure>> {
	requireManage(actor);
	const values = createProjectInput.parse(input);

	try {
		return await getDb().transaction((tx) => openProject(tx, actor, values));
	} catch (error) {
		if (uniqueConstraintName(error) === 'projects_org_tag') return failure('duplicate_project_tag');
		throw error;
	}
}

/**
 * Name, description, owner, due date and tag. Owner and due-date changes are
 * events and write their verb; the rest are corrections and do not.
 */
export async function updateProject(
	actor: SessionUser,
	projectId: string,
	input: UpdateProjectInput
): Promise<Outcome<void, UpdateProjectFailure>> {
	requireManage(actor);
	const values = updateProjectInput.parse(input);

	try {
		return await getDb().transaction(async (tx) => {
			const locked = await lockProject(tx, actor, projectId);
			if (!locked.ok) return locked;
			const project = locked.value;

			const base = {
				organisationId: actor.organisationId,
				...actorColumns(actor),
				target: { projectId }
			};

			const ownerChanges =
				values.ownerPersonId !== undefined && values.ownerPersonId !== project.ownerPersonId;
			if (ownerChanges) {
				const next = values.ownerPersonId
					? await findPerson(tx, actor.organisationId, values.ownerPersonId)
					: null;
				if (values.ownerPersonId && !next) return failure('owner_not_found' as const);

				const previous = project.ownerPersonId
					? await findPerson(tx, actor.organisationId, project.ownerPersonId)
					: null;

				await recordActivity(tx, {
					...base,
					verb: 'project.owner.changed',
					payload: {
						fromPersonId: previous?.id ?? null,
						fromPersonName: previous?.fullName ?? null,
						toPersonId: next?.id ?? null,
						toPersonName: next?.fullName ?? null
					}
				});
			}

			if (values.dueDate !== undefined && values.dueDate !== project.dueDate) {
				await recordActivity(tx, {
					...base,
					verb: 'project.due.changed',
					payload: { from: project.dueDate, to: values.dueDate }
				});
			}

			await tx
				.update(projects)
				.set({
					name: values.name,
					description: values.description,
					ownerPersonId: values.ownerPersonId,
					dueDate: values.dueDate,
					projectTag: values.projectTag,
					updatedAt: new Date()
				})
				.where(eq(projects.id, projectId));

			return success(undefined);
		});
	} catch (error) {
		if (uniqueConstraintName(error) === 'projects_org_tag') return failure('duplicate_project_tag');
		throw error;
	}
}

/** Idempotent: archiving an archived project writes nothing. */
export async function archiveProject(
	actor: SessionUser,
	projectId: string
): Promise<Outcome<void, 'project_not_found'>> {
	requireManage(actor);

	return getDb().transaction(async (tx) => {
		const locked = await lockProject(tx, actor, projectId);
		if (!locked.ok) {
			// Already archived is the state we were asked to reach.
			return locked.error === 'project_archived' ? success(undefined) : failure(locked.error);
		}

		await tx
			.update(projects)
			.set({ archivedAt: new Date(), updatedAt: new Date() })
			.where(eq(projects.id, projectId));

		await recordActivity(tx, {
			organisationId: actor.organisationId,
			...actorColumns(actor),
			target: { projectId },
			verb: 'project.archived',
			payload: {}
		});

		return success(undefined);
	});
}

/** The one write an archived project accepts. Idempotent on an active one. */
export async function unarchiveProject(
	actor: SessionUser,
	projectId: string
): Promise<Outcome<void, 'project_not_found'>> {
	requireManage(actor);

	return getDb().transaction(async (tx) => {
		const [project] = await tx
			.select({ archivedAt: projects.archivedAt })
			.from(projects)
			.where(and(eq(projects.id, projectId), eq(projects.organisationId, actor.organisationId)))
			.for('update');
		if (!project) return failure('project_not_found' as const);
		if (!project.archivedAt) return success(undefined);

		await tx
			.update(projects)
			.set({ archivedAt: null, updatedAt: new Date() })
			.where(eq(projects.id, projectId));

		await recordActivity(tx, {
			organisationId: actor.organisationId,
			...actorColumns(actor),
			target: { projectId },
			verb: 'project.unarchived',
			payload: {}
		});

		return success(undefined);
	});
}
