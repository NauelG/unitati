import type { AssetState, StateGroup, TicketStatus } from '#lib/domain/status.js';
import type { RecordKind, RelatedGroup, RelatedItem } from '#lib/server/links/index.js';

/**
 * The geometry of the relation constellation (S3, #91): where each linked
 * record sits around the one being viewed. Pure arithmetic so it is testable
 * without a DOM; `RelationConstellation.svelte` only draws what this returns.
 */

export type ConstellationKind = 'asset' | 'ticket' | 'task' | 'project';

/** A project has no status column; the constellation only tells the two apart. */
export type ProjectStanding = 'active' | 'archived';

/**
 * A linked record, typed per kind so a status can never be read in the wrong
 * vocabulary: assets and tickets carry their own key, a task its state's group
 * plus the organisation's name for it, a project whether it is archived.
 */
export type ConstellationItem = { tag: string; href: string } & (
	| { kind: 'asset'; status: AssetState }
	| { kind: 'ticket'; status: TicketStatus }
	| { kind: 'task'; status: StateGroup; statusName: string }
	| { kind: 'project'; status: ProjectStanding }
);

/** The relations an edge can be named after, as the keys `RelatedRecords` uses. */
export type EdgeRelation = 'resolved_in' | 'handled_in';

/**
 * Edges read from the ticket outwards, whichever record's page this is: a
 * ticket is *resolved in* a task and *handled in* a project. A task and its
 * project are structural, not a relation, so that edge says nothing.
 */
export function edgeRelation(a: ConstellationKind, b: ConstellationKind): EdgeRelation | null {
	if (a === 'ticket') return b === 'task' ? 'resolved_in' : b === 'project' ? 'handled_in' : null;
	if (b === 'ticket') return edgeRelation(b, a);
	return null;
}

/** Edge labels need room; past this many nodes they would overlap, so only the nodes say it. */
export const MAX_LABELLED_EDGES = 4;

/** Past this many linked records the ring stops being legible and collapses per kind. */
export const MAX_CONSTELLATION_NODES = 8;

export interface ConstellationInput {
	/** The record whose page this is. */
	centre: { kind: ConstellationKind; tag: string };
	/** Flattened from the `RelatedGroup[]` the page already holds: no new query. */
	items: ConstellationItem[];
}

interface Point {
	x: number;
	y: number;
}

export type ConstellationNode = Point &
	(
		| ({ type: 'record'; relation: EdgeRelation | null } & ConstellationItem)
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
	edges: { from: Point; to: Point; relation: EdgeRelation | null }[];
	/** Whether the edges can carry their relation as text without colliding. */
	labelEdges: boolean;
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
					...slot.item,
					type: 'record',
					relation: edgeRelation(input.centre.kind, slot.item.kind)
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
			to: { x: node.x, y: node.y },
			relation: node.type === 'record' ? node.relation : null
		})),
		labelEdges: nodes.length <= MAX_LABELLED_EDGES
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

type ItemOf<K extends RecordKind> = Extract<RelatedItem, { ref: { kind: K } }>;

/** Narrows an item to one kind, which is what ties its `status` to its vocabulary. */
function isKind<K extends RecordKind>(item: RelatedItem, kind: K): item is ItemOf<K> {
	return item.ref.kind === kind;
}

function toConstellationItem(item: RelatedItem): ConstellationItem | null {
	// A restricted record has nowhere to go, and a node is a link.
	if (item.ref.href === null) return null;
	const place = { tag: item.ref.tag, href: item.ref.href };

	if (isKind(item, 'asset')) return { ...place, kind: 'asset', status: item.status };
	if (isKind(item, 'ticket')) return { ...place, kind: 'ticket', status: item.status };
	if (isKind(item, 'task')) {
		return { ...place, kind: 'task', status: item.status.group, statusName: item.status.name };
	}
	if (isKind(item, 'project')) {
		return { ...place, kind: 'project', status: item.status.archived ? 'archived' : 'active' };
	}
	return null;
}

/**
 * The constellation's neighbours, read from the groups `RelatedRecords` already
 * lists: no new query, and nothing in the ring the list does not say.
 *
 * On a project, `resolves_via_tasks` contributes the **tasks** carrying
 * tickets, once each, rather than the tickets again: the ring would otherwise
 * hold the same request twice.
 */
export function constellationItems(groups: readonly RelatedGroup[]): ConstellationItem[] {
	const items: ConstellationItem[] = [];
	const seen = new Set<string>();
	const add = (item: ConstellationItem | null) => {
		if (!item || seen.has(`${item.kind}:${item.tag}`)) return;
		seen.add(`${item.kind}:${item.tag}`);
		items.push(item);
	};

	for (const group of groups) {
		for (const item of group.items) {
			if (group.relation !== 'resolves_via_tasks') add(toConstellationItem(item));
			else if (item.via) {
				add({
					kind: 'task',
					tag: item.via.tag,
					href: item.via.href,
					status: item.via.status.group,
					statusName: item.via.status.name
				});
			}
		}
	}

	return items;
}
