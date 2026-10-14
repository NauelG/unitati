import type { AssetState, TicketStatus } from '#lib/domain/status.js';

type StatusKey = AssetState | TicketStatus;

/**
 * The geometry of the relation constellation (S3, #91): where each linked
 * record sits around the one being viewed. Pure arithmetic so it is testable
 * without a DOM; `RelationConstellation.svelte` only draws what this returns.
 */

export type ConstellationKind = 'asset' | 'ticket';

/** Past this many linked records the ring stops being legible and collapses per kind. */
export const MAX_CONSTELLATION_NODES = 8;

export interface ConstellationInput {
	/** The record whose page this is. */
	centre: { kind: ConstellationKind; tag: string };
	/** Flattened from the `RelatedGroup[]` the page already holds: no new query. */
	items: { kind: ConstellationKind; tag: string; href: string; status: StatusKey }[];
}

interface Point {
	x: number;
	y: number;
}

export type ConstellationNode = Point &
	(
		| { type: 'record'; kind: ConstellationKind; tag: string; href: string; status: StatusKey }
		| { type: 'group'; kind: ConstellationKind; count: number }
	);

export interface ConstellationLayout {
	/** Side of the square viewBox. */
	size: number;
	/** Distance from the centre to every node. */
	radius: number;
	centre: Point & { kind: ConstellationKind; tag: string };
	nodes: ConstellationNode[];
	/** One per node, from the centre outwards: the order the draw-in staggers in. */
	edges: { from: Point; to: Point }[];
}

const SIZE = 240;
const RADIUS = 84;

/**
 * `null` when nothing is linked: an empty constellation is decoration, and
 * `RelatedRecords` already says "nothing linked" in words.
 */
export function layoutConstellation(input: ConstellationInput): ConstellationLayout | null {
	if (input.items.length === 0) return null;

	const centre = { x: SIZE / 2, y: SIZE / 2, ...input.centre };

	type Slot =
		| { type: 'record'; item: ConstellationInput['items'][number] }
		| { type: 'group'; kind: ConstellationKind; count: number };

	const slots: Slot[] =
		input.items.length <= MAX_CONSTELLATION_NODES
			? input.items.map((item) => ({ type: 'record', item }))
			: groupByKind(input.items);

	const nodes = slots.map((slot, index): ConstellationNode => {
		// Clockwise from twelve o'clock, so the first record is always the one read first.
		const angle = -Math.PI / 2 + (2 * Math.PI * index) / slots.length;
		const point = {
			x: centre.x + RADIUS * Math.cos(angle),
			y: centre.y + RADIUS * Math.sin(angle)
		};
		return slot.type === 'record'
			? {
					...point,
					type: 'record',
					kind: slot.item.kind,
					tag: slot.item.tag,
					href: slot.item.href,
					status: slot.item.status
				}
			: { ...point, type: 'group', kind: slot.kind, count: slot.count };
	});

	return {
		size: SIZE,
		radius: RADIUS,
		centre,
		nodes,
		edges: nodes.map((node) => ({
			from: { x: centre.x, y: centre.y },
			to: { x: node.x, y: node.y }
		}))
	};
}

function groupByKind(
	items: ConstellationInput['items']
): { type: 'group'; kind: ConstellationKind; count: number }[] {
	const counts = new Map<ConstellationKind, number>();
	for (const item of items) counts.set(item.kind, (counts.get(item.kind) ?? 0) + 1);
	return [...counts.entries()]
		.sort(([a], [b]) => a.localeCompare(b))
		.map(([kind, count]) => ({ type: 'group', kind, count }));
}
