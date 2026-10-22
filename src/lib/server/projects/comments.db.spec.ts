import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { getDb } from '../db';
import { activity } from '../activity/schema';
import { archiveProject } from './index';
import {
	addProjectComment,
	addTaskComment,
	listProjectComments,
	listTaskComments
} from './comments';
import {
	createProjectRow,
	createTaskRow,
	createWorkspace,
	statesByGroup
} from './testing/fixtures';

async function setup() {
	const workspace = await createWorkspace();
	const project = await createProjectRow(workspace.organisation.id);
	const { backlog } = await statesByGroup(workspace.organisation.id);
	const task = await createTaskRow(workspace.organisation.id, project.id, backlog.id);
	return { ...workspace, project, task };
}

describe('project and task comments', () => {
	it('lists a task comment newest first with its author, and puts it on the timeline', async () => {
		const { admin, technician, task } = await setup();

		expect(await addTaskComment(admin, task.id, '  First  ')).toEqual({
			ok: true,
			value: undefined
		});
		await addTaskComment(technician, task.id, 'Second');

		const listed = await listTaskComments(admin, task.id);
		if (!listed.ok) throw new Error('setup');
		expect(listed.value.map(({ body, authorName }) => [body, authorName])).toEqual([
			['Second', 'Tom Technician'],
			['First', 'Ada Admin']
		]);

		const entries = await getDb().select().from(activity).where(eq(activity.taskId, task.id));
		const note = entries.find((entry) => entry.verb === 'note.added');
		expect(note?.payload).toMatchObject({
			text: expect.any(String),
			commentId: expect.any(String)
		});
	});

	it('lists a project comment and writes the entry on the project', async () => {
		const { admin, project } = await setup();

		await addProjectComment(admin, project.id, 'Kick-off done');

		const listed = await listProjectComments(admin, project.id);
		expect(listed.ok && listed.value.map(({ body }) => body)).toEqual(['Kick-off done']);
		const entries = await getDb().select().from(activity).where(eq(activity.projectId, project.id));
		expect(entries.map(({ verb }) => verb)).toContain('note.added');
	});

	it('refuses an empty or oversized body', async () => {
		const { admin, task } = await setup();

		expect(await addTaskComment(admin, task.id, '   ')).toEqual({
			ok: false,
			error: 'empty_comment'
		});
		expect(await addTaskComment(admin, task.id, 'x'.repeat(4001))).toEqual({
			ok: false,
			error: 'comment_too_long'
		});
	});

	it('is read-only once the project is archived', async () => {
		const { admin, project, task } = await setup();
		await archiveProject(admin, project.id);

		expect(await addProjectComment(admin, project.id, 'Late')).toEqual({
			ok: false,
			error: 'project_archived'
		});
		expect(await addTaskComment(admin, task.id, 'Late')).toEqual({
			ok: false,
			error: 'project_archived'
		});
	});

	it('does not reveal a task the viewer cannot see', async () => {
		const { employee, task } = await setup();

		expect(await listTaskComments(employee, task.id)).toEqual({
			ok: false,
			error: 'task_not_found'
		});
	});
});
