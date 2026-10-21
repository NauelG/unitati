import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import { actorColumns, recordActivity } from '../activity';
import type { SessionUser } from '../auth/guards';
import { getDb, type Transaction } from '../db';
import { people } from '../directory/schema';
import { failure, success, type Outcome } from '../shared/outcome';
import { projectMembers, projects, taskAssignees, tasks } from './schema';
import { requireManage, requireProjectScope, seesAllProjects } from './scope';
import { removeAssignee } from './tasks';
import { findPerson, lockProject, type ProjectWriteFailure } from './writes';

/**
 * Who a members-only project is visible to (ADR 0041).
 *
 * **Membership is not a role.** A member sees and edits the project exactly as
 * their role already allows; the list only decides *whether the project exists
 * for them at all*. Managing the list is for the project's owner and admins.
 *
 * **Assignment never widens access.** Putting a non-member on a task is refused
 * (`not_a_member`); the way in is `addProjectMember`, so access is always a
 * deliberate act of the people allowed to give it.
 *
 * Rows survive a switch back to `organisation`, so a project that goes private
 * again gets its old list back.
 */

export type ProjectVisibility = 'organisation' | 'members';

export type MembershipFailure = ProjectWriteFailure | 'forbidden';
export type AddMemberFailure = MembershipFailure | 'person_not_found';
export type RemoveMemberFailure =
	MembershipFailure | 'person_not_found' | 'is_owner' | { kind: 'has_assignments'; count: number };

export type ProjectMemberView = {
	personId: string;
	fullName: string;
	/** The project's owner: always a member of a members-only project. */
	isOwner: boolean;
	/** Tasks of this project they are on: what removing them would unassign. */
	taskCount: number;
};

/** The owner and the admins manage membership; nobody else, whatever their role. */
export function canManageMembers(
	viewer: SessionUser,
	project: { ownerPersonId: string | null }
): boolean {
	if (seesAllProjects(viewer)) return true;
	return viewer.personId !== null && viewer.personId === project.ownerPersonId;
}

/**
 * Inserts the membership and writes `project.member.added`, unless the person
 * is already a member (then nothing happens and `false` comes back). Shared with
 * `createProject` and the owner change, which add members as a side effect.
 */
export async function insertMember(
	tx: Transaction,
	actor: SessionUser,
	projectId: string,
	person: { id: string; fullName: string }
): Promise<boolean> {
	const inserted = await tx
		.insert(projectMembers)
		.values({ projectId, personId: person.id, organisationId: actor.organisationId })
		.onConflictDoNothing()
		.returning({ personId: projectMembers.personId });
	if (inserted.length === 0) return false;

	await recordActivity(tx, {
		organisationId: actor.organisationId,
		...actorColumns(actor),
		target: { projectId },
		verb: 'project.member.added',
		payload: { personId: person.id, personName: person.fullName }
	});
	return true;
}

/** Everybody listed on the project, the owner first, then by name. */
export async function listProjectMembers(
	viewer: SessionUser,
	projectId: string
): Promise<Outcome<ProjectMemberView[], 'project_not_found'>> {
	const [project] = await getDb()
		.select({ ownerPersonId: projects.ownerPersonId })
		.from(projects)
		.where(and(requireProjectScope(viewer), eq(projects.id, projectId)));
	if (!project) return failure('project_not_found');

	const rows = await getDb()
		.select({
			personId: people.id,
			fullName: people.fullName,
			taskCount: sql<number>`(
				select count(*)::int from ${taskAssignees}
				inner join ${tasks} on ${tasks.id} = ${taskAssignees.taskId}
				where ${tasks.projectId} = ${projectId} and ${taskAssignees.personId} = ${people.id}
			)`
		})
		.from(projectMembers)
		.innerJoin(people, eq(projectMembers.personId, people.id))
		.where(eq(projectMembers.projectId, projectId))
		.orderBy(asc(people.fullName), asc(people.id));

	const members = rows.map((row) => ({ ...row, isOwner: row.personId === project.ownerPersonId }));
	return success([...members.filter((m) => m.isOwner), ...members.filter((m) => !m.isOwner)]);
}

/**
 * The project, locked, for a membership change: not found when the actor cannot
 * see it, `forbidden` when they can but are neither the owner nor an admin. The
 * order matters — `forbidden` is only ever said to somebody who already knows
 * the project is there.
 */
async function lockForMembership(tx: Transaction, actor: SessionUser, projectId: string) {
	const locked = await lockProject(tx, actor, projectId);
	if (!locked.ok) return locked;
	if (!canManageMembers(actor, locked.value)) return failure('forbidden' as const);
	return locked;
}

/**
 * No-op when unchanged. Going to `members` seeds the list with the owner, the
 * actor and everybody currently assigned to a task of the project — so closing a
 * project never locks out the people already doing its work. Going back keeps
 * the rows.
 */
export async function setProjectVisibility(
	actor: SessionUser,
	projectId: string,
	visibility: ProjectVisibility
): Promise<Outcome<void, MembershipFailure>> {
	requireManage(actor);

	return getDb().transaction(async (tx) => {
		const locked = await lockForMembership(tx, actor, projectId);
		if (!locked.ok) return locked;
		const project = locked.value;

		if (project.visibility === visibility) return success(undefined);

		if (visibility === 'members') {
			const assignees = await tx
				.selectDistinct({ personId: taskAssignees.personId })
				.from(taskAssignees)
				.innerJoin(tasks, eq(taskAssignees.taskId, tasks.id))
				.where(eq(tasks.projectId, projectId));

			const wanted = new Set<string>(assignees.map((row) => row.personId));
			if (project.ownerPersonId) wanted.add(project.ownerPersonId);
			if (actor.personId) wanted.add(actor.personId);

			const named = wanted.size
				? await tx
						.select({ id: people.id, fullName: people.fullName })
						.from(people)
						.where(
							and(inArray(people.id, [...wanted]), eq(people.organisationId, actor.organisationId))
						)
						.orderBy(asc(people.fullName), asc(people.id))
				: [];
			for (const person of named) await insertMember(tx, actor, projectId, person);
		}

		await tx
			.update(projects)
			.set({ visibility, updatedAt: new Date() })
			.where(eq(projects.id, projectId));

		await recordActivity(tx, {
			organisationId: actor.organisationId,
			...actorColumns(actor),
			target: { projectId },
			verb: 'project.visibility.changed',
			payload: { from: project.visibility, to: visibility }
		});

		return success(undefined);
	});
}

/** Idempotent. Only an active person of the organisation can be added. */
export async function addProjectMember(
	actor: SessionUser,
	projectId: string,
	personId: string
): Promise<Outcome<void, AddMemberFailure>> {
	requireManage(actor);

	return getDb().transaction(async (tx) => {
		const locked = await lockForMembership(tx, actor, projectId);
		if (!locked.ok) return locked;

		const person = await findActivePerson(tx, actor.organisationId, personId);
		if (!person) return failure('person_not_found' as const);

		await insertMember(tx, actor, projectId, person);
		return success(undefined);
	});
}

async function findActivePerson(tx: Transaction, organisationId: string, personId: string) {
	const person = await findPerson(tx, organisationId, personId);
	if (!person) return null;

	const [row] = await tx
		.select({ active: people.active })
		.from(people)
		.where(eq(people.id, personId));
	return row?.active ? person : null;
}

/**
 * Takes the person off the list. When they still have tasks in the project the
 * caller must confirm, because removal unassigns them from all of them
 * (`task.unassigned` each): without `confirm` the answer is
 * `{ kind: 'has_assignments', count }` and nothing changes. The owner cannot be
 * removed; change the owner first. Removing somebody who is not a member is a
 * no-op.
 */
export async function removeProjectMember(
	actor: SessionUser,
	projectId: string,
	personId: string,
	options: { confirm?: boolean } = {}
): Promise<Outcome<void, RemoveMemberFailure>> {
	requireManage(actor);

	return getDb().transaction(async (tx) => {
		const locked = await lockForMembership(tx, actor, projectId);
		if (!locked.ok) return locked;
		const project = locked.value;

		if (project.ownerPersonId === personId) return failure('is_owner' as const);

		const person = await findPerson(tx, actor.organisationId, personId);
		if (!person) return failure('person_not_found' as const);

		const [membership] = await tx
			.select({ personId: projectMembers.personId })
			.from(projectMembers)
			.where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.personId, personId)));
		if (!membership) return success(undefined);

		const assigned = await tx
			.select({ taskId: taskAssignees.taskId })
			.from(taskAssignees)
			.innerJoin(tasks, eq(taskAssignees.taskId, tasks.id))
			.where(and(eq(tasks.projectId, projectId), eq(taskAssignees.personId, personId)))
			.orderBy(asc(taskAssignees.taskId));

		if (assigned.length > 0 && !options.confirm) {
			return failure({ kind: 'has_assignments' as const, count: assigned.length });
		}

		for (const { taskId } of assigned) await removeAssignee(tx, actor, taskId, person);

		await tx
			.delete(projectMembers)
			.where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.personId, personId)));

		await recordActivity(tx, {
			organisationId: actor.organisationId,
			...actorColumns(actor),
			target: { projectId },
			verb: 'project.member.removed',
			payload: {
				personId: person.id,
				personName: person.fullName,
				unassignedTaskCount: assigned.length
			}
		});

		return success(undefined);
	});
}
