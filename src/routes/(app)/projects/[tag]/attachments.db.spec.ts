import { describe, expect, it, vi } from 'vitest';
import { InMemoryStorage } from '#lib/server/shared/storage.js';

const storage = new InMemoryStorage();
vi.mock('#lib/server/shared/runtime.js', () => ({ runtimeStorage: () => storage }));

import { listProjectAttachments } from '#lib/server/projects/index.js';
import { actionEvent, outcomeOf } from '#lib/server/projects/testing/action-event.js';
import { createProjectRow, createWorkspace } from '#lib/server/projects/testing/fixtures.js';
import { actions } from './+page.server';

function withFiles(
	user: Parameters<typeof actionEvent>[0],
	files: File[],
	params: Record<string, string>
) {
	const data = new FormData();
	for (const file of files) data.append('files', file);
	return {
		request: new Request('http://localhost/action', { method: 'POST', body: data }),
		locals: { user },
		params
	} as never;
}

describe('project attachment actions', () => {
	it('answers 403 to a viewer who may only read assigned work', async () => {
		const workspace = await createWorkspace();
		const project = await createProjectRow(workspace.organisation.id);
		const params = { tag: project.projectTag };

		const outcome = await outcomeOf(() =>
			actions.addAttachments(withFiles(workspace.employee, [new File(['x'], 'a.txt')], params))
		);

		expect(outcome.thrown?.status).toBe(403);
	});

	it('adds, then removes, a file', async () => {
		const { technician, organisation } = await createWorkspace();
		const project = await createProjectRow(organisation.id);
		const params = { tag: project.projectTag };

		await actions.addAttachments(withFiles(technician, [new File(['hello'], 'plan.pdf')], params));
		const listed = await listProjectAttachments(technician, project.id);
		if (!listed.ok) throw new Error('setup');
		expect(listed.value).toMatchObject([{ filename: 'plan.pdf', byteSize: 5 }]);

		await actions.removeAttachment(
			actionEvent(technician, { attachmentId: listed.value[0].id }, params)
		);
		const after = await listProjectAttachments(technician, project.id);
		expect(after.ok && after.value).toEqual([]);
	});
});
