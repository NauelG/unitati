import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { getDb } from '../db';
import { tasks } from '../projects/schema';
import { createProjectRow, createTaskRow } from '../projects/testing/fixtures';
import {
	createType,
	logTime,
	projectEntries,
	projectTime,
	removeType,
	reportAll,
	setTimeTracking,
	taskTime,
	timeEntriesCsv
} from './index';
import { createTimeScene } from './testing/fixtures';

const clock = { now: new Date('2026-10-25T12:00:00Z') };
const when = { workDate: '2026-10-24' };

describe('a project’s time', () => {
	it('sums every task of the project by type, completed ones included, and ignores tickets', async () => {
		const scene = await createTimeScene();
		const meetings = await createType(scene.admin, 'Meetings');
		if (!meetings.ok) throw new Error('type failed');
		const done = await createTaskRow(
			scene.organisation.id,
			scene.project.id,
			scene.states.completed.id,
			{
				title: 'Already shipped'
			}
		);
		const log = (
			target: { taskId: string } | { ticketId: string },
			minutes: number,
			typeId?: string
		) => logTime(scene.technician, target, { minutes, typeId, ...when }, clock);

		await log({ taskId: scene.task.id }, 60);
		await log({ taskId: scene.task.id }, 30, meetings.value.id);
		await log({ taskId: done.id }, 15);
		await log({ ticketId: scene.ticket.id }, 500);

		expect(await projectTime(scene.technician, scene.project.id)).toEqual({
			totalMinutes: 105,
			byType: [
				{ typeId: expect.any(String), typeName: 'General', archived: false, minutes: 75 },
				{ typeId: meetings.value.id, typeName: 'Meetings', archived: false, minutes: 30 }
			]
		});
	});

	it('moves with the task', async () => {
		const scene = await createTimeScene();
		const elsewhere = await createProjectRow(scene.organisation.id, { name: 'Elsewhere' });
		await logTime(scene.technician, { taskId: scene.task.id }, { minutes: 40, ...when }, clock);

		await getDb().update(tasks).set({ projectId: elsewhere.id }).where(eq(tasks.id, scene.task.id));

		expect((await projectTime(scene.technician, scene.project.id))?.totalMinutes).toBe(0);
		expect((await projectTime(scene.technician, elsewhere.id))?.totalMinutes).toBe(40);
	});

	it('keeps an archived type in the breakdown', async () => {
		const scene = await createTimeScene();
		const used = await createType(scene.admin, 'Used');
		if (!used.ok) throw new Error('type failed');
		await logTime(
			scene.technician,
			{ taskId: scene.task.id },
			{ minutes: 10, typeId: used.value.id, ...when },
			clock
		);
		await removeType(scene.admin, used.value.id);

		const time = await projectTime(scene.technician, scene.project.id);
		expect(time?.byType).toEqual([
			expect.objectContaining({ typeName: 'Used', archived: true, minutes: 10 })
		]);
	});

	it('is absent while tracking is off and for an employee', async () => {
		const scene = await createTimeScene();
		expect(await projectTime(scene.employee, scene.project.id)).toBeNull();

		await setTimeTracking(scene.admin, false);
		expect(await projectTime(scene.technician, scene.project.id)).toBeNull();
	});
});

describe('a project’s entries', () => {
	async function sceneWithEntries() {
		const scene = await createTimeScene();
		const done = await createTaskRow(
			scene.organisation.id,
			scene.project.id,
			scene.states.completed.id,
			{ title: 'Already shipped' }
		);
		const elsewhere = await createProjectRow(scene.organisation.id, { name: 'Elsewhere' });
		const foreign = await createTaskRow(
			scene.organisation.id,
			elsewhere.id,
			scene.states.unstarted.id
		);
		const log = (
			by: typeof scene.technician,
			target: { taskId: string } | { ticketId: string },
			workDate: string,
			minutes = 30
		) => logTime(by, target, { minutes, workDate, note: `on ${workDate}` }, clock);

		await log(scene.technician, { taskId: scene.task.id }, '2026-10-20');
		await log(scene.colleague, { taskId: done.id }, '2026-10-23', 45);
		await log(scene.technician, { taskId: scene.task.id }, '2026-10-22');
		await log(scene.technician, { ticketId: scene.ticket.id }, '2026-10-24', 500);
		await log(scene.technician, { taskId: foreign.id }, '2026-10-24', 500);
		return { ...scene, done };
	}

	it('lists everybody’s entries on every task of the project, completed ones included, newest work first', async () => {
		const scene = await sceneWithEntries();

		const entries = await projectEntries(scene.technician, scene.project.id);
		expect(entries).toMatchObject({ total: 3, page: 1, pageCount: 1 });
		expect(
			entries?.rows.map((row) => [row.workDate, row.personName, row.record.tag, row.minutes])
		).toEqual([
			['2026-10-23', 'Carla Colleague', scene.done.taskTag, 45],
			['2026-10-22', scene.technician.name, scene.task.taskTag, 30],
			['2026-10-20', scene.technician.name, scene.task.taskTag, 30]
		]);
		expect(entries?.rows[0]).toMatchObject({
			typeName: 'General',
			note: 'on 2026-10-23',
			record: { kind: 'task', title: 'Already shipped' }
		});
	});

	it('pages the list', async () => {
		const scene = await sceneWithEntries();

		const second = await projectEntries(scene.technician, scene.project.id, {
			page: 2,
			perPage: 2
		});
		expect(second).toMatchObject({ total: 3, page: 2, pageCount: 2 });
		expect(second?.rows.map((row) => row.workDate)).toEqual(['2026-10-20']);
	});

	it('is absent while tracking is off and for an employee', async () => {
		const scene = await sceneWithEntries();
		expect(await projectEntries(scene.employee, scene.project.id)).toBeNull();

		await setTimeTracking(scene.admin, false);
		expect(await projectEntries(scene.technician, scene.project.id)).toBeNull();
	});
});

describe('a task’s time with its subtasks', () => {
	async function family() {
		const scene = await createTimeScene();
		const child = await createTaskRow(
			scene.organisation.id,
			scene.project.id,
			scene.states.started.id,
			{ title: 'Child', parentTaskId: scene.task.id }
		);
		const dropped = await createTaskRow(
			scene.organisation.id,
			scene.project.id,
			scene.states.cancelled.id,
			{ title: 'Dropped', parentTaskId: scene.task.id }
		);
		const log = (taskId: string, minutes: number) =>
			logTime(scene.technician, { taskId }, { minutes, ...when }, clock);
		await log(scene.task.id, 30);
		await log(child.id, 60);
		await log(dropped.id, 15);
		return { ...scene, child, dropped };
	}

	it('gives two figures, the second including cancelled subtasks', async () => {
		const scene = await family();

		expect(await taskTime(scene.technician, scene.task.id)).toEqual({
			ownMinutes: 30,
			withSubtasksMinutes: 105
		});
		expect(await taskTime(scene.technician, scene.child.id)).toEqual({
			ownMinutes: 60,
			withSubtasksMinutes: 60
		});
	});

	it('is zero for a task with no entries, and absent for an employee or while tracking is off', async () => {
		const scene = await createTimeScene();
		expect(await taskTime(scene.technician, scene.task.id)).toEqual({
			ownMinutes: 0,
			withSubtasksMinutes: 0
		});
		expect(await taskTime(scene.employee, scene.task.id)).toBeNull();

		await setTimeTracking(scene.admin, false);
		expect(await taskTime(scene.technician, scene.task.id)).toBeNull();
	});

	it('leaves the project total and the export unchanged by nesting', async () => {
		const scene = await family();
		const loose = await createTaskRow(
			scene.organisation.id,
			scene.project.id,
			scene.states.started.id,
			{ title: 'Loose' }
		);
		await logTime(scene.technician, { taskId: loose.id }, { minutes: 20, ...when }, clock);

		const read = async () => {
			const rows = await reportAll(scene.technician, { projectTag: scene.project.projectTag });
			if (!rows.ok) throw new Error(rows.error);
			return {
				total: await projectTime(scene.technician, scene.project.id),
				csv: timeEntriesCsv(rows.value)
			};
		};
		const before = await read();

		await getDb()
			.update(tasks)
			.set({ parentTaskId: null })
			.where(eq(tasks.parentTaskId, scene.task.id));
		await getDb().update(tasks).set({ parentTaskId: scene.task.id }).where(eq(tasks.id, loose.id));

		expect(await read()).toEqual(before);
		expect(before.total?.totalMinutes).toBe(125);
	});
});
