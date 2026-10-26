import { describe, expect, it } from 'vitest';
import { createProjectRow, createTaskRow } from '../projects/testing/fixtures';
import {
	createType,
	getEntry,
	logTime,
	reportAll,
	reportEntries,
	setTimeTracking,
	timeEntriesCsv
} from './index';
import { createTimeScene } from './testing/fixtures';

const clock = { now: new Date('2026-10-25T12:00:00Z') };

async function sceneWithEntries() {
	const scene = await createTimeScene();
	const meetings = await createType(scene.admin, 'Meetings');
	if (!meetings.ok) throw new Error('type failed');
	const other = await createProjectRow(scene.organisation.id, { name: 'Other project' });
	const otherTask = await createTaskRow(
		scene.organisation.id,
		other.id,
		scene.states.unstarted.id,
		{
			title: '=HYPERLINK("http://evil")'
		}
	);

	const log = (by: typeof scene.technician, target: object, patch: object) =>
		logTime(by, target as never, { minutes: 60, workDate: '2026-10-20', ...patch }, clock);
	await log(scene.technician, { ticketId: scene.ticket.id }, { minutes: 30 });
	await log(scene.technician, { taskId: scene.task.id }, { workDate: '2026-10-22' });
	await log(
		scene.colleague,
		{ taskId: otherTask.id },
		{
			workDate: '2026-10-24',
			typeId: meetings.value.id,
			note: '-1+1'
		}
	);
	return { ...scene, meetings: meetings.value, other, otherTask };
}

describe('the organisation’s time report', () => {
	it('is refused to anybody without time.log, and while tracking is off', async () => {
		const scene = await sceneWithEntries();

		expect(await reportEntries(scene.employee, {})).toEqual({ ok: false, error: 'forbidden' });
		expect(await reportAll(scene.employee, {})).toEqual({ ok: false, error: 'forbidden' });

		await setTimeTracking(scene.admin, false);
		expect(await reportEntries(scene.admin, {})).toEqual({
			ok: false,
			error: 'time_tracking_disabled'
		});
		expect(await reportEntries(scene.technician, {})).toEqual({
			ok: false,
			error: 'time_tracking_disabled'
		});
	});

	it('shows a technician only their own entries, whatever person they ask for', async () => {
		const scene = await sceneWithEntries();
		const people = async (filters: object) => {
			const result = await reportEntries(scene.technician, filters);
			if (!result.ok) throw new Error('report refused');
			return {
				people: [...new Set(result.value.rows.map((row) => row.personId))],
				total: result.value.total,
				minutes: result.value.totalMinutes
			};
		};

		const own = { people: [scene.technician.personId], total: 2, minutes: 90 };
		expect(await people({})).toEqual(own);
		expect(await people({ personId: scene.colleague.personId })).toEqual(own);

		const all = await reportAll(scene.technician, { personId: scene.colleague.personId! });
		if (!all.ok) throw new Error('export refused');
		expect(all.value.map((row) => row.personId)).toEqual([
			scene.technician.personId,
			scene.technician.personId
		]);
	});

	it('shows an admin everybody, and lets them narrow it to one person', async () => {
		const scene = await sceneWithEntries();

		const everybody = await reportEntries(scene.admin, {});
		const colleague = await reportEntries(scene.admin, { personId: scene.colleague.personId! });
		if (!everybody.ok || !colleague.ok) throw new Error('report refused');
		expect(everybody.value.total).toBe(3);
		expect(colleague.value.rows.map((row) => row.personId)).toEqual([scene.colleague.personId]);
	});

	it('lists tickets and tasks together, newest work first, with the filtered total', async () => {
		const scene = await sceneWithEntries();

		const result = await reportEntries(scene.admin, {});
		if (!result.ok) throw new Error('report refused');
		expect(result.value.total).toBe(3);
		expect(result.value.totalMinutes).toBe(150);
		expect(result.value.rows.map((row) => row.workDate)).toEqual([
			'2026-10-24',
			'2026-10-22',
			'2026-10-20'
		]);
		expect(result.value.rows.map((row) => row.record.tag)).toEqual([
			scene.otherTask.taskTag,
			scene.task.taskTag,
			scene.ticket.ticketTag
		]);
		expect(result.value.rows[2].project).toBeNull();
		expect(result.value.rows[1].project).toEqual({
			tag: scene.project.projectTag,
			name: 'Office move'
		});
	});

	it('filters by date range, person, type, project and record, and totals the filtered list', async () => {
		const scene = await sceneWithEntries();
		const filtered = async (filters: object) => {
			const result = await reportEntries(scene.admin, filters);
			if (!result.ok) throw new Error('report refused');
			return { count: result.value.total, minutes: result.value.totalMinutes };
		};

		expect(await filtered({ from: '2026-10-21', to: '2026-10-23' })).toEqual({
			count: 1,
			minutes: 60
		});
		expect(await filtered({ personId: scene.colleague.personId })).toEqual({
			count: 1,
			minutes: 60
		});
		expect(await filtered({ typeId: scene.meetings.id })).toEqual({ count: 1, minutes: 60 });
		expect(await filtered({ projectTag: scene.project.projectTag })).toEqual({
			count: 1,
			minutes: 60
		});
		expect(await filtered({ recordTag: scene.ticket.ticketTag })).toEqual({
			count: 1,
			minutes: 30
		});
		expect(await filtered({ recordTag: scene.task.taskTag })).toEqual({ count: 1, minutes: 60 });
		expect(await filtered({ recordTag: 'NOPE-1' })).toEqual({ count: 0, minutes: 0 });
	});

	it('filters by kind of record, and splits the filtered total into tickets and tasks', async () => {
		const scene = await sceneWithEntries();
		const totals = async (filters: object) => {
			const result = await reportEntries(scene.admin, filters);
			if (!result.ok) throw new Error('report refused');
			const { total, totalMinutes, ticketMinutes, taskMinutes } = result.value;
			return {
				kinds: [...new Set(result.value.rows.map((row) => row.record.kind))],
				total,
				totalMinutes,
				ticketMinutes,
				taskMinutes
			};
		};

		expect(await totals({})).toEqual({
			kinds: ['task', 'ticket'],
			total: 3,
			totalMinutes: 150,
			ticketMinutes: 30,
			taskMinutes: 120
		});
		expect(await totals({ kind: 'ticket' })).toEqual({
			kinds: ['ticket'],
			total: 1,
			totalMinutes: 30,
			ticketMinutes: 30,
			taskMinutes: 0
		});
		expect(await totals({ kind: 'task' })).toEqual({
			kinds: ['task'],
			total: 2,
			totalMinutes: 120,
			ticketMinutes: 0,
			taskMinutes: 120
		});

		const tasks = await reportAll(scene.admin, { kind: 'task' });
		if (!tasks.ok) throw new Error('export refused');
		expect(tasks.value.map((row) => row.record.tag)).toEqual([
			scene.otherTask.taskTag,
			scene.task.taskTag
		]);
	});

	it('splits a technician’s own total the same way', async () => {
		const scene = await sceneWithEntries();
		const result = await reportEntries(scene.technician, {});
		if (!result.ok) throw new Error('report refused');

		expect(result.value).toMatchObject({ totalMinutes: 90, ticketMinutes: 30, taskMinutes: 60 });
	});

	it('pages the list but totals all of it', async () => {
		const scene = await sceneWithEntries();
		const result = await reportEntries(scene.admin, {}, { page: 2, perPage: 2 });
		if (!result.ok) throw new Error('report refused');

		expect(result.value.rows).toHaveLength(1);
		expect(result.value).toMatchObject({ page: 2, pageCount: 2, total: 3, totalMinutes: 150 });
	});

	it('exports the filtered list as CSV with formula-leading cells escaped', async () => {
		const scene = await sceneWithEntries();
		const all = await reportAll(scene.admin, {});
		if (!all.ok) throw new Error('report refused');

		const csv = timeEntriesCsv(all.value);
		expect(csv.startsWith('\uFEFF')).toBe(true);
		const [header, ...lines] = csv.slice(1).trimEnd().split('\r\n');
		expect(header).toBe(
			'work_date,person,type,minutes,hours,record_code,record_title,project_code,project_name,note'
		);
		expect(lines).toHaveLength(3);
		expect(lines[0]).toContain(`"'=HYPERLINK(""http://evil"")"`);
		expect(lines[0]).toContain(",'-1+1");
		expect(lines[0]).toContain(',60,1.00,');
	});

	it('reads one entry for its author and for time.manage, and for nobody else', async () => {
		const scene = await sceneWithEntries();
		const all = await reportAll(scene.admin, {});
		if (!all.ok) throw new Error('report refused');
		const mine = all.value.find((row) => row.personId === scene.technician.personId)!;

		expect((await getEntry(scene.technician, mine.id))?.id).toBe(mine.id);
		expect((await getEntry(scene.admin, mine.id))?.id).toBe(mine.id);
		expect(await getEntry(scene.colleague, mine.id)).toBeNull();
		expect(await getEntry(scene.employee, mine.id)).toBeNull();
	});
});
