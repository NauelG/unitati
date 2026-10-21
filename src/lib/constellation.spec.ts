import { describe, expect, it } from 'vitest';
import type { RelatedGroup } from '#lib/server/links/index.js';
import {
	constellationItems,
	edgeRelation,
	layoutConstellation,
	MAX_CONSTELLATION_NODES,
	type ConstellationInput
} from './constellation.js';

function ticket(n: number): Extract<ConstellationInput['items'][number], { kind: 'ticket' }> {
	const tag = `TCK-${String(n).padStart(4, '0')}`;
	return { kind: 'ticket', tag, href: `/service-desk/${tag}`, status: 'new' };
}

function asset(n: number): Extract<ConstellationInput['items'][number], { kind: 'asset' }> {
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

const linkedAt = new Date('2026-01-01T10:00:00Z');

describe('task and project nodes', () => {
	const task = {
		kind: 'task' as const,
		tag: 'TSK-0001',
		href: '/tasks/TSK-0001',
		status: 'started' as const,
		statusName: 'En revisión'
	};
	const project = {
		kind: 'project' as const,
		tag: 'PRJ-0001',
		href: '/projects/PRJ-0001',
		status: 'archived' as const
	};

	it('lays them out like any other record, keeping their own status vocabulary', () => {
		const layout = layoutConstellation({
			centre: { kind: 'ticket', tag: 'TCK-0001' },
			items: [task, project]
		})!;

		expect(layout.nodes[0]).toMatchObject({
			kind: 'task',
			status: 'started',
			statusName: 'En revisión'
		});
		expect(layout.nodes[1]).toMatchObject({ kind: 'project', status: 'archived' });
	});

	it('names an edge from the ticket outwards, from either side', () => {
		expect(edgeRelation('ticket', 'task')).toBe('resolved_in');
		expect(edgeRelation('task', 'ticket')).toBe('resolved_in');
		expect(edgeRelation('ticket', 'project')).toBe('handled_in');
		expect(edgeRelation('project', 'ticket')).toBe('handled_in');
		expect(edgeRelation('ticket', 'asset')).toBeNull();
		expect(edgeRelation('project', 'task')).toBeNull();
	});

	it('puts the relation on the edges of a ticket centre', () => {
		const layout = layoutConstellation({
			centre: { kind: 'ticket', tag: 'TCK-0001' },
			items: [asset(1), task, project]
		})!;

		expect(layout.edges.map((edge) => edge.relation)).toEqual([null, 'resolved_in', 'handled_in']);
		expect(layout.labelEdges).toBe(true);
	});

	it('stops labelling edges when the ring is too crowded for text', () => {
		const layout = layoutConstellation({
			centre: { kind: 'ticket', tag: 'TCK-0001' },
			items: [task, task, task, task, task].map((item, i) => ({ ...item, tag: `TSK-${i}` }))
		})!;

		expect(layout.labelEdges).toBe(false);
	});

	it('collapses a crowded ring per kind, tasks and projects included', () => {
		const items = [
			...Array.from({ length: 5 }, (_, i) => ({ ...task, tag: `TSK-${i}` })),
			...Array.from({ length: 4 }, (_, i) => ({ ...project, tag: `PRJ-${i}` }))
		];
		const layout = layoutConstellation({ centre: { kind: 'ticket', tag: 'TCK-0001' }, items })!;

		expect(layout.nodes.map((node) => node.type === 'group' && [node.kind, node.count])).toEqual([
			['project', 4],
			['task', 5]
		]);
	});
});

describe('constellationItems', () => {
	const ticketItem = (tag: string, via?: { tag: string; group: 'started' | 'completed' }) => ({
		linkedAt,
		ref: {
			kind: 'ticket' as const,
			id: `id-${tag}`,
			tag,
			title: tag,
			href: `/service-desk/${tag}`
		},
		status: 'new' as const,
		...(via
			? {
					via: {
						kind: 'task' as const,
						id: `id-${via.tag}`,
						tag: via.tag,
						title: via.tag,
						href: `/tasks/${via.tag}`,
						status: { group: via.group, name: 'Nombre' }
					}
				}
			: {})
	});

	it('maps tasks and projects to their own status vocabulary', () => {
		const groups: RelatedGroup[] = [
			{
				relation: 'resolved_in',
				icon: 'task',
				items: [
					{
						linkedAt,
						ref: { kind: 'task', id: 't', tag: 'TSK-0001', title: 'x', href: '/tasks/TSK-0001' },
						status: { group: 'started', name: 'En revisión' }
					}
				]
			},
			{
				relation: 'handled_in',
				icon: 'project',
				items: [
					{
						linkedAt,
						ref: {
							kind: 'project',
							id: 'p',
							tag: 'PRJ-0001',
							title: 'x',
							href: '/projects/PRJ-0001'
						},
						status: { archived: true, progress: null }
					}
				]
			}
		];

		expect(constellationItems(groups)).toEqual([
			{
				kind: 'task',
				tag: 'TSK-0001',
				href: '/tasks/TSK-0001',
				status: 'started',
				statusName: 'En revisión'
			},
			{ kind: 'project', tag: 'PRJ-0001', href: '/projects/PRJ-0001', status: 'archived' }
		]);
	});

	it('skips a record the viewer cannot open', () => {
		expect(
			constellationItems([
				{
					relation: 'fulfilled_by',
					icon: 'handover',
					items: [
						{
							linkedAt,
							ref: { kind: 'handover', id: 'h', tag: 'HND-0001', title: 'x', href: null },
							status: 'pending'
						}
					]
				}
			])
		).toEqual([]);
	});

	it('draws nothing for work that is only a restricted count', () => {
		expect(
			constellationItems([
				{ relation: 'resolved_in', icon: 'task', items: [], restricted: 2 },
				{ relation: 'handled_in', icon: 'project', items: [], restricted: 1 }
			])
		).toEqual([]);
	});

	it('draws the tasks of a project once each instead of their tickets again', () => {
		const items = constellationItems([
			{ relation: 'handles', icon: 'ticket', items: [ticketItem('TCK-0001')] },
			{
				relation: 'resolves_via_tasks',
				icon: 'ticket',
				items: [
					ticketItem('TCK-0002', { tag: 'TSK-0001', group: 'started' }),
					ticketItem('TCK-0003', { tag: 'TSK-0001', group: 'started' }),
					ticketItem('TCK-0003', { tag: 'TSK-0002', group: 'completed' })
				]
			}
		]);

		expect(items.map((item) => `${item.kind}:${item.tag}`)).toEqual([
			'ticket:TCK-0001',
			'task:TSK-0001',
			'task:TSK-0002'
		]);
	});
});
