import { describe, expect, it } from 'vitest';
import { logTime, setTimeTracking } from '#lib/server/time/index.js';
import { createTimeScene } from '#lib/server/time/testing/fixtures.js';
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

	it('is a 404 for a technician, an employee and while tracking is off', async () => {
		const s = await scene();

		await expect(load(event(s.technician))).rejects.toMatchObject({ status: 404 });
		await expect(load(event(s.employee))).rejects.toMatchObject({ status: 404 });
		await setTimeTracking(s.admin, false);
		await expect(load(event(s.admin))).rejects.toMatchObject({ status: 404 });
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

	it('is a 404 without time.manage and while tracking is off', async () => {
		const s = await scene();

		await expect(GET(event(s.technician))).rejects.toMatchObject({ status: 404 });
		await setTimeTracking(s.admin, false);
		await expect(GET(event(s.admin))).rejects.toMatchObject({ status: 404 });
	});
});
