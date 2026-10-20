import { describe, expect, it, vi } from 'vitest';
import { InMemoryStorage } from '#lib/server/shared/storage.js';

const storage = new InMemoryStorage();
vi.mock('#lib/server/shared/runtime.js', () => ({ runtimeStorage: () => storage }));

import { createOrganisation, createViewer } from '#lib/server/assets/testing/fixtures.js';
import { addProjectAttachments, addTaskAttachments } from '#lib/server/projects/index.js';
import {
	assignRow,
	createProjectRow,
	createTaskRow,
	createWorkspace,
	statesByGroup
} from '#lib/server/projects/testing/fixtures.js';
import { GET as getProject } from './[id]/+server';
import { GET as getTask } from '../task-attachments/[id]/+server';

const file = {
	filename: 'plan <1>.html',
	contentType: 'text/html',
	data: new Uint8Array([1, 2, 3])
};

async function setup() {
	const w = await createWorkspace();
	const project = await createProjectRow(w.organisation.id);
	const states = await statesByGroup(w.organisation.id);
	const task = await createTaskRow(w.organisation.id, project.id, states.unstarted.id);
	const p = await addProjectAttachments(w.technician, project.id, [file]);
	const t = await addTaskAttachments(w.technician, task.id, [file]);
	if (!p.ok || !t.ok) throw new Error('setup');
	return { ...w, task, project, projectFile: p.value[0].id, taskFile: t.value[0].id };
}

const call = (handler: typeof getProject | typeof getTask, user: unknown, id: string) =>
	Promise.resolve(handler({ locals: { user }, params: { id } } as never)).then(
		(response) => ({ response }),
		(thrown: { status: number }) => ({ thrown })
	);

describe('attachment downloads', () => {
	it('serves the bytes as a download, never inline, with nosniff', async () => {
		const w = await setup();

		for (const [handler, id] of [
			[getProject, w.projectFile],
			[getTask, w.taskFile]
		] as const) {
			const { response } = (await call(handler, w.technician, id)) as { response: Response };
			expect(response.headers.get('content-disposition')).toMatch(/^attachment;/);
			expect(response.headers.get('x-content-type-options')).toBe('nosniff');
			expect(new Uint8Array(await response.arrayBuffer())).toEqual(file.data);
		}
	});

	it('answers 404 to a malformed id, another organisation and an unassigned employee', async () => {
		const w = await setup();
		const other = await createOrganisation('Other', 'other');
		const stranger = await createViewer(other.id, 'admin', 'Mallory');

		for (const [handler, id, user] of [
			[getProject, 'nope', w.technician],
			[getProject, w.projectFile, stranger],
			[getTask, w.taskFile, stranger],
			[getTask, w.taskFile, w.employee],
			[getProject, w.projectFile, w.employee]
		] as const) {
			expect(
				((await call(handler, user, id)) as { thrown: { status: number } }).thrown.status
			).toBe(404);
		}
	});

	it('lets an employee download from a task assigned to them and its project', async () => {
		const w = await setup();
		await assignRow(w.organisation.id, w.task.id, w.employee.personId!);

		for (const [handler, id] of [
			[getProject, w.projectFile],
			[getTask, w.taskFile]
		] as const) {
			const { response } = (await call(handler, w.employee, id)) as { response: Response };
			expect(response.status).toBe(200);
		}
	});
});
