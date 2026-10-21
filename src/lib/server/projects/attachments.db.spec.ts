import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { MAX_ATTACHMENT_BYTES } from '#lib/domain/attachments.js';
import { listActivity } from '../activity';
import { createOrganisation, createViewer } from '../assets/testing/fixtures';
import { getDb } from '../db';
import type { UploadedFile } from '../shared/attachments';
import { InMemoryStorage } from '../shared/storage';
import {
	addProjectAttachments,
	addTaskAttachments,
	getProjectAttachment,
	getTaskAttachment,
	listProjectAttachments,
	listTaskAttachments,
	moveTaskToProject,
	removeProjectAttachment,
	removeTaskAttachment,
	archiveProject
} from './index';
import { projectAttachments, taskAttachments } from './schema';
import {
	assignRow,
	createProjectRow,
	createTaskRow,
	createWorkspace,
	statesByGroup
} from './testing/fixtures';

/** Remembers every key it was ever given, so a leftover can be told from a clean slate. */
class RecordingStorage extends InMemoryStorage {
	readonly written: string[] = [];
	failDeletes = false;

	override async put(key: string, data: Uint8Array) {
		this.written.push(key);
		await super.put(key, data);
	}

	override async delete(key: string) {
		if (this.failDeletes) throw new Error('disk gone');
		await super.delete(key);
	}

	async stored() {
		const present: string[] = [];
		for (const key of this.written) if (await this.get(key)) present.push(key);
		return present;
	}
}

const file = (filename: string, size = 4, contentType = 'text/plain'): UploadedFile => ({
	filename,
	contentType,
	data: new Uint8Array(size).fill(7)
});

async function setup() {
	const workspace = await createWorkspace();
	const project = await createProjectRow(workspace.organisation.id);
	const states = await statesByGroup(workspace.organisation.id);
	const task = await createTaskRow(workspace.organisation.id, project.id, states.unstarted.id);
	const storage = new RecordingStorage();
	return { ...workspace, project, task, storage, deps: { storage } };
}

const unwrap = <T>(
	outcome: { ok: true; value: T } | { ok: false; error: string | { kind: string } }
): T => {
	if (!outcome.ok) throw new Error(JSON.stringify(outcome.error));
	return outcome.value;
};

describe.each([
	{
		kind: 'project',
		add: (w: Awaited<ReturnType<typeof setup>>, files: UploadedFile[], actor = w.technician) =>
			addProjectAttachments(actor, w.project.id, files, w.deps),
		list: (w: Awaited<ReturnType<typeof setup>>, viewer = w.technician) =>
			listProjectAttachments(viewer, w.project.id),
		get: getProjectAttachment,
		remove: removeProjectAttachment,
		rows: async () => getDb().select().from(projectAttachments),
		verbs: ['project.attachment.added', 'project.attachment.removed'],
		history: (w: Awaited<ReturnType<typeof setup>>) =>
			listActivity({ organisationId: w.organisation.id, target: { projectId: w.project.id } })
	},
	{
		kind: 'task',
		add: (w: Awaited<ReturnType<typeof setup>>, files: UploadedFile[], actor = w.technician) =>
			addTaskAttachments(actor, w.task.id, files, w.deps),
		list: (w: Awaited<ReturnType<typeof setup>>, viewer = w.technician) =>
			listTaskAttachments(viewer, w.task.id),
		get: getTaskAttachment,
		remove: removeTaskAttachment,
		rows: async () => getDb().select().from(taskAttachments),
		verbs: ['task.attachment.added', 'task.attachment.removed'],
		history: (w: Awaited<ReturnType<typeof setup>>) =>
			listActivity({ organisationId: w.organisation.id, target: { taskId: w.task.id } })
	}
])('attachments on a $kind', (subject) => {
	it('stores, lists in order, downloads and removes a file', async () => {
		const w = await setup();

		const added = unwrap(await subject.add(w, [file('a.txt'), file('b.txt', 9, 'image/png')]));
		expect(added.map((row) => row.filename)).toEqual(['a.txt', 'b.txt']);

		const listed = unwrap(await subject.list(w));
		expect(listed.map((row) => row.filename)).toEqual(['a.txt', 'b.txt']);
		expect(listed[1]).toMatchObject({ byteSize: 9, contentType: 'image/png' });

		const downloaded = unwrap(await subject.get(w.technician, added[0].id, w.deps));
		expect(downloaded).toMatchObject({ filename: 'a.txt', contentType: 'text/plain' });
		expect(downloaded.data).toEqual(new Uint8Array(4).fill(7));

		expect((await subject.remove(w.technician, added[0].id, w.deps)).ok).toBe(true);
		expect(await subject.rows()).toHaveLength(1);
		expect(await w.storage.stored()).toHaveLength(1);
		expect((await subject.get(w.technician, added[0].id, w.deps)).ok).toBe(false);
	});

	it('refuses a sixth file and a file over 10 MiB, storing nothing', async () => {
		const w = await setup();

		const six = await subject.add(
			w,
			Array.from({ length: 6 }, (_, i) => file(`f${i}.txt`))
		);
		const big = await subject.add(w, [file('big.bin', MAX_ATTACHMENT_BYTES + 1)]);

		expect(six).toEqual({ ok: false, error: 'attachments_too_many' });
		expect(big).toEqual({ ok: false, error: 'attachments_too_large' });
		expect(await subject.rows()).toHaveLength(0);
		expect(w.storage.written).toHaveLength(0);
	});

	it('accepts exactly five files of exactly 10 MiB', async () => {
		const w = await setup();

		const outcome = await subject.add(
			w,
			Array.from({ length: 5 }, (_, i) => file(`f${i}.bin`, MAX_ATTACHMENT_BYTES))
		);

		expect(outcome.ok).toBe(true);
	});

	it('refuses add and remove on an archived project, but still lists and downloads', async () => {
		const w = await setup();
		const [kept] = unwrap(await subject.add(w, [file('kept.txt')]));
		unwrap(await archiveProject(w.technician, w.project.id));

		const added = await subject.add(w, [file('late.txt')]);
		const removed = await subject.remove(w.technician, kept.id, w.deps);

		expect(added).toEqual({ ok: false, error: 'project_archived' });
		expect(removed).toEqual({ ok: false, error: 'project_archived' });
		expect(await w.storage.stored()).toHaveLength(1);
		expect(unwrap(await subject.list(w))).toHaveLength(1);
		expect((await subject.get(w.technician, kept.id, w.deps)).ok).toBe(true);
	});

	it('does not let a viewer without projects.manage write', async () => {
		const w = await setup();
		const [kept] = unwrap(await subject.add(w, [file('kept.txt')]));

		await expect(subject.add(w, [file('x.txt')], w.employee)).rejects.toThrow(/cannot manage/);
		await expect(subject.remove(w.employee, kept.id, w.deps)).rejects.toThrow(/cannot manage/);
	});

	it('leaves no orphaned bytes when the transaction fails after they were written', async () => {
		const w = await setup();

		// An empty filename is refused when the activity entry is validated, which
		// happens after the row is inserted and before the commit.
		await expect(subject.add(w, [file('ok.txt'), file('')])).rejects.toThrow();

		expect(w.storage.written).toHaveLength(2);
		expect(await w.storage.stored()).toEqual([]);
		expect(await subject.rows()).toHaveLength(0);
	});

	it('does not fail a removal when deleting the bytes fails after commit', async () => {
		const w = await setup();
		const [row] = unwrap(await subject.add(w, [file('a.txt')]));
		w.storage.failDeletes = true;

		const outcome = await subject.remove(w.technician, row.id, w.deps);

		expect(outcome.ok).toBe(true);
		expect(await subject.rows()).toHaveLength(0);
	});

	it('never confirms an attachment of another organisation', async () => {
		const w = await setup();
		const [row] = unwrap(await subject.add(w, [file('a.txt')]));
		const other = await createOrganisation('Other', 'other');
		const stranger = await createViewer(other.id, 'admin', 'Mallory');

		expect(await subject.get(stranger, row.id, w.deps)).toEqual({
			ok: false,
			error: 'attachment_not_found'
		});
		expect(await subject.remove(stranger, row.id, w.deps)).toEqual({
			ok: false,
			error: 'attachment_not_found'
		});
		expect(await subject.rows()).toHaveLength(1);
	});

	it('records one event per file with the filename, on add and on remove', async () => {
		const w = await setup();
		const added = unwrap(await subject.add(w, [file('a.txt'), file('b.txt')]));
		await subject.remove(w.technician, added[0].id, w.deps);

		const [addedVerb, removedVerb] = subject.verbs;
		const history = (await subject.history(w)).filter((entry) => entry.verb.includes('attachment'));

		expect(
			history.map((entry) => [entry.verb, (entry.payload as { filename: string }).filename]).sort()
		).toEqual(
			[
				[addedVerb, 'a.txt'],
				[addedVerb, 'b.txt'],
				[removedVerb, 'a.txt']
			].sort()
		);
		expect(history.every((entry) => entry.actorPersonId === w.technician.personId)).toBe(true);
	});

	it('keeps the filename in the history after the file is gone', async () => {
		const w = await setup();
		const [row] = unwrap(await subject.add(w, [file('gone.txt')]));
		await subject.remove(w.technician, row.id, w.deps);

		expect((await subject.history(w)).some((entry) => entry.verb === subject.verbs[1])).toBe(true);
	});
});

describe('who sees what', () => {
	it('shows an employee the files of their task and its project, and nothing else', async () => {
		const w = await setup();
		const states = await statesByGroup(w.organisation.id);
		const otherProject = await createProjectRow(w.organisation.id, { name: 'Elsewhere' });
		const otherTask = await createTaskRow(w.organisation.id, otherProject.id, states.unstarted.id);
		await assignRow(w.organisation.id, w.task.id, w.employee.personId!);

		const [mine] = unwrap(
			await addTaskAttachments(w.technician, w.task.id, [file('mine.txt')], w.deps)
		);
		const [ofProject] = unwrap(
			await addProjectAttachments(w.technician, w.project.id, [file('plan.txt')], w.deps)
		);
		const [theirs] = unwrap(
			await addTaskAttachments(w.technician, otherTask.id, [file('theirs.txt')], w.deps)
		);
		const [theirProject] = unwrap(
			await addProjectAttachments(w.technician, otherProject.id, [file('x.txt')], w.deps)
		);

		expect((await getTaskAttachment(w.employee, mine.id, w.deps)).ok).toBe(true);
		expect((await getProjectAttachment(w.employee, ofProject.id, w.deps)).ok).toBe(true);
		expect((await listTaskAttachments(w.employee, w.task.id)).ok).toBe(true);
		expect(await getTaskAttachment(w.employee, theirs.id, w.deps)).toEqual({
			ok: false,
			error: 'attachment_not_found'
		});
		expect(await getProjectAttachment(w.employee, theirProject.id, w.deps)).toEqual({
			ok: false,
			error: 'attachment_not_found'
		});
		expect(await listTaskAttachments(w.employee, otherTask.id)).toEqual({
			ok: false,
			error: 'task_not_found'
		});
		expect(await listProjectAttachments(w.employee, otherProject.id)).toEqual({
			ok: false,
			error: 'project_not_found'
		});
	});
});

describe('moving a task to another project', () => {
	it('keeps its attachments', async () => {
		const w = await setup();
		const target = await createProjectRow(w.organisation.id, { name: 'Target' });
		unwrap(await addTaskAttachments(w.technician, w.task.id, [file('a.txt')], w.deps));

		unwrap(await moveTaskToProject(w.technician, w.task.id, target.id));

		const listed = unwrap(await listTaskAttachments(w.technician, w.task.id));
		expect(listed.map((row) => row.filename)).toEqual(['a.txt']);
	});
});

describe('the schema', () => {
	it('records who uploaded and gives each file a unique server-made key', async () => {
		const w = await setup();
		unwrap(
			await addProjectAttachments(
				w.technician,
				w.project.id,
				[file('same.txt'), file('same.txt')],
				w.deps
			)
		);

		const rows = await getDb()
			.select()
			.from(projectAttachments)
			.where(eq(projectAttachments.projectId, w.project.id));

		expect(new Set(rows.map((row) => row.storageKey)).size).toBe(2);
		expect(rows.every((row) => row.storageKey.startsWith(`${w.organisation.id}/`))).toBe(true);
		expect(rows.every((row) => row.uploadedByPersonId === w.technician.personId)).toBe(true);
	});
});
