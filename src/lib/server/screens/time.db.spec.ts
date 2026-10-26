import { eq } from 'drizzle-orm';
import { describe, expect, it, vi } from 'vitest';
import { getDb } from '../db';
import { projects } from '../projects/schema';
import { logTime, setTimeTracking } from '../time';
import { createTimeScene } from '../time/testing/fixtures';
import { projectScreen } from './project';
import { taskScreen } from './task';
import { ticketScreen } from './ticket';

async function sceneWithTime() {
	const scene = await createTimeScene();
	const outcome = await logTime(
		scene.technician,
		{ taskId: scene.task.id },
		{
			minutes: 30,
			workDate: '2020-01-01'
		}
	);
	if (!outcome.ok) throw new Error('log failed');
	await logTime(
		scene.technician,
		{ ticketId: scene.ticket.id },
		{
			minutes: 45,
			workDate: '2020-01-01'
		}
	);
	return scene;
}

describe('the Time section of the record screens', () => {
	it('is on the ticket and the task for a technician, with the record’s total', async () => {
		const scene = await sceneWithTime();

		const ticket = await ticketScreen(scene.technician, scene.ticket.ticketTag);
		const task = await taskScreen(scene.technician, scene.task.taskTag);
		if (!ticket.ok || !task.ok) throw new Error('screens not found');

		expect(ticket.value.time).toMatchObject({ totalMinutes: 45, canLog: true });
		expect(task.value.time).toMatchObject({ totalMinutes: 30, canLog: true });
		expect(task.value.time?.types.map((type) => type.name)).toEqual(['General']);
	});

	it('hands the screen the organisation’s today, not the UTC day', async () => {
		const scene = await sceneWithTime();
		// 23:30 UTC on the 25th is already the 26th in the organisation's zone (Europe/Madrid).
		vi.useFakeTimers({ toFake: ['Date'] });
		vi.setSystemTime(new Date('2026-10-25T23:30:00Z'));
		try {
			const ticket = await ticketScreen(scene.technician, scene.ticket.ticketTag);
			const task = await taskScreen(scene.technician, scene.task.taskTag);
			if (!ticket.ok || !task.ok) throw new Error('screens not found');
			expect(ticket.value.time?.today).toBe('2026-10-26');
			expect(task.value.time?.today).toBe('2026-10-26');

			// The default the form proposes is a date the server accepts.
			const saved = await logTime(
				scene.technician,
				{ taskId: scene.task.id },
				{ minutes: 15, workDate: task.value.time!.today }
			);
			expect(saved.ok).toBe(true);
		} finally {
			vi.useRealTimers();
		}
	});

	it('is absent while tracking is off', async () => {
		const scene = await sceneWithTime();
		await setTimeTracking(scene.admin, false);

		const ticket = await ticketScreen(scene.technician, scene.ticket.ticketTag);
		const task = await taskScreen(scene.technician, scene.task.taskTag);
		if (!ticket.ok || !task.ok) throw new Error('screens not found');
		expect(ticket.value.time).toBeNull();
		expect(task.value.time).toBeNull();
	});

	it('is absent for an employee on the ticket they requested', async () => {
		const scene = await sceneWithTime();
		const ticket = await ticketScreen(scene.employee, scene.ticket.ticketTag);
		// An employee does not hold tickets.view: the staff screen is not theirs at all.
		expect(ticket.ok).toBe(false);
	});

	it('still lists but no longer lets anyone log on a task of an archived project', async () => {
		const scene = await sceneWithTime();
		await getDb()
			.update(projects)
			.set({ archivedAt: new Date() })
			.where(eq(projects.id, scene.project.id));

		const task = await taskScreen(scene.technician, scene.task.taskTag);
		if (!task.ok) throw new Error('screen not found');
		expect(task.value.time).toMatchObject({ totalMinutes: 30, canLog: false });
	});

	it('carries the project total on the project screen, and nothing once tracking is off', async () => {
		const scene = await sceneWithTime();

		const project = await projectScreen(scene.technician, scene.project.projectTag);
		if (!project.ok) throw new Error('screen not found');
		expect(project.value.time?.totalMinutes).toBe(30);

		await setTimeTracking(scene.admin, false);
		const off = await projectScreen(scene.technician, scene.project.projectTag);
		if (!off.ok) throw new Error('screen not found');
		expect(off.value.time).toBeNull();
	});

	it('lists the entries behind the project total, paged, and the report link only for time.manage', async () => {
		const scene = await sceneWithTime();
		await logTime(
			scene.colleague,
			{ taskId: scene.task.id },
			{ minutes: 20, workDate: '2020-01-02' }
		);

		const project = await projectScreen(scene.technician, scene.project.projectTag);
		if (!project.ok) throw new Error('screen not found');
		expect(project.value.time?.report).toBe(false);
		expect(project.value.time?.entries).toMatchObject({ total: 2, page: 1 });
		expect(
			project.value.time?.entries.rows.map((row) => [row.personName, row.minutes, row.record])
		).toEqual([
			[
				'Carla Colleague',
				20,
				expect.objectContaining({ tag: scene.task.taskTag, title: scene.task.title })
			],
			[scene.technician.name, 30, expect.objectContaining({ tag: scene.task.taskTag })]
		]);

		const second = await projectScreen(scene.admin, scene.project.projectTag, {
			time: { page: 2, perPage: 1 }
		});
		if (!second.ok) throw new Error('screen not found');
		expect(second.value.time?.report).toBe(true);
		expect(second.value.time?.entries).toMatchObject({ total: 2, page: 2, pageCount: 2 });
		expect(second.value.time?.entries.rows.map((row) => row.minutes)).toEqual([30]);
	});
});
