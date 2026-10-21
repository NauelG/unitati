import { and, eq, exists, or, sql, type SQL } from 'drizzle-orm';
import { can } from '../access/permissions';
import type { SessionUser } from '../auth/guards';
import { getDb } from '../db';
import { alias, type AnyPgColumn } from 'drizzle-orm/pg-core';
import { projectMembers, projects, taskAssignees, tasks } from './schema';

/**
 * Which tasks and projects a viewer may see, as SQL. A leaf module, like
 * `service-desk/scope.ts` and `assets/scope.ts`: every read in the domain starts
 * from these, including the ones in sibling files, and a predicate living in the
 * barrel would turn that into an import cycle.
 *
 * `projects.view` sees the organisation. `projects.view.assigned` sees the tasks
 * somebody put them on, and the projects that contain at least one such task —
 * the `tickets.view.own` shape (ADR 0007); per-project membership is #58.
 *
 * **Members-only projects (ADR 0041)** narrow every one of these further: a
 * project whose `visibility` is `members` is visible to its members and to
 * admins, and so are its tasks, whatever the viewer's role would otherwise show.
 * The condition is part of the same predicate, so every call site picks it up and
 * a record the viewer cannot see is simply absent — `not_found`, never a 403.
 *
 * Returns `null` only when the viewer holds **no** project-read permission at
 * all, which the callers turn into a thrown error: an empty list is
 * indistinguishable from a correctly-scoped empty board, and would hide a route
 * that forgot its guard.
 */

/**
 * The scope of a viewer who may read, but has nothing to read: a clause that
 * matches no row. Not the same thing as "no scope" — that one throws.
 */
const NOTHING = sql`false`;

/**
 * The null check is the point, not a formality (see `assets/scope.ts`). A viewer
 * whose credential has no directory record has `personId === null`, and "the
 * tasks assigned to me" written against it would be `person_id = null`, or worse
 * a `is null` that matches every unassigned task. The clause is dropped, and what
 * is left is a scope that matches nothing.
 */
function assignedPersonId(viewer: SessionUser): string | null {
	return can(viewer, 'projects.view.assigned') ? viewer.personId : null;
}

/** Admins see every project, members-only ones included. */
export function seesAllProjects(viewer: SessionUser): boolean {
	return viewer.role === 'admin';
}

/**
 * The membership half of the scope, written against the `projects` row it is
 * given: an open project, or one the viewer is a member of. Absent for an admin.
 * A viewer with no directory record (`personId === null`, an API key) matches no
 * members-only project — the same null discipline as `assignedPersonId`.
 */
function membershipOf(
	viewer: SessionUser,
	project: { id: AnyPgColumn; visibility: AnyPgColumn }
): SQL | undefined {
	if (seesAllProjects(viewer)) return undefined;

	const open = eq(project.visibility, 'organisation');
	if (viewer.personId === null) return open;

	return or(
		open,
		exists(
			getDb()
				.select({ one: sql`1` })
				.from(projectMembers)
				.where(
					and(
						eq(projectMembers.projectId, project.id),
						eq(projectMembers.personId, viewer.personId)
					)
				)
		)
	);
}

/**
 * The projects table reached from a task, for the membership condition. Aliased
 * so the subquery cannot be confused with the `projects` a task listing joins.
 */
function taskProjectMembership(viewer: SessionUser): SQL | undefined {
	if (seesAllProjects(viewer)) return undefined;

	const owning = alias(projects, 'scope_projects');
	return exists(
		getDb()
			.select({ one: sql`1` })
			.from(owning)
			.where(and(eq(owning.id, tasks.projectId), membershipOf(viewer, owning)))
	);
}

/**
 * The condition a **write** adds on top of locking a project by id: the actor
 * can see it. Writes follow reads (ADR 0041), so a project the actor cannot see
 * fails like one that does not exist. Reads and writes share `membershipOf`, so
 * the two cannot drift apart.
 */
export function writableProject(actor: SessionUser): SQL | undefined {
	return membershipOf(actor, projects);
}

function visibleTasks(viewer: SessionUser): SQL | null {
	const organisation = and(
		eq(tasks.organisationId, viewer.organisationId),
		taskProjectMembership(viewer)
	) as SQL;

	if (can(viewer, 'projects.view')) return organisation;
	if (!can(viewer, 'projects.view.assigned')) return null;

	const personId = assignedPersonId(viewer);
	if (personId === null) return and(organisation, NOTHING) as SQL;

	return and(
		organisation,
		exists(
			getDb()
				.select({ one: sql`1` })
				.from(taskAssignees)
				.where(and(eq(taskAssignees.taskId, tasks.id), eq(taskAssignees.personId, personId)))
		)
	) as SQL;
}

function visibleProjects(viewer: SessionUser): SQL | null {
	const organisation = and(
		eq(projects.organisationId, viewer.organisationId),
		membershipOf(viewer, projects)
	) as SQL;

	if (can(viewer, 'projects.view')) return organisation;
	if (!can(viewer, 'projects.view.assigned')) return null;

	const personId = assignedPersonId(viewer);
	if (personId === null) return and(organisation, NOTHING) as SQL;

	return and(
		organisation,
		exists(
			getDb()
				.select({ one: sql`1` })
				.from(tasks)
				.innerJoin(taskAssignees, eq(taskAssignees.taskId, tasks.id))
				.where(and(eq(tasks.projectId, projects.id), eq(taskAssignees.personId, personId)))
		)
	) as SQL;
}

export function requireTaskScope(viewer: SessionUser): SQL {
	const scope = visibleTasks(viewer);
	if (scope) return scope;

	// An invariant violation, not a business failure: a route that reaches a
	// listing without `requirePermission` is a bug, and must not look like an
	// empty board.
	throw new Error(
		`The ${viewer.role} role holds no project-read permission; the route should have called requirePermission first.`
	);
}

export function requireProjectScope(viewer: SessionUser): SQL {
	const scope = visibleProjects(viewer);
	if (scope) return scope;

	throw new Error(
		`The ${viewer.role} role holds no project-read permission; the route should have called requirePermission first.`
	);
}

/**
 * Every write in the domain requires `projects.manage`. The route gates the
 * screen (ADR 0007) and this is the backstop, so a function called from the
 * wrong place fails loudly instead of writing: a programming error, not an
 * expected outcome, which is why it throws instead of returning a failure.
 */
export function requireManage(actor: SessionUser): void {
	if (!can(actor, 'projects.manage')) {
		throw new Error(
			`The ${actor.role} role cannot manage projects; the route should have called requirePermission first.`
		);
	}
}
