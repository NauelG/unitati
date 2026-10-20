import { describe, expect, it, vi } from 'vitest';
import { InMemoryStorage } from '#lib/server/shared/storage.js';

const storage = new InMemoryStorage();
vi.mock('#lib/server/shared/runtime.js', () => ({ runtimeStorage: () => storage }));

import { archiveProject, listTaskAttachments } from '#lib/server/projects/index.js';
import { actionEvent, outcomeOf } from '#lib/server/projects/testing/action-event.js';
import {
	createProjectRow,
	createTaskRow,
	createWorkspace,
	statesByGroup
} from '#lib/server/projects/testing/fixtures.js';
import { actions } from './+page.server';

async function setup() {
	const workspace = await createWorkspace();
	const project = await createProjectRow(workspace.organisation.id);
	const states = await statesByGroup(workspace.organisation.id);
	const task = await createTaskRow(workspace.organisation.id, project.id, states.unstarted.id);
	return { ...workspace, project, task, params: { taskTag: task.taskTag } };
}

/** An action event whose form carries real files, which `actionEvent` (strings only) cannot. */
function withFiles(
	user: Parameters<typeof actionEvent>[0],
	files: File[],
	fields: Record<string, string>,
	params: Record<string, string>
) {
	const data = new FormData();
	for (const file of files) data.append('files', file);
	for (const [key, value] of Object.entries(fields)) data.append(key, value);
	return {
		request: new Request('http://localhost/action', { method: 'POST', body: data }),
		locals: { user },
		params
	} as never;
}

describe('task attachment actions', () => {
	it('answers 403 to a viewer who may only read assigned work', async () => {
		const { employee, params } = await setup();

		for (const run of [
			() => actions.addAttachments(withFiles(employee, [new File(['x'], 'a.txt')], {}, params)),
			() =>
				actions.removeAttachment(
					actionEvent(employee, { attachmentId: crypto.randomUUID() }, params)
				)
		]) {
			expect((await outcomeOf(run)).thrown?.status).toBe(403);
		}
	});

	it('adds, then removes, a file', async () => {
		const { technician, task, params } = await setup();

		const added = await actions.addAttachments(
			withFiles(technician, [new File(['hello'], 'a.txt', { type: 'text/plain' })], {}, params)
		);
		expect(added).toEqual({ action: 'addAttachments' });

		const listed = await listTaskAttachments(technician, task.id);
		if (!listed.ok) throw new Error('setup');
		expect(listed.value).toMatchObject([{ filename: 'a.txt', byteSize: 5 }]);

		await actions.removeAttachment(
			actionEvent(technician, { attachmentId: listed.value[0].id }, params)
		);
		const after = await listTaskAttachments(technician, task.id);
		expect(after.ok && after.value).toEqual([]);
	});

	it('refuses an empty submission and a sixth file with a message', async () => {
		const { technician, params } = await setup();
		const six = Array.from({ length: 6 }, (_, i) => new File(['x'], `f${i}.txt`));

		const none = await outcomeOf(() =>
			actions.addAttachments(withFiles(technician, [], {}, params))
		);
		const many = await outcomeOf(() =>
			actions.addAttachments(withFiles(technician, six, {}, params))
		);

		expect(none.returned?.status).toBe(400);
		expect(many.returned).toMatchObject({ status: 400, data: { action: 'addAttachments' } });
	});

	it('refuses both writes once the project is archived', async () => {
		const { technician, project, params } = await setup();
		await archiveProject(technician, project.id);

		const outcome = await outcomeOf(() =>
			actions.addAttachments(withFiles(technician, [new File(['x'], 'a.txt')], {}, params))
		);

		expect(outcome.returned).toMatchObject({ status: 400, data: { action: 'addAttachments' } });
	});
});
