import { describe, expect, it } from 'vitest';
import { createOrganisation, createPerson, createViewer } from '../assets/testing/fixtures';
import { utcDayKey } from '../shared/sparkline';
import { createQueue, createTicket } from './testing/fixtures';
import { ticketOpeningsSparkline } from './sparkline';

/** Fixed, so the assertions describe the query rather than the wall clock. */
const NOW = new Date('2026-03-15T12:00:00.000Z');
const day = (offset: number) => new Date(NOW.getTime() + offset * 24 * 60 * 60 * 1000);

describe('ticketOpeningsSparkline', () => {
	it('returns a dense series: one point per day, ascending, zeros for quiet days', async () => {
		const acme = await createOrganisation('Acme', 'acme-desk-spark');
		const queue = await createQueue(acme.id);
		const viewer = await createViewer(acme.id, 'technician');
		const requester = await createPerson(acme.id, 'Grace Hopper');

		await createTicket(acme.id, queue.id, requester.id, { createdAt: day(-6) });
		await createTicket(acme.id, queue.id, requester.id, { createdAt: day(-6) });
		await createTicket(acme.id, queue.id, requester.id, { createdAt: day(0) });

		const series = await ticketOpeningsSparkline(viewer, 7, NOW);

		expect(series).toHaveLength(7);
		expect(series.map((point) => point.count)).toEqual([2, 0, 0, 0, 0, 0, 1]);
		expect(series.at(-1)?.date).toBe(utcDayKey(NOW));
	});

	it('excludes tickets older than the window', async () => {
		const acme = await createOrganisation('Acme', 'acme-desk-spark-window');
		const queue = await createQueue(acme.id);
		const viewer = await createViewer(acme.id, 'technician');
		const requester = await createPerson(acme.id, 'Grace Hopper');

		await createTicket(acme.id, queue.id, requester.id, { createdAt: day(-20) });
		await createTicket(acme.id, queue.id, requester.id, { createdAt: day(-2) });

		const series = await ticketOpeningsSparkline(viewer, 7, NOW);

		expect(series[0].count).toBe(0);
		expect(series.reduce((total, point) => total + point.count, 0)).toBe(1);
	});

	it('never leaks another organisation’s tickets', async () => {
		const acme = await createOrganisation('Acme', 'acme-desk-spark-tenant');
		const globex = await createOrganisation('Globex', 'globex-desk-spark-tenant');
		const acmeQueue = await createQueue(acme.id);
		const globexQueue = await createQueue(globex.id);
		const viewer = await createViewer(acme.id, 'technician');
		const acmeRequester = await createPerson(acme.id, 'Grace Hopper');
		const globexRequester = await createPerson(globex.id, 'Alan Turing');

		await createTicket(acme.id, acmeQueue.id, acmeRequester.id, { createdAt: day(-1) });
		await createTicket(globex.id, globexQueue.id, globexRequester.id, { createdAt: day(-1) });

		const series = await ticketOpeningsSparkline(viewer, 7, NOW);

		expect(series.reduce((total, point) => total + point.count, 0)).toBe(1);
	});

	it('narrows to the tickets an employee opened themselves', async () => {
		const acme = await createOrganisation('Acme', 'acme-desk-spark-scoped');
		const queue = await createQueue(acme.id);
		const employee = await createViewer(acme.id, 'employee');
		const other = await createPerson(acme.id, 'Alan Turing');

		await createTicket(acme.id, queue.id, employee.personId!, { createdAt: day(-1) });
		await createTicket(acme.id, queue.id, other.id, { createdAt: day(-1) });

		const series = await ticketOpeningsSparkline(employee, 7, NOW);

		// An employee's KPI counts their own requests, so the shape beneath it
		// has to count the same rows — not the whole queue's inflow.
		expect(series.reduce((total, point) => total + point.count, 0)).toBe(1);
	});

	it('counts openings, not the running balance of what is still open', async () => {
		const acme = await createOrganisation('Acme', 'acme-desk-spark-closed');
		const queue = await createQueue(acme.id);
		const viewer = await createViewer(acme.id, 'technician');
		const requester = await createPerson(acme.id, 'Grace Hopper');

		await createTicket(acme.id, queue.id, requester.id, {
			createdAt: day(-3),
			status: 'closed'
		});

		const series = await ticketOpeningsSparkline(viewer, 7, NOW);

		// A ticket opened on Thursday and closed on Friday still happened on
		// Thursday. Filtering by current status would rewrite the past every
		// time somebody resolved something.
		expect(series.reduce((total, point) => total + point.count, 0)).toBe(1);
	});

	it('returns a full series of zeros on a fresh install', async () => {
		const acme = await createOrganisation('Acme', 'acme-desk-spark-empty');
		const viewer = await createViewer(acme.id, 'technician');

		const series = await ticketOpeningsSparkline(viewer, 7, NOW);

		expect(series).toHaveLength(7);
		expect(series.every((point) => point.count === 0)).toBe(true);
	});
});
