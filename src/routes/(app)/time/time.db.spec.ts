import { describe, expect, it } from 'vitest';
import { logTime, setTimeTracking } from '#lib/server/time/index.js';
import { createTimeScene } from '#lib/server/time/testing/fixtures.js';
import { load as loadLayout } from '../+layout.server';
import { GET } from './export.csv/+server';
import { load } from './+page.server';

const clock = { now: new Date('2026-10-25T12:00:00Z') };

async function scene() {
	const s = await createTimeScene();
	await logTime(
		s.technician,
		{ ticketId: s.ticket.id },
		{ minutes: 75, workDate: '2026-10-24', note: '=SUM(A1)' },
		clock
	);
	return s;
}

/** The scene, plus a task entry of the technician's and one of a colleague's. */
async function busyScene() {
	const s = await scene();
	await logTime(
		s.technician,
		{ taskId: s.task.id },
		{ minutes: 30, workDate: '2026-10-23' },
		clock
	);
	await logTime(
		s.colleague,
		{ taskId: s.task.id },
		{ minutes: 50, workDate: '2026-10-22', note: 'colleague-only' },
		clock
	);
	return s;
}

interface Data {
	scope: 'all' | 'own';
	report: {
		total: number;
		totalMinutes: number;
		ticketMinutes: number;
		taskMinutes: number;
		rows: { personId: string; record: { kind: string } }[];
	};
	filters: { personId?: string; kind?: string };
	people: unknown[];
}

const event = (user: unknown, search = '') => {
	const url = new URL(`http://localhost/time${search}`);
	return { locals: { user }, url } as never;
};

describe('/time', () => {
	it('lists the filtered entries with their total for an admin', async () => {
		const s = await scene();
		const data = (await load(event(s.admin, '?from=2026-10-01'))) as {
			report: { total: number; totalMinutes: number };
		};
		expect(data.report).toMatchObject({ total: 1, totalMinutes: 75 });

		const none = (await load(event(s.admin, '?from=2026-10-25'))) as {
			report: { total: number };
		};
		expect(none.report.total).toBe(0);
	});

	it('shows a technician only their own time, without the person filter, whatever ?person= says', async () => {
		const s = await busyScene();

		for (const search of ['', `?person=${s.colleague.personId}`]) {
			const data = (await load(event(s.technician, search))) as Data;
			expect(data.scope).toBe('own');
			expect(data.people).toEqual([]);
			expect(data.filters.personId).toBeUndefined();
			expect(data.report).toMatchObject({
				total: 2,
				totalMinutes: 105,
				ticketMinutes: 75,
				taskMinutes: 30
			});
			expect(new Set(data.report.rows.map((row) => row.personId))).toEqual(
				new Set([s.technician.personId])
			);
		}
	});

	it('keeps everybody and the person filter for an admin', async () => {
		const s = await busyScene();

		const data = (await load(event(s.admin))) as Data;
		expect(data.scope).toBe('all');
		expect(data.people.length).toBeGreaterThan(0);
		expect(data.report).toMatchObject({ total: 3, totalMinutes: 155 });

		const colleague = (await load(event(s.admin, `?person=${s.colleague.personId}`))) as Data;
		expect(colleague.report).toMatchObject({ total: 1, totalMinutes: 50 });
	});

	it('filters by ?kind=, and the subtotals add up to the filtered total', async () => {
		const s = await busyScene();

		const tickets = (await load(event(s.admin, '?kind=ticket'))) as Data;
		const tasks = (await load(event(s.admin, '?kind=task'))) as Data;
		expect(tickets.filters.kind).toBe('ticket');
		expect(tickets.report.rows.map((row) => row.record.kind)).toEqual(['ticket']);
		expect(tickets.report).toMatchObject({ totalMinutes: 75, ticketMinutes: 75, taskMinutes: 0 });
		expect(tasks.report.rows.map((row) => row.record.kind)).toEqual(['task', 'task']);
		expect(tasks.report).toMatchObject({ totalMinutes: 80, ticketMinutes: 0, taskMinutes: 80 });

		const ignored = (await load(event(s.admin, '?kind=asset'))) as Data;
		expect(ignored.filters.kind).toBeUndefined();
		expect(ignored.report.total).toBe(3);
	});

	it('is a 404 for an employee and while tracking is off', async () => {
		const s = await scene();

		await expect(load(event(s.employee))).rejects.toMatchObject({ status: 404 });
		await setTimeTracking(s.admin, false);
		await expect(load(event(s.admin))).rejects.toMatchObject({ status: 404 });
		await expect(load(event(s.technician))).rejects.toMatchObject({ status: 404 });
	});
});

describe('the /time link in the app shell', () => {
	it('is offered to time.log and time.manage while tracking is on, and to nobody once it is off', async () => {
		const s = await scene();
		const offered = async (user: unknown) =>
			((await loadLayout(event(user))) as { timeEnabled: boolean }).timeEnabled;

		expect(await offered(s.technician)).toBe(true);
		expect(await offered(s.admin)).toBe(true);
		expect(await offered(s.employee)).toBe(false);

		await setTimeTracking(s.admin, false);
		expect(await offered(s.technician)).toBe(false);
		expect(await offered(s.admin)).toBe(false);
	});
});

describe('/time/export.csv', () => {
	it('exports the filtered list as UTF-8 CSV with the formula escaped', async () => {
		const s = await scene();
		const response = await GET(event(s.admin, '/export.csv?record=' + s.ticket.ticketTag));

		expect(response.headers.get('content-type')).toBe('text/csv; charset=utf-8');
		expect(response.headers.get('content-disposition')).toContain('attachment');
		// `Response.text()` strips a leading BOM, so the bytes are what proves it is sent.
		const bytes = new Uint8Array(await response.clone().arrayBuffer());
		expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
		const [header, row] = (await response.text()).split('\r\n');
		expect(header.startsWith('work_date,person,type,minutes,hours')).toBe(true);
		expect(row).toContain(',75,1.25,');
		expect(row.endsWith(",'=SUM(A1)")).toBe(true);
	});

	it('uses the semicolon separator with ?sep=semicolon', async () => {
		const s = await scene();
		const response = await GET(
			event(s.admin, '/export.csv?sep=semicolon&record=' + s.ticket.ticketTag)
		);

		const [header, row] = (await response.text()).split('\r\n');
		expect(header.startsWith('work_date;person;type;minutes;hours')).toBe(true);
		expect(row).toContain(';75;1.25;');
	});

	it('holds only a technician’s own rows, whatever ?person= says, and follows ?kind=', async () => {
		const s = await busyScene();
		const rows = async (search: string) =>
			(await (await GET(event(s.technician, search))).text()).trimEnd().split('\r\n').slice(1);

		const own = await rows(`/export.csv?person=${s.colleague.personId}`);
		expect(own).toHaveLength(2);
		expect(own.join('\n')).not.toContain('colleague-only');
		expect(own.every((row) => row.includes(s.technician.name))).toBe(true);

		const tasks = await rows('/export.csv?kind=task');
		expect(tasks).toHaveLength(1);
		expect(tasks[0]).toContain(s.task.taskTag);
	});

	it('is a 404 for an employee and while tracking is off', async () => {
		const s = await scene();

		await expect(GET(event(s.employee))).rejects.toMatchObject({ status: 404 });
		await setTimeTracking(s.admin, false);
		await expect(GET(event(s.admin))).rejects.toMatchObject({ status: 404 });
		await expect(GET(event(s.technician))).rejects.toMatchObject({ status: 404 });
	});
});
