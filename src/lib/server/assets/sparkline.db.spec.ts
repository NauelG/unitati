import { describe, expect, it } from 'vitest';
import { utcDayKey } from '../shared/sparkline';
import {
	createAsset,
	createCatalogue,
	createOrganisation,
	createPerson,
	createViewer
} from './testing/fixtures';
import { assetRegistrationsSparkline } from './sparkline';

/**
 * A fixed "now" is passed into every call, so these assertions are about the
 * query and not about what time the suite happened to run. Without it a spec
 * written at 23:59:59 fails at 00:00:01 for no reason anybody could reproduce.
 */
const NOW = new Date('2026-03-15T12:00:00.000Z');
const day = (offset: number) =>
	new Date(NOW.getTime() + offset * 24 * 60 * 60 * 1000).toISOString();

describe('assetRegistrationsSparkline', () => {
	it('returns a dense series: one point per day, ascending, zeros for quiet days', async () => {
		const acme = await createOrganisation('Acme', 'acme-spark-dense');
		const catalogue = await createCatalogue(acme.id);
		const viewer = await createViewer(acme.id, 'technician');

		await createAsset(acme.id, catalogue.modelId, { createdAt: new Date(day(-6)) });
		await createAsset(acme.id, catalogue.modelId, { createdAt: new Date(day(0)) });
		await createAsset(acme.id, catalogue.modelId, { createdAt: new Date(day(0)) });

		const series = await assetRegistrationsSparkline(viewer, 7, NOW);

		expect(series).toHaveLength(7);
		expect(series.map((point) => point.count)).toEqual([1, 0, 0, 0, 0, 0, 2]);
		expect(series.at(-1)?.date).toBe(utcDayKey(NOW));
	});

	it('excludes rows older than the window instead of piling them onto day one', async () => {
		const acme = await createOrganisation('Acme', 'acme-spark-window');
		const catalogue = await createCatalogue(acme.id);
		const viewer = await createViewer(acme.id, 'technician');

		await createAsset(acme.id, catalogue.modelId, { createdAt: new Date(day(-40)) });
		await createAsset(acme.id, catalogue.modelId, { createdAt: new Date(day(-3)) });

		const series = await assetRegistrationsSparkline(viewer, 7, NOW);

		// A cutoff that clamped rather than filtered would report 1 on the first
		// bucket, turning two-month-old history into this week's intake.
		expect(series[0].count).toBe(0);
		expect(series.reduce((total, point) => total + point.count, 0)).toBe(1);
	});

	it('never leaks another organisation’s registrations', async () => {
		const acme = await createOrganisation('Acme', 'acme-spark-tenant');
		const globex = await createOrganisation('Globex', 'globex-spark-tenant');
		const acmeCatalogue = await createCatalogue(acme.id);
		const globexCatalogue = await createCatalogue(globex.id);
		const viewer = await createViewer(acme.id, 'technician');

		await createAsset(acme.id, acmeCatalogue.modelId, { createdAt: new Date(day(-1)) });
		await createAsset(globex.id, globexCatalogue.modelId, { createdAt: new Date(day(-1)) });
		await createAsset(globex.id, globexCatalogue.modelId, { createdAt: new Date(day(-1)) });

		const series = await assetRegistrationsSparkline(viewer, 7, NOW);

		expect(series.reduce((total, point) => total + point.count, 0)).toBe(1);
	});

	it('narrows to the viewer’s own and shared rows, agreeing with the list they see', async () => {
		const acme = await createOrganisation('Acme', 'acme-spark-scoped');
		const catalogue = await createCatalogue(acme.id);
		const employee = await createViewer(acme.id, 'employee');
		const other = await createPerson(acme.id, 'Alan Turing');

		await createAsset(acme.id, catalogue.modelId, {
			custodianPersonId: employee.personId,
			createdAt: new Date(day(-2))
		});
		await createAsset(acme.id, catalogue.modelId, {
			shared: true,
			createdAt: new Date(day(-2))
		});
		// Somebody else's, not shared: invisible to this employee in the list, so
		// it must be invisible in the shape of the list too.
		await createAsset(acme.id, catalogue.modelId, {
			custodianPersonId: other.id,
			createdAt: new Date(day(-2))
		});

		const series = await assetRegistrationsSparkline(employee, 7, NOW);

		expect(series.reduce((total, point) => total + point.count, 0)).toBe(2);
	});

	it('returns a full series of zeros on a fresh install, not an empty array', async () => {
		const acme = await createOrganisation('Acme', 'acme-spark-empty');
		const viewer = await createViewer(acme.id, 'technician');

		const series = await assetRegistrationsSparkline(viewer, 30, NOW);

		// The component decides to draw its empty state from the counts, so the
		// series still has to have its shape. Returning `[]` here would make
		// "no assets yet" and "no window requested" the same value.
		expect(series).toHaveLength(30);
		expect(series.every((point) => point.count === 0)).toBe(true);
	});

	it('clamps an unreasonable window rather than building 3,650 buckets', async () => {
		const acme = await createOrganisation('Acme', 'acme-spark-clamp');
		const viewer = await createViewer(acme.id, 'technician');

		await expect(assetRegistrationsSparkline(viewer, 10_000, NOW)).resolves.toHaveLength(90);
	});
});
