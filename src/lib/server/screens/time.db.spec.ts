import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { getDb } from '../db';
import { projects } from '../projects/schema';
import { logTime, setTimeTracking } from '../time';
import { createTimeScene } from '../time/testing/fixtures';
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
});
