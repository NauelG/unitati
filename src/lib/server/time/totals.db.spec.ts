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
	setTimeTracking
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
