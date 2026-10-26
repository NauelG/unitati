import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { listActivity } from '../activity';
import { getDb } from '../db';
import { projects, tasks } from '../projects/schema';
import { tickets } from '../service-desk/schema';
import { ticketThread } from '../service-desk';
import { timeEntries } from './schema';
import {
	createType,
	deleteEntry,
	editEntry,
	listEntriesFor,
	listOfferedTypes,
	logTime,
	removeType,
	setTimeTracking
} from './index';
import { createTimeScene, defaultTypeOf } from './testing/fixtures';

const NOON = new Date('2026-10-25T12:00:00Z');
const clock = { now: NOON };
const entry = { minutes: 90, workDate: '2026-10-24', note: 'Swapped the toner' };

async function logged(
	scene: Awaited<ReturnType<typeof createTimeScene>>,
	by = scene.technician,
	target: { ticketId: string } | { taskId: string } = { ticketId: scene.ticket.id }
) {
	const outcome = await logTime(by, target, entry, clock);
	if (!outcome.ok) throw new Error(`log failed: ${outcome.error}`);
	return outcome.value.id;
}

describe('logging time', () => {
	it('lets a technician log on a ticket and on a task, on the default type', async () => {
		const scene = await createTimeScene();
		const general = await defaultTypeOf(scene.organisation.id);

		const onTicket = await logTime(scene.technician, { ticketId: scene.ticket.id }, entry, clock);
		const onTask = await logTime(scene.technician, { taskId: scene.task.id }, entry, clock);
		expect(onTicket.ok && onTask.ok).toBe(true);

		const ticketTime = await listEntriesFor(scene.technician, { ticketId: scene.ticket.id });
		expect(ticketTime.totalMinutes).toBe(90);
		expect(ticketTime.entries[0]).toMatchObject({
			personName: 'Tom Technician',
			typeId: general.id,
			typeName: 'General',
			minutes: 90,
			workDate: '2026-10-24',
			note: 'Swapped the toner',
			canChange: true
		});
	});

	it('refuses an employee, and a key with no person to author as', async () => {
		const scene = await createTimeScene();
		const target = { ticketId: scene.ticket.id };

		expect(await logTime(scene.employee, target, entry, clock)).toEqual({
			ok: false,
			error: 'forbidden'
		});
		expect(await logTime({ ...scene.technician, personId: null }, target, entry, clock)).toEqual({
			ok: false,
			error: 'forbidden'
		});
	});

	it('refuses every write while tracking is off, and keeps what was logged', async () => {
		const scene = await createTimeScene();
		const id = await logged(scene);
		await setTimeTracking(scene.admin, false);

		const off = { ok: false, error: 'time_tracking_disabled' };
		expect(await logTime(scene.technician, { ticketId: scene.ticket.id }, entry, clock)).toEqual(
			off
		);
		expect(await editEntry(scene.technician, id, entry, clock)).toEqual(off);
		expect(await deleteEntry(scene.technician, id)).toEqual(off);
		expect(await listEntriesFor(scene.technician, { ticketId: scene.ticket.id })).toEqual({
			entries: [],
			totalMinutes: 0
		});

		await setTimeTracking(scene.admin, true);
		expect(
			(await listEntriesFor(scene.technician, { ticketId: scene.ticket.id })).entries
		).toHaveLength(1);
	});

	it('rejects minutes below one, a malformed date and a future date', async () => {
		const scene = await createTimeScene();
		const target = { ticketId: scene.ticket.id };
		const log = (patch: object) => logTime(scene.technician, target, { ...entry, ...patch }, clock);

		expect(await log({ minutes: 0 })).toEqual({ ok: false, error: 'invalid_minutes' });
		expect(await log({ minutes: 1.5 })).toEqual({ ok: false, error: 'invalid_minutes' });
		expect(await log({ minutes: 1441 })).toEqual({ ok: false, error: 'invalid_minutes' });
		expect(await log({ minutes: 1440, workDate: '2026-10-25' })).toMatchObject({ ok: true });
		expect(await log({ workDate: '2026-02-30' })).toEqual({ ok: false, error: 'invalid_date' });
		expect(await log({ workDate: 'yesterday' })).toEqual({ ok: false, error: 'invalid_date' });
		expect(await log({ workDate: '2026-10-26' })).toEqual({ ok: false, error: 'future_date' });
		expect(await log({ workDate: '2026-10-25' })).toMatchObject({ ok: true });
		expect(await log({ note: 'x'.repeat(2001) })).toEqual({ ok: false, error: 'note_too_long' });
	});

	it('accepts a closed ticket and a completed task', async () => {
		const scene = await createTimeScene();
		await getDb().update(tickets).set({ status: 'closed' }).where(eq(tickets.id, scene.ticket.id));
		await getDb()
			.update(tasks)
			.set({ stateId: scene.states.completed.id })
			.where(eq(tasks.id, scene.task.id));

		expect((await logTime(scene.technician, { ticketId: scene.ticket.id }, entry, clock)).ok).toBe(
			true
		);
		expect((await logTime(scene.technician, { taskId: scene.task.id }, entry, clock)).ok).toBe(
			true
		);
	});

	it('refuses a task of an archived project with project_archived, for log, edit and delete', async () => {
		const scene = await createTimeScene();
		const id = await logged(scene, scene.technician, { taskId: scene.task.id });
		await getDb()
			.update(projects)
			.set({ archivedAt: new Date() })
			.where(eq(projects.id, scene.project.id));

		const locked = { ok: false, error: 'project_archived' };
		expect(await logTime(scene.technician, { taskId: scene.task.id }, entry, clock)).toEqual(
			locked
		);
		expect(await editEntry(scene.technician, id, entry, clock)).toEqual(locked);
		expect(await deleteEntry(scene.technician, id)).toEqual(locked);
	});

	it('answers record_not_found for a record of another organisation or none', async () => {
		const scene = await createTimeScene();
		const missing = '0c1f6a0e-3f3a-4c5e-9d58-6f7a2f1b9a10';

		expect(await logTime(scene.technician, { ticketId: missing }, entry, clock)).toEqual({
			ok: false,
			error: 'record_not_found'
		});
		expect(await logTime(scene.technician, { taskId: missing }, entry, clock)).toEqual({
			ok: false,
			error: 'record_not_found'
		});
	});

	it('refuses an archived type and one that is not the organisation’s', async () => {
		const scene = await createTimeScene();
		const used = await createType(scene.admin, 'Used');
		if (!used.ok) throw new Error('type failed');
		const id = await logged(scene);
		await editEntry(scene.technician, id, { ...entry, typeId: used.value.id }, clock);
		await removeType(scene.admin, used.value.id);
		expect((await listOfferedTypes(scene.organisation.id)).map((t) => t.name)).toEqual(['General']);

		const refused = await logTime(
			scene.technician,
			{ ticketId: scene.ticket.id },
			{ ...entry, typeId: used.value.id },
			clock
		);
		expect(refused).toEqual({ ok: false, error: 'invalid_type' });
	});
});

describe('ownership', () => {
	it('lets a technician edit and delete their own entries', async () => {
		const scene = await createTimeScene();
		const id = await logged(scene);

		expect(await editEntry(scene.technician, id, { ...entry, minutes: 45 }, clock)).toEqual({
			ok: true,
			value: { id, revision: 2 }
		});
		expect(await deleteEntry(scene.technician, id)).toEqual({ ok: true, value: undefined });
		expect(await getDb().select().from(timeEntries)).toHaveLength(0);
	});

	it('refuses to edit or delete somebody else’s entry', async () => {
		const scene = await createTimeScene();
		const id = await logged(scene);

		expect(await editEntry(scene.colleague, id, { ...entry, minutes: 5 }, clock)).toEqual({
			ok: false,
			error: 'forbidden'
		});
		expect(await deleteEntry(scene.colleague, id)).toEqual({ ok: false, error: 'forbidden' });
		expect(await getDb().select().from(timeEntries)).toHaveLength(1);
	});

	it('lets an admin correct and remove anybody’s, naming both in the history', async () => {
		const scene = await createTimeScene();
		const id = await logged(scene);

		await editEntry(scene.admin, id, { ...entry, minutes: 60 }, clock);
		await deleteEntry(scene.admin, id);

		const history = await listActivity({
			organisationId: scene.organisation.id,
			target: { ticketId: scene.ticket.id }
		});
		const edited = history.find((item) => item.verb === 'time.edited');
		expect(edited).toMatchObject({
			actorPersonId: scene.admin.personId,
			payload: {
				authorPersonId: scene.technician.personId,
				authorName: 'Tom Technician',
				actorName: 'Ada Admin',
				changes: { minutes: { from: 90, to: 60 } }
			}
		});
		expect(history.find((item) => item.verb === 'time.removed')?.payload).toMatchObject({
			authorName: 'Tom Technician',
			actorName: 'Ada Admin'
		});
	});

	it('answers entry_not_found for an entry that does not exist', async () => {
		const scene = await createTimeScene();
		const missing = '0c1f6a0e-3f3a-4c5e-9d58-6f7a2f1b9a10';

		expect(await editEntry(scene.admin, missing, entry, clock)).toEqual({
			ok: false,
			error: 'entry_not_found'
		});
		expect(await deleteEntry(scene.admin, missing)).toEqual({
			ok: false,
			error: 'entry_not_found'
		});
	});
});

describe('edits and revisions', () => {
	it('bumps the revision only when something changed, and records before/after', async () => {
		const scene = await createTimeScene();
		const id = await logged(scene);

		expect(await editEntry(scene.technician, id, entry, clock)).toMatchObject({
			ok: true,
			value: { revision: 1 }
		});
		await editEntry(scene.technician, id, { ...entry, note: null, workDate: '2026-10-23' }, clock);

		const edited = (
			await listActivity({
				organisationId: scene.organisation.id,
				target: { ticketId: scene.ticket.id }
			})
		).filter((item) => item.verb === 'time.edited');
		expect(edited).toHaveLength(1);
		expect(edited[0].payload).toMatchObject({
			changes: {
				workDate: { from: '2026-10-24', to: '2026-10-23' },
				note: { from: 'Swapped the toner', to: null }
			}
		});
		expect(edited[0].payload).not.toHaveProperty('actorName');
	});

	it('answers stale_revision with the current revision', async () => {
		const scene = await createTimeScene();
		const id = await logged(scene);
		await editEntry(scene.technician, id, { ...entry, minutes: 30 }, clock);

		const stale = await editEntry(
			scene.technician,
			id,
			{ ...entry, minutes: 15, baseRevision: 1 },
			clock
		);
		expect(stale).toEqual({ ok: false, error: { kind: 'stale_revision', revision: 2 } });
		expect(
			await editEntry(scene.technician, id, { ...entry, minutes: 15, baseRevision: 2 }, clock)
		).toMatchObject({ ok: true, value: { revision: 3 } });
	});
});

describe('history and visibility', () => {
	it('writes time.logged on the record and hides time.* while tracking is off', async () => {
		const scene = await createTimeScene();
		await logged(scene);
		const read = () =>
			listActivity({
				organisationId: scene.organisation.id,
				target: { ticketId: scene.ticket.id }
			});

		expect((await read()).some((item) => item.verb === 'time.logged')).toBe(true);
		await setTimeTracking(scene.admin, false);
		expect((await read()).some((item) => item.verb === 'time.logged')).toBe(false);
	});

	it('keeps time.* out of the requester’s view of a ticket', async () => {
		const scene = await createTimeScene();
		await logged(scene);

		const requester = await ticketThread(scene.employee, scene.ticket.ticketTag);
		if (!requester.ok) throw new Error('requester cannot read their own ticket');
		expect(
			requester.value.some((item) => item.kind === 'event' && item.entry.verb.startsWith('time.'))
		).toBe(false);

		const staff = await ticketThread(scene.technician, scene.ticket.ticketTag);
		if (!staff.ok) throw new Error('staff cannot read the ticket');
		expect(
			staff.value.some((item) => item.kind === 'event' && item.entry.verb === 'time.logged')
		).toBe(true);
	});

	it('shows an employee no time data', async () => {
		const scene = await createTimeScene();
		await logged(scene);
		expect(await listEntriesFor(scene.employee, { ticketId: scene.ticket.id })).toEqual({
			entries: [],
			totalMinutes: 0
		});
	});

	it('flags what the viewer may change', async () => {
		const scene = await createTimeScene();
		await logged(scene);
		const target = { ticketId: scene.ticket.id };

		expect((await listEntriesFor(scene.colleague, target)).entries[0].canChange).toBe(false);
		expect((await listEntriesFor(scene.admin, target)).entries[0].canChange).toBe(true);
	});
});
