import { asc, eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { activity } from '../activity/schema';
import {
	createOrganisation,
	createPerson,
	createViewer,
	createViewerWithoutPerson
} from '../assets/testing/fixtures';
import { getDb } from '../db';
import { people } from '../directory/schema';
import { parseSearchTerm } from '../shared/search-hits';
import { notify } from '../notifications';
import { notifications } from '../notifications/schema';
import { InMemoryStorage } from '../shared/storage';
import {
	addProjectAttachments,
	addProjectMember,
	archiveProject,
	assign,
	createProject,
	createTask,
	getProject,
	getTask,
	listProjectMembers,
	listProjects,
	listTasks,
	moveTask,
	projectProgress,
	removeProjectMember,
	setAssignees,
	setProjectVisibility,
	taskHits,
	projectHits,
	unarchiveProject,
	unassign,
	updateProject,
	updateTask
} from './index';
import { projectMembers } from './schema';
import {
	assignRow,
	createProjectRow,
	createTaskRow,
	createWorkspace,
	statesByGroup
} from './testing/fixtures';

/**
 * Members-only projects (ADR 0042). Fixtures insert rows directly so the scope
 * is tested against the schema and not against the domain functions under test.
 */

async function scenario() {
	const workspace = await createWorkspace();
	const { organisation, admin, technician } = workspace;
	const states = await statesByGroup(organisation.id);
	const member = await createViewer(organisation.id, 'technician', 'Mia Member');
	const owner = await createViewer(organisation.id, 'technician', 'Olga Owner');

	const closed = await createProjectRow(organisation.id, {
		name: 'Secret merger',
		visibility: 'members',
		ownerPersonId: owner.personId
	});
	await getDb()
		.insert(projectMembers)
		.values([
			{ projectId: closed.id, personId: owner.personId!, organisationId: organisation.id },
			{ projectId: closed.id, personId: member.personId!, organisationId: organisation.id }
		]);
	const task = await createTaskRow(organisation.id, closed.id, states.started.id, {
		title: 'Draft the term sheet'
	});
	await assignRow(organisation.id, task.id, member.personId!);

	const open = await createProjectRow(organisation.id, { name: 'Open house' });
	const openTask = await createTaskRow(organisation.id, open.id, states.started.id, {
		title: 'Open task'
	});

	return { ...workspace, states, member, owner, closed, task, open, openTask, admin, technician };
}

function term(input: string) {
	const parsed = parseSearchTerm(input);
	if (!parsed) throw new Error(`setup: ${input} is not searchable`);
	return parsed;
}

async function hitIds(query: PromiseLike<{ id: string }[]> | null) {
	return query ? (await query).map((hit) => hit.id) : [];
}

async function historyOf(projectId: string) {
	const rows = await getDb()
		.select()
		.from(activity)
		.where(eq(activity.projectId, projectId))
		.orderBy(asc(activity.occurredAt), asc(activity.createdAt));
	return rows.map((row) => ({ verb: row.verb, payload: row.payload }));
}

async function memberIds(projectId: string) {
	const rows = await getDb()
		.select({ personId: projectMembers.personId })
		.from(projectMembers)
		.where(eq(projectMembers.projectId, projectId));
	return rows.map((row) => row.personId).sort();
}

describe('the members-only scope', () => {
	it('hides the project and its tasks from a technician who is not a member', async () => {
		const { technician, closed, task, open } = await scenario();

		expect((await listProjects(technician)).map((p) => p.id)).toEqual([open.id]);
		expect(await getProject(technician, closed.projectTag)).toEqual({
			ok: false,
			error: 'project_not_found'
		});
		expect(await getTask(technician, task.taskTag)).toEqual({ ok: false, error: 'task_not_found' });
		expect((await listTasks(technician)).map((t) => t.projectId)).toEqual([open.id]);
		expect(await projectProgress(technician, closed.id)).toEqual({
			ok: false,
			error: 'project_not_found'
		});
	});

	it('finds nothing by code or title in search for a non-member', async () => {
		const { technician, member, closed, task } = await scenario();

		expect(await hitIds(projectHits(technician, term('Secret')))).toEqual([]);
		expect(await hitIds(projectHits(technician, term(closed.projectTag)))).toEqual([]);
		expect(await hitIds(taskHits(technician, term(task.taskTag)))).toEqual([]);
		expect(await hitIds(taskHits(technician, term('term sheet')))).toEqual([]);
		expect(await hitIds(projectHits(member, term('Secret')))).toEqual([closed.id]);
	});

	it('shows a member the project and its tasks, and an admin who is not a member too', async () => {
		const { member, admin, closed, task } = await scenario();

		for (const viewer of [member, admin]) {
			const found = await getProject(viewer, closed.projectTag);
			expect(found.ok && found.value.visibility).toBe('members');
			expect((await getTask(viewer, task.taskTag)).ok).toBe(true);
		}
	});

	it('applies to an employee on a task of the project unless they are a member', async () => {
		const { employee, organisation, closed, task } = await scenario();
		await assignRow(organisation.id, task.id, employee.personId!);

		expect((await getTask(employee, task.taskTag)).ok).toBe(false);
		expect((await listProjects(employee)).length).toBe(0);

		await getDb().insert(projectMembers).values({
			projectId: closed.id,
			personId: employee.personId!,
			organisationId: organisation.id
		});
		expect((await getTask(employee, task.taskTag)).ok).toBe(true);
	});

	it('shows nothing members-only to a viewer without a directory record', async () => {
		const { organisation, open } = await scenario();
		const key = await createViewerWithoutPerson(organisation.id, 'technician');

		expect((await listProjects(key)).map((p) => p.id)).toEqual([open.id]);
	});

	it('shows an admin key with no person every members-only project, and a technician key none', async () => {
		const { organisation, closed, open } = await scenario();
		const adminKey = await createViewerWithoutPerson(organisation.id, 'admin');

		expect((await listProjects(adminKey)).map((p) => p.id).sort()).toEqual(
			[closed.id, open.id].sort()
		);
	});

	it('leaves existing, open projects exactly as they were', async () => {
		const { technician, open, openTask } = await scenario();

		expect((await getProject(technician, open.projectTag)).ok).toBe(true);
		expect((await getTask(technician, openTask.taskTag)).ok).toBe(true);
	});
});

describe('writes follow reads', () => {
	it('fails as not found for every write family on a project the actor cannot see', async () => {
		const { technician, closed, task, states, organisation, member } = await scenario();
		const notFoundProject = { ok: false, error: 'project_not_found' };
		const notFoundTask = { ok: false, error: 'task_not_found' };
		const file = { filename: 'plan.txt', contentType: 'text/plain', data: new Uint8Array(4) };

		expect(await updateProject(technician, closed.id, { name: 'Mine now' })).toEqual(
			notFoundProject
		);
		expect(await archiveProject(technician, closed.id)).toEqual(notFoundProject);
		expect(await unarchiveProject(technician, closed.id)).toEqual(notFoundProject);
		expect(await createTask(technician, closed.id, { title: 'Sneaky' })).toEqual(notFoundProject);
		expect(await updateTask(technician, task.id, { title: 'Sneaky' })).toEqual(notFoundTask);
		expect(await moveTask(technician, task.id, states.completed.id)).toEqual(notFoundTask);
		expect(await assign(technician, task.id, technician.personId!)).toEqual(notFoundTask);
		expect(await unassign(technician, task.id, member.personId!)).toEqual(notFoundTask);
		expect(await setAssignees(technician, task.id, [])).toEqual(notFoundTask);
		expect(await setProjectVisibility(technician, closed.id, 'organisation')).toEqual(
			notFoundProject
		);
		expect(await addProjectMember(technician, closed.id, technician.personId!)).toEqual(
			notFoundProject
		);
		expect(await removeProjectMember(technician, closed.id, member.personId!)).toEqual(
			notFoundProject
		);
		expect(
			await addProjectAttachments(technician, closed.id, [file], { storage: new InMemoryStorage() })
		).toEqual(notFoundProject);

		const admin = await createViewer(organisation.id, 'admin', 'Zed');
		const after = await getProject(admin, closed.projectTag);
		expect(after.ok && after.value.name).toBe('Secret merger');
	});

	it('lets a member technician and an admin who is not a member edit it', async () => {
		const { member, admin, closed, task } = await scenario();

		expect((await updateProject(member, closed.id, { name: 'By member' })).ok).toBe(true);
		expect((await updateTask(admin, task.id, { title: 'By admin' })).ok).toBe(true);
	});
});

describe('setProjectVisibility', () => {
	it('seeds the owner, the actor and the assignees, then records the change', async () => {
		const { admin, technician, organisation, states } = await scenario();
		const owner = await createPerson(organisation.id, 'Pat Owner');
		const assignee = await createPerson(organisation.id, 'Ann Assignee');
		const project = await createProjectRow(organisation.id, {
			name: 'Going private',
			ownerPersonId: owner.id
		});
		const t1 = await createTaskRow(organisation.id, project.id, states.started.id);
		const t2 = await createTaskRow(organisation.id, project.id, states.started.id, {
			position: '2000'
		});
		await assignRow(organisation.id, t1.id, assignee.id);
		await assignRow(organisation.id, t2.id, assignee.id);

		expect(await setProjectVisibility(admin, project.id, 'members')).toEqual({
			ok: true,
			value: undefined
		});

		expect(await memberIds(project.id)).toEqual([owner.id, assignee.id, admin.personId!].sort());
		const history = await historyOf(project.id);
		expect(history.map((entry) => entry.verb)).toEqual([
			'project.member.added',
			'project.member.added',
			'project.member.added',
			'project.visibility.changed'
		]);
		expect(history.at(-1)?.payload).toEqual({ from: 'organisation', to: 'members' });
		expect((await getProject(technician, project.projectTag)).ok).toBe(false);
	});

	it('is a no-op when unchanged, and keeps the rows when going back', async () => {
		const { admin, closed, member } = await scenario();
		const before = await historyOf(closed.id);

		expect((await setProjectVisibility(admin, closed.id, 'members')).ok).toBe(true);
		expect(await historyOf(closed.id)).toEqual(before);

		expect((await setProjectVisibility(admin, closed.id, 'organisation')).ok).toBe(true);
		expect(await memberIds(closed.id)).toContain(member.personId);
		expect((await historyOf(closed.id)).at(-1)).toEqual({
			verb: 'project.visibility.changed',
			payload: { from: 'members', to: 'organisation' }
		});
	});

	it('is for the owner and admins only', async () => {
		const { member, owner, closed } = await scenario();

		expect(await setProjectVisibility(member, closed.id, 'organisation')).toEqual({
			ok: false,
			error: 'forbidden'
		});
		expect(await addProjectMember(member, closed.id, member.personId!)).toEqual({
			ok: false,
			error: 'forbidden'
		});
		expect(await removeProjectMember(member, closed.id, owner.personId!)).toEqual({
			ok: false,
			error: 'forbidden'
		});
		expect((await setProjectVisibility(owner, closed.id, 'organisation')).ok).toBe(true);
	});
});

describe('members', () => {
	it('adds an active person once, and rejects strangers and the deactivated', async () => {
		const { admin, closed, organisation } = await scenario();
		const person = await createPerson(organisation.id, 'New Member');
		const stranger = await createPerson(
			(await createOrganisation('Other', 'other')).id,
			'Outsider'
		);

		expect((await addProjectMember(admin, closed.id, person.id)).ok).toBe(true);
		expect((await addProjectMember(admin, closed.id, person.id)).ok).toBe(true);
		expect(
			(await historyOf(closed.id)).filter((entry) => entry.verb === 'project.member.added')
		).toEqual([
			{ verb: 'project.member.added', payload: { personId: person.id, personName: 'New Member' } }
		]);
		expect(await addProjectMember(admin, closed.id, stranger.id)).toEqual({
			ok: false,
			error: 'person_not_found'
		});

		const gone = await createPerson(organisation.id, 'Gone');
		await getDb().update(people).set({ active: false }).where(eq(people.id, gone.id));
		expect(await addProjectMember(admin, closed.id, gone.id)).toEqual({
			ok: false,
			error: 'person_not_found'
		});
	});

	it('refuses to assign a non-member, and accepts a member', async () => {
		const { admin, technician, member, task, closed, organisation } = await scenario();
		const other = await createPerson(organisation.id, 'Not Member');

		expect(await assign(admin, task.id, other.id)).toEqual({ ok: false, error: 'not_a_member' });
		expect(await setAssignees(admin, task.id, [member.personId!, other.id])).toEqual({
			ok: false,
			error: 'not_a_member'
		});
		expect((await assign(admin, task.id, member.personId!)).ok).toBe(true);

		await addProjectMember(admin, closed.id, other.id);
		expect((await assign(admin, task.id, other.id)).ok).toBe(true);
		expect(technician.personId).not.toBeNull();
	});

	it('requires confirmation to remove a member with tasks, then unassigns them', async () => {
		const { admin, member, closed, task } = await scenario();

		expect(await removeProjectMember(admin, closed.id, member.personId!)).toEqual({
			ok: false,
			error: { kind: 'has_assignments', count: 1 }
		});
		expect(await memberIds(closed.id)).toContain(member.personId);

		expect(
			await removeProjectMember(admin, closed.id, member.personId!, { confirm: true })
		).toEqual({ ok: true, value: undefined });
		expect(await memberIds(closed.id)).not.toContain(member.personId);

		const unassigned = await getDb().select().from(activity).where(eq(activity.taskId, task.id));
		expect(unassigned.map((row) => row.verb)).toContain('task.unassigned');
		expect((await historyOf(closed.id)).at(-1)).toEqual({
			verb: 'project.member.removed',
			payload: { personId: member.personId, personName: 'Mia Member', unassignedTaskCount: 1 }
		});
	});

	it('removes a member without tasks straight away, and never the owner', async () => {
		const { admin, owner, closed, organisation } = await scenario();
		const idle = await createPerson(organisation.id, 'Idle');
		await addProjectMember(admin, closed.id, idle.id);

		expect((await removeProjectMember(admin, closed.id, idle.id)).ok).toBe(true);
		expect(await removeProjectMember(admin, closed.id, owner.personId!)).toEqual({
			ok: false,
			error: 'is_owner'
		});
	});

	it('lists the owner first, flagged', async () => {
		const { admin, closed, owner } = await scenario();

		const listed = await listProjectMembers(admin, closed.id);
		expect(listed.ok && listed.value.map((m) => [m.fullName, m.isOwner])).toEqual([
			['Olga Owner', true],
			['Mia Member', false]
		]);
		expect(owner.personId).not.toBeNull();
	});
});

describe('creation and ownership', () => {
	it('makes the owner and the creator members of a project created as members-only', async () => {
		const { admin, organisation } = await scenario();
		const owner = await createPerson(organisation.id, 'Chosen Owner');

		const created = await createProject(admin, {
			name: 'Private from day one',
			ownerPersonId: owner.id,
			visibility: 'members'
		});
		if (!created.ok) throw new Error(created.error);

		expect(await memberIds(created.value.id)).toEqual([owner.id, admin.personId!].sort());
		expect((await historyOf(created.value.id)).map((entry) => entry.verb)).toEqual([
			'project.created',
			'project.member.added',
			'project.member.added'
		]);
	});

	it('defaults to the whole organisation', async () => {
		const { admin } = await scenario();

		const created = await createProject(admin, { name: 'Plain' });
		if (!created.ok) throw new Error(created.error);
		const found = await getProject(admin, created.value.projectTag);

		expect(found.ok && found.value.visibility).toBe('organisation');
	});

	it('adds a new owner of a members-only project to its members', async () => {
		const { admin, closed, organisation } = await scenario();
		const successor = await createPerson(organisation.id, 'Successor');

		expect((await updateProject(admin, closed.id, { ownerPersonId: successor.id })).ok).toBe(true);

		expect(await memberIds(closed.id)).toContain(successor.id);
		expect(
			(await historyOf(closed.id)).filter((entry) => entry.verb === 'project.member.added')
		).toEqual([
			{
				verb: 'project.member.added',
				payload: { personId: successor.id, personName: 'Successor' }
			}
		]);
	});
});

describe('notifications about a members-only project', () => {
	it('reach only the members and admins named in the audience', async () => {
		const { organisation, admin, member, technician, task } = await scenario();

		await getDb().transaction((tx) =>
			notify(tx, {
				organisationId: organisation.id,
				actorPersonId: null,
				target: { taskId: task.id },
				snapshot: { code: task.taskTag, title: task.title, actorName: 'System' },
				recipients: [member, technician, admin].map((viewer) => ({
					personId: viewer.personId!,
					type: 'task.assigned' as const
				})),
				audience: new Set([member.personId!])
			})
		);

		const rows = await getDb().select().from(notifications);
		expect(rows.map((row) => row.recipientPersonId).sort()).toEqual(
			[member.personId!, admin.personId!].sort()
		);
	});
});
