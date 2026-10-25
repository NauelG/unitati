import { describe, expect, it } from 'vitest';
import { getDb } from '../db';
import { projects } from '../projects/schema';
import { eq } from 'drizzle-orm';
import { timeEntries, runningTimers } from './schema';
import {
	discardTimer,
	getRunningTimer,
	listEntriesFor,
	saveTimer,
	setTimeTracking,
	startTimer
} from './index';
import { createTimeScene } from './testing/fixtures';

const clock = { now: new Date('2026-10-25T12:00:00Z') };
const form = { minutes: 42, workDate: '2026-10-25', note: 'Fixed the VPN' };

describe('the timer', () => {
	it('starts on a ticket and shows up for the same person anywhere', async () => {
		const scene = await createTimeScene();
		expect(await startTimer(scene.technician, { ticketId: scene.ticket.id })).toEqual({
			ok: true,
			value: undefined
		});

		// Another request, another device: the viewer is the same person.
		const timer = await getRunningTimer({ ...scene.technician });
		expect(timer?.record).toMatchObject({
			kind: 'ticket',
			tag: scene.ticket.ticketTag,
			href: `/service-desk/${scene.ticket.ticketTag}`
		});
		expect(await getRunningTimer(scene.colleague)).toBeNull();
	});

	it('refuses a second timer, on the same or another record, and keeps the first', async () => {
		const scene = await createTimeScene();
		await startTimer(scene.technician, { ticketId: scene.ticket.id });
		const first = await getRunningTimer(scene.technician);

		const again = { ok: false, error: 'timer_already_running' };
		expect(await startTimer(scene.technician, { taskId: scene.task.id })).toEqual(again);
		expect(await startTimer(scene.technician, { ticketId: scene.ticket.id })).toEqual(again);
		expect((await getRunningTimer(scene.technician))?.startedAt).toEqual(first?.startedAt);

		// Timers are per person.
		expect((await startTimer(scene.colleague, { taskId: scene.task.id })).ok).toBe(true);
	});

	it('refuses an employee, tracking off, an unknown record and an archived project', async () => {
		const scene = await createTimeScene();
		const target = { taskId: scene.task.id };

		expect(await startTimer(scene.employee, target)).toEqual({ ok: false, error: 'forbidden' });
		expect(await startTimer(scene.technician, { taskId: crypto.randomUUID() })).toEqual({
			ok: false,
			error: 'record_not_found'
		});
		await getDb()
			.update(projects)
			.set({ archivedAt: new Date() })
			.where(eq(projects.id, scene.project.id));
		expect(await startTimer(scene.technician, target)).toEqual({
			ok: false,
			error: 'project_archived'
		});

		await setTimeTracking(scene.admin, false);
		expect(await startTimer(scene.technician, { ticketId: scene.ticket.id })).toEqual({
			ok: false,
			error: 'time_tracking_disabled'
		});
	});

	it('turns into an entry on the record it counted on when the form is saved', async () => {
		const scene = await createTimeScene();
		await startTimer(scene.technician, { taskId: scene.task.id });

		const saved = await saveTimer(scene.technician, form, clock);
		expect(saved.ok).toBe(true);

		const { entries } = await listEntriesFor(scene.technician, { taskId: scene.task.id });
		expect(entries).toHaveLength(1);
		expect(entries[0]).toMatchObject({ minutes: 42, note: 'Fixed the VPN', typeName: 'General' });
		expect(await getRunningTimer(scene.technician)).toBeNull();
	});

	it('keeps the timer when the form is refused, so nothing is lost', async () => {
		const scene = await createTimeScene();
		await startTimer(scene.technician, { taskId: scene.task.id });

		expect(await saveTimer(scene.technician, { ...form, workDate: '2026-10-26' }, clock)).toEqual({
			ok: false,
			error: 'future_date'
		});
		expect(await getRunningTimer(scene.technician)).not.toBeNull();
		expect(await getDb().select().from(timeEntries)).toHaveLength(0);
	});

	it('answers no_timer when there is nothing to save', async () => {
		const scene = await createTimeScene();
		expect(await saveTimer(scene.technician, form, clock)).toEqual({
			ok: false,
			error: 'no_timer'
		});
	});

	it('is thrown away, logging nothing, when the form is cancelled', async () => {
		const scene = await createTimeScene();
		await startTimer(scene.technician, { ticketId: scene.ticket.id });

		expect(await discardTimer(scene.technician)).toEqual({ ok: true, value: undefined });
		expect(await getRunningTimer(scene.technician)).toBeNull();
		expect(await getDb().select().from(timeEntries)).toHaveLength(0);
		// Discarding twice is harmless.
		expect((await discardTimer(scene.technician)).ok).toBe(true);
	});

	it('is discarded for the whole organisation when tracking is switched off', async () => {
		const scene = await createTimeScene();
		await startTimer(scene.technician, { ticketId: scene.ticket.id });
		await startTimer(scene.colleague, { taskId: scene.task.id });

		await setTimeTracking(scene.admin, false);
		expect(await getDb().select().from(runningTimers)).toHaveLength(0);
	});

	it('is refused at the database when it names two records or none', async () => {
		const scene = await createTimeScene();
		await expect(
			getDb().insert(runningTimers).values({
				organisationId: scene.organisation.id,
				personId: scene.technician.personId!,
				startedAt: new Date()
			})
		).rejects.toThrow();
	});
});
