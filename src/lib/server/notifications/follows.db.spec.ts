import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { mentionToken } from '#lib/domain/mentions.js';
import { createViewer } from '../assets/testing/fixtures';
import { users } from '../auth/schema';
import { getDb } from '../db';
import { archiveProject, moveTask, setAssignees, updateTask } from '../projects';
import { projectMembers } from '../projects/schema';
import {
	createProjectRow,
	createTaskRow,
	createWorkspace,
	statesByGroup
} from '../projects/testing/fixtures';
import { addComment, assignTicket, changeTicketStatus } from '../service-desk';
import { createQueue, createTicket } from '../service-desk/testing/fixtures';
import { follow, followState, isFollowing, unfollow, unfollowFromNotification } from './index';
import { follows, notifications } from './schema';

const deps = { mailer: null };

async function scenario() {
	const { organisation, admin, technician, employee } = await createWorkspace();
	const colleague = await createViewer(organisation.id, 'technician', 'Theo Tech');
	const queue = await createQueue(organisation.id);
	const ticket = await createTicket(organisation.id, queue.id, employee.personId!);
	const project = await createProjectRow(organisation.id);
	const states = await statesByGroup(organisation.id);
	const task = await createTaskRow(organisation.id, project.id, states.unstarted.id);
	return { organisation, admin, technician, colleague, employee, ticket, project, task, states };
}

const inbox = () => getDb().select().from(notifications);
const forRecipient = async (personId: string | null) =>
	(await inbox()).filter((row) => row.recipientPersonId === personId);
const comment = (
	actor: Parameters<typeof addComment>[0],
	tag: string,
	body: string,
	visibility: 'public' | 'internal' = 'public'
) => addComment(actor, tag, { body, visibility }, [], { mailer: null });

describe('following', () => {
	it('lets staff follow a ticket, a task and a project, and is idempotent', async () => {
		const { technician, ticket, task, project } = await scenario();

		for (const target of [
			{ ticketId: ticket.id },
			{ taskId: task.id },
			{ projectId: project.id }
		]) {
			expect(await follow(technician, target)).toEqual({ ok: true, value: undefined });
			await follow(technician, target);
			expect(await isFollowing(technician, target)).toBe(true);
		}
		expect(await getDb().select().from(follows)).toHaveLength(3);
	});

	it('never lets an employee follow: forbidden, and nothing is stored', async () => {
		const { employee, ticket } = await scenario();
		const other = await createViewer(employee.organisationId, 'employee', 'Olga Other');

		expect(await follow(other, { ticketId: ticket.id })).toEqual({ ok: false, error: 'forbidden' });
		expect(await getDb().select().from(follows)).toHaveLength(0);
	});

	it('does not store a participant as a follower and refuses to unfollow them', async () => {
		const { admin, technician, ticket } = await scenario();
		await assignTicket(admin, ticket.ticketTag, technician.personId, deps);

		await follow(technician, { ticketId: ticket.id });

		expect(await getDb().select().from(follows)).toHaveLength(0);
		expect(await unfollow(technician, { ticketId: ticket.id })).toEqual({
			ok: false,
			error: 'participant'
		});
		const state = await followState(technician, { ticketId: ticket.id });
		expect(state).toMatchObject({ canFollow: true, participant: true });
	});

	it('reports the count and no button for an employee', async () => {
		const { technician, colleague, employee, ticket } = await scenario();
		await follow(technician, { ticketId: ticket.id });
		await follow(colleague, { ticketId: ticket.id });

		expect(await followState(technician, { ticketId: ticket.id })).toEqual({
			canFollow: true,
			participant: false,
			following: true,
			followerCount: 2
		});
		expect(await followState(employee, { ticketId: ticket.id })).toEqual({ canFollow: false });
	});
});

describe('what a ticket follower receives', () => {
	it('is told of a public and of an internal comment by somebody else', async () => {
		const { technician, colleague, ticket } = await scenario();
		await follow(technician, { ticketId: ticket.id });

		await comment(colleague, ticket.ticketTag, 'Mirando');
		await comment(colleague, ticket.ticketTag, 'Nota', 'internal');

		const mine = await forRecipient(technician.personId);
		expect(mine.map((row) => row.type)).toEqual(['followed.activity', 'followed.activity']);
		expect(mine[0].snapshot).toMatchObject({ code: ticket.ticketTag, excerpt: 'Mirando' });
	});

	it('is told of a status change that tells nobody else', async () => {
		const { admin, technician, ticket } = await scenario();
		await follow(technician, { ticketId: ticket.id });

		await changeTicketStatus(admin, ticket.ticketTag, 'in_progress', deps);

		const rows = await inbox();
		expect(rows).toHaveLength(1);
		expect(rows[0]).toMatchObject({
			recipientPersonId: technician.personId,
			type: 'followed.activity'
		});
		expect(rows[0].snapshot.summary).toContain('En curso');
	});

	it('is told of an assignment, and of an unassignment that tells the assignee nothing', async () => {
		const { admin, technician, colleague, ticket } = await scenario();
		await follow(technician, { ticketId: ticket.id });

		await assignTicket(admin, ticket.ticketTag, colleague.personId, deps);
		await assignTicket(admin, ticket.ticketTag, null, deps);

		expect((await forRecipient(technician.personId)).map((row) => row.type)).toEqual([
			'followed.activity',
			'followed.activity'
		]);
		expect((await forRecipient(colleague.personId)).map((row) => row.type)).toEqual([
			'ticket.assigned'
		]);
	});

	it('gets one mention, not two notifications, when also named in the comment', async () => {
		const { technician, colleague, ticket } = await scenario();
		await follow(technician, { ticketId: ticket.id });

		await comment(
			colleague,
			ticket.ticketTag,
			`Para ti ${mentionToken(technician.name, technician.personId!)}`
		);

		expect((await forRecipient(technician.personId)).map((row) => row.type)).toEqual(['mention']);
	});

	it('does not tell an employee of an internal note, nor the actor of their own', async () => {
		const { technician, colleague, ticket } = await scenario();
		await follow(technician, { ticketId: ticket.id });

		await comment(technician, ticket.ticketTag, 'Mía');
		expect(await forRecipient(technician.personId)).toHaveLength(0);

		const before = (await forRecipient(ticket.requesterPersonId)).length;
		await comment(colleague, ticket.ticketTag, 'Interna', 'internal');
		expect(await forRecipient(ticket.requesterPersonId)).toHaveLength(before);
		expect(await forRecipient(technician.personId)).toHaveLength(1);
	});

	it('stops when the follower is demoted and resumes on promotion; the row is kept', async () => {
		const { admin, technician, ticket } = await scenario();
		await follow(technician, { ticketId: ticket.id });

		await getDb().update(users).set({ role: 'employee' }).where(eq(users.id, technician.id));
		await changeTicketStatus(admin, ticket.ticketTag, 'in_progress', deps);
		expect(await forRecipient(technician.personId)).toHaveLength(0);
		expect(await getDb().select().from(follows)).toHaveLength(1);

		await getDb().update(users).set({ role: 'technician' }).where(eq(users.id, technician.id));
		await changeTicketStatus(admin, ticket.ticketTag, 'waiting_on_user', deps);
		expect(await forRecipient(technician.personId)).toHaveLength(1);
	});

	it('makes the author of a comment a follower unless they are a participant', async () => {
		const { admin, technician, colleague, employee, ticket } = await scenario();
		await assignTicket(admin, ticket.ticketTag, technician.personId, deps);

		await comment(colleague, ticket.ticketTag, 'Hola');
		await comment(technician, ticket.ticketTag, 'Mío');
		await comment(employee, ticket.ticketTag, 'Gracias');

		const stored = await getDb().select().from(follows);
		expect(stored.map((row) => row.personId)).toEqual([colleague.personId]);
	});
});

describe('what a project and task follower receives', () => {
	it('tells a project follower of archiving and of a completed task, not of a due date', async () => {
		const { admin, technician, project, task, states } = await scenario();
		await follow(technician, { projectId: project.id });

		await updateTask(admin, task.id, { dueDate: '2030-01-01' }, deps);
		expect(await forRecipient(technician.personId)).toHaveLength(0);

		await moveTask(admin, task.id, states.completed.id, {}, deps);
		await archiveProject(admin, project.id, deps);

		const mine = await forRecipient(technician.personId);
		expect(mine).toHaveLength(2);
		expect(mine.every((row) => row.projectId === project.id)).toBe(true);
		expect(mine[0].snapshot.summary).toContain(task.taskTag);
	});

	it('tells a task follower of its state, assignees and due date', async () => {
		const { admin, technician, colleague, task, states } = await scenario();
		await follow(technician, { taskId: task.id });

		await moveTask(admin, task.id, states.started.id, {}, deps);
		await setAssignees(admin, task.id, [colleague.personId!], deps);
		await updateTask(admin, task.id, { dueDate: '2030-01-01' }, deps);

		const mine = await forRecipient(technician.personId);
		expect(mine).toHaveLength(3);
		expect(mine.every((row) => row.taskId === task.id && row.type === 'followed.activity')).toBe(
			true
		);
		// The new assignee hears `task.assigned`, once.
		expect((await forRecipient(colleague.personId)).map((row) => row.type)).toEqual([
			'task.assigned'
		]);
	});

	it('does not follow a project’s tasks implicitly', async () => {
		const { admin, technician, project, task, states } = await scenario();
		await follow(technician, { projectId: project.id });

		await moveTask(admin, task.id, states.started.id, {}, deps);

		expect(await forRecipient(technician.personId)).toHaveLength(0);
	});
});

describe('members-only projects', () => {
	it('does not tell a follower who is not a member', async () => {
		const { organisation, admin, technician } = await scenario();
		const restricted = await createProjectRow(organisation.id, {
			name: 'Secret',
			visibility: 'members'
		});
		await getDb().insert(projectMembers).values({
			organisationId: organisation.id,
			projectId: restricted.id,
			personId: admin.personId!
		});
		await follow(technician, { projectId: restricted.id });

		await archiveProject(admin, restricted.id, deps);

		expect(await forRecipient(technician.personId)).toHaveLength(0);
	});
});

describe('unfollowing from a notification', () => {
	it('removes the row of the record the notification was about', async () => {
		const { admin, technician, ticket } = await scenario();
		await follow(technician, { ticketId: ticket.id });
		await changeTicketStatus(admin, ticket.ticketTag, 'in_progress', deps);
		const [row] = await forRecipient(technician.personId);

		const outcome = await unfollowFromNotification(technician, row.id);

		expect(outcome.ok).toBe(true);
		expect(await getDb().select().from(follows)).toHaveLength(0);
	});

	it('is not_found for somebody else’s notification', async () => {
		const { admin, technician, colleague, ticket } = await scenario();
		await follow(technician, { ticketId: ticket.id });
		await changeTicketStatus(admin, ticket.ticketTag, 'in_progress', deps);
		const [row] = await forRecipient(technician.personId);

		expect(await unfollowFromNotification(colleague, row.id)).toEqual({
			ok: false,
			error: 'not_found'
		});
		expect(await getDb().select().from(follows)).toHaveLength(1);
	});
});
