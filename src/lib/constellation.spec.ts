import { describe, expect, it } from 'vitest';
import {
	layoutConstellation,
	MAX_CONSTELLATION_NODES,
	type ConstellationInput
} from './constellation.js';

function ticket(n: number): ConstellationInput['items'][number] {
	const tag = `TCK-${String(n).padStart(4, '0')}`;
	return { kind: 'ticket', tag, href: `/service-desk/${tag}`, status: 'new' };
}

function asset(n: number): ConstellationInput['items'][number] {
	const tag = `AST-${String(n).padStart(4, '0')}`;
	return { kind: 'asset', tag, href: `/assets/${tag}`, status: 'in_use' };
}

describe('layoutConstellation', () => {
	it('draws nothing when there are no linked records', () => {
		expect(
			layoutConstellation({ centre: { kind: 'asset', tag: 'AST-0001' }, items: [] })
		).toBeNull();
	});

	it('puts the current record at the centre and one edge per linked record', () => {
		const layout = layoutConstellation({
			centre: { kind: 'asset', tag: 'AST-0001' },
			items: [ticket(1), ticket(2), ticket(3)]
		})!;

		expect(layout.centre).toMatchObject({
			x: layout.size / 2,
			y: layout.size / 2,
			tag: 'AST-0001'
		});
		expect(layout.nodes).toHaveLength(3);
		expect(layout.edges).toHaveLength(3);
	});

	it('spreads nodes on one ring, evenly, starting from the top', () => {
		const layout = layoutConstellation({
			centre: { kind: 'asset', tag: 'AST-0001' },
			items: [ticket(1), ticket(2), ticket(3), ticket(4)]
		})!;
		const cx = layout.centre.x;
		const cy = layout.centre.y;
		const radii = layout.nodes.map((node) => Math.hypot(node.x - cx, node.y - cy));

		for (const radius of radii) expect(radius).toBeCloseTo(layout.radius, 5);
		// first node straight above the centre, second a quarter turn clockwise
		expect(layout.nodes[0]!.x).toBeCloseTo(cx, 5);
		expect(layout.nodes[0]!.y).toBeCloseTo(cy - layout.radius, 5);
		expect(layout.nodes[1]!.x).toBeCloseTo(cx + layout.radius, 5);
		expect(layout.nodes[1]!.y).toBeCloseTo(cy, 5);
	});

	it('keeps every node individually navigable up to the cap', () => {
		const items = Array.from({ length: MAX_CONSTELLATION_NODES }, (_, i) => ticket(i + 1));
		const layout = layoutConstellation({ centre: { kind: 'asset', tag: 'AST-0001' }, items })!;

		expect(layout.nodes).toHaveLength(MAX_CONSTELLATION_NODES);
		expect(layout.nodes.every((node) => node.type === 'record')).toBe(true);
	});

	it('collapses more than the cap into one count node per kind', () => {
		const items = [
			...Array.from({ length: 7 }, (_, i) => ticket(i + 1)),
			...Array.from({ length: 4 }, (_, i) => asset(i + 1))
		];
		const layout = layoutConstellation({ centre: { kind: 'ticket', tag: 'TCK-9999' }, items })!;

		expect(
			layout.nodes.map((node) => ({
				type: node.type,
				kind: node.kind,
				count: node.type === 'group' ? node.count : 1
			}))
		).toEqual([
			{ type: 'group', kind: 'asset', count: 4 },
			{ type: 'group', kind: 'ticket', count: 7 }
		]);
		expect(layout.edges).toHaveLength(2);
	});

	it('carries each record’s tag, destination and status through to its node', () => {
		const layout = layoutConstellation({
			centre: { kind: 'asset', tag: 'AST-0001' },
			items: [{ ...ticket(12), status: 'in_progress' }]
		})!;

		expect(layout.nodes[0]).toMatchObject({
			type: 'record',
			tag: 'TCK-0012',
			href: '/service-desk/TCK-0012',
			status: 'in_progress'
		});
	});

	it('is stable: the same input lays out identically', () => {
		const input = {
			centre: { kind: 'asset' as const, tag: 'AST-0001' },
			items: [ticket(1), ticket(2)]
		};
		expect(layoutConstellation(input)).toEqual(layoutConstellation(input));
	});
});
