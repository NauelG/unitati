import { render } from 'svelte/server';
import { describe, expect, it } from 'vitest';
import type { SparklinePoint } from '#lib/domain/sparkline.js';
import { statusColour } from './status';
import DonutChart, { type DonutSlice } from './DonutChart.svelte';
import Sparkline from './Sparkline.svelte';

/**
 * The hard rule of #90, as a test rather than a review note: **every chart
 * ships with an empty state or it does not ship.**
 *
 * It exists because of a specific observed failure, recorded in the issue: a
 * benchmark product hands its chart library an empty series, and the library
 * obligingly invents a −1.0→1.0 axis and plots a single dot. That is a picture
 * of nothing that reads as a measurement, and it is the default behaviour of
 * most charting libraries — which means "we remembered the empty state" is not
 * a property anyone can keep true by intending to.
 *
 * These render server-side, through `svelte/server`, so they assert the markup
 * a browser receives before any JavaScript runs. For `DonutChart` that is the
 * whole component. For `Sparkline` it is deliberately only the empty branch:
 * the chart half is client-only (`layerchart` has to measure a fluid width),
 * and the empty state being the server-rendered half is exactly the right way
 * round — a fresh install is when it shows.
 */

const series = (counts: number[]): SparklinePoint[] =>
	counts.map((count, index) => ({
		date: `2026-03-${String(index + 1).padStart(2, '0')}`,
		count
	}));

const assetSlices = (counts: Record<string, number>): DonutSlice[] =>
	Object.entries(counts).map(([state, count]) => ({
		key: state,
		label: state,
		count,
		colour: statusColour(state as 'in_use')
	}));

describe('Sparkline empty state', () => {
	it('renders the empty state, server-side, for an all-zero series', () => {
		const { body } = render(Sparkline, {
			props: { points: series([0, 0, 0, 0, 0, 0, 0]), label: 'Altas' }
		});

		expect(body).toContain('Sin datos todavía');
	});

	it('draws no axis, no tick and no path when there is no data', () => {
		const { body } = render(Sparkline, {
			props: { points: series([0, 0, 0]), label: 'Altas' }
		});

		// The specific failure being guarded: an invented axis with one dot on it.
		expect(body).not.toContain('<path');
		expect(body).not.toContain('tick');
	});

	it('names itself for a screen reader, since a path cannot be read aloud', () => {
		const { body } = render(Sparkline, {
			props: { points: series([0, 0, 0]), label: 'Altas' }
		});

		expect(body).toContain('role="img"');
		expect(body).toContain('aria-label="Altas: Sin datos todavía"');
	});

	it('does not claim to be empty once a single day has a count', () => {
		const { body } = render(Sparkline, {
			props: { points: series([0, 0, 1]), label: 'Altas' }
		});

		expect(body).not.toContain('Sin datos todavía');
	});
});

describe('DonutChart empty state', () => {
	it('renders a ring on surface-2 with a centred em-dash, not a full slice', () => {
		const { body } = render(DonutChart, {
			props: {
				slices: assetSlices({ in_use: 0, in_repair: 0, in_stock: 0, retired: 0 }),
				label: 'Activos por estado'
			}
		});

		expect(body).toContain('var(--surface-2)');
		expect(body).toContain('—');
		// The failure mode this replaces: one 360° arc in the first palette
		// colour, which reads as "100% in service" on an empty inventory.
		expect(body).not.toContain(statusColour('in_use'));
	});

	it('announces itself as empty rather than as a distribution', () => {
		const { body } = render(DonutChart, {
			props: { slices: assetSlices({ in_use: 0 }), label: 'Activos por estado' }
		});

		expect(body).toContain('aria-label="Activos por estado: Sin datos todavía"');
	});
});

describe('DonutChart with data', () => {
	it('renders one arc per non-zero slice, server-side', () => {
		const { body } = render(DonutChart, {
			props: {
				slices: assetSlices({ in_use: 3, in_repair: 1, in_stock: 0, retired: 0 }),
				label: 'Activos por estado'
			}
		});

		// Fully server-rendered, unlike the sparkline: a ring's size is intrinsic,
		// so there is no container to measure and nothing snaps on hydration.
		const arcs = body.match(/<path/g) ?? [];
		expect(arcs).toHaveLength(2);
	});

	it('paints each slice the colour StatusBadge gives that same state', () => {
		const { body } = render(DonutChart, {
			props: {
				slices: assetSlices({ in_use: 3, in_repair: 1 }),
				label: 'Activos por estado'
			}
		});

		// The issue's acceptance criterion, asserted through the shared table in
		// `status.ts` rather than against hardcoded hexes — so this stays true if
		// the design system repaints a tone.
		expect(body).toContain(statusColour('in_use'));
		expect(body).toContain(statusColour('in_repair'));
	});

	it('prints the total in the hole', () => {
		const { body } = render(DonutChart, {
			props: {
				slices: assetSlices({ in_use: 3, in_repair: 1, in_stock: 2, retired: 0 }),
				label: 'Activos por estado'
			}
		});

		expect(body).toContain('>6<');
	});

	it('omits zero-count slices, so four empty states are not four padding slivers', () => {
		const { body } = render(DonutChart, {
			props: {
				slices: assetSlices({ in_use: 4, in_repair: 0, in_stock: 0, retired: 0 }),
				label: 'Activos por estado'
			}
		});

		expect(body.match(/<path/g) ?? []).toHaveLength(1);
	});
});
