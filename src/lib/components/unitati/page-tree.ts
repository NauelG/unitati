/**
 * The pure half of `PageTree`: turning the flat, ordered list the domain returns
 * into rows, and a keystroke or a drop into the one write it means. Kept free of
 * the DOM so the rules (who may nest under whom, what "indent" does at the top
 * of a list) are a unit test and not a scenario to click through.
 */

export type PageStatusKey = 'draft' | 'published' | 'archived';

/** One page of a space, as `listSpaceTree` returns it. */
export interface PageTreeEntry {
	id: string;
	tag: string;
	title: string;
	parentId: string | null;
	position: number;
	status: PageStatusKey;
}

export interface PageTreeNode extends PageTreeEntry {
	children: PageTreeNode[];
}

/** Before or after a sibling; the same shape the domain's `reorderPage` takes. */
export type PageTreePlacement = { before: string } | { after: string };

export type PageTreeIntent =
	| { kind: 'reorder'; id: string; placement: PageTreePlacement }
	| { kind: 'move'; id: string; parentId: string | null; placement?: PageTreePlacement };

/**
 * Roots and children in `position` order. An entry whose parent is not in the
 * list (the parent is archived and hidden, or unreadable) surfaces at the root,
 * so a page is never lost from the tree.
 */
export function buildTree(entries: readonly PageTreeEntry[]): PageTreeNode[] {
	const nodes = new Map<string, PageTreeNode>(
		entries.map((entry) => [entry.id, { ...entry, children: [] }])
	);
	const roots: PageTreeNode[] = [];
	for (const entry of entries) {
		const node = nodes.get(entry.id) as PageTreeNode;
		const parent = entry.parentId ? nodes.get(entry.parentId) : undefined;
		(parent ? parent.children : roots).push(node);
	}
	const byPosition = (a: PageTreeNode, b: PageTreeNode) =>
		a.position - b.position || a.id.localeCompare(b.id);
	roots.sort(byPosition);
	for (const node of nodes.values()) node.children.sort(byPosition);
	return roots;
}

export interface PageTreeRow {
	node: PageTreeNode;
	/** 1 at the root, as `aria-level` counts. */
	level: number;
	parent: PageTreeNode | null;
}

/** The rows on screen, top to bottom: a collapsed node hides everything below it. */
export function visibleRows(roots: PageTreeNode[], expanded: ReadonlySet<string>): PageTreeRow[] {
	const rows: PageTreeRow[] = [];
	const walk = (nodes: PageTreeNode[], level: number, parent: PageTreeNode | null) => {
		for (const node of nodes) {
			rows.push({ node, level, parent });
			if (node.children.length > 0 && expanded.has(node.id)) walk(node.children, level + 1, node);
		}
	};
	walk(roots, 1, null);
	return rows;
}

/** Ids of the page's ancestors, so the tree opens on the page being read. */
export function ancestorIds(entries: readonly PageTreeEntry[], id: string): string[] {
	const byId = new Map(entries.map((entry) => [entry.id, entry]));
	const ids: string[] = [];
	let parentId = byId.get(id)?.parentId ?? null;
	while (parentId && !ids.includes(parentId)) {
		ids.push(parentId);
		parentId = byId.get(parentId)?.parentId ?? null;
	}
	return ids;
}

/** True when `candidateId` is `id` itself or somewhere below it. */
export function isWithin(roots: PageTreeNode[], id: string, candidateId: string): boolean {
	const find = (nodes: PageTreeNode[]): PageTreeNode | undefined => {
		for (const node of nodes) {
			if (node.id === id) return node;
			const found = find(node.children);
			if (found) return found;
		}
		return undefined;
	};
	const subtree = (node: PageTreeNode): boolean =>
		node.id === candidateId || node.children.some(subtree);
	const root = find(roots);
	return root ? subtree(root) : false;
}

function locate(roots: PageTreeNode[], id: string) {
	const walk = (
		nodes: PageTreeNode[],
		parent: PageTreeNode | null
	): { node: PageTreeNode; siblings: PageTreeNode[]; parent: PageTreeNode | null } | null => {
		for (const node of nodes) {
			if (node.id === id) return { node, siblings: nodes, parent };
			const found = walk(node.children, node);
			if (found) return found;
		}
		return null;
	};
	return walk(roots, null);
}

export type MoveKey = 'up' | 'down' | 'indent' | 'outdent';

/**
 * What an Alt+arrow means for the page `id`: up and down swap with a sibling;
 * indent nests under the previous sibling (as its last child); outdent goes to
 * the parent's level, right after the parent. `null` where there is nowhere to
 * go (the first page cannot move up or indent; a root cannot outdent).
 */
export function intentForKey(
	roots: PageTreeNode[],
	id: string,
	key: MoveKey
): PageTreeIntent | null {
	const found = locate(roots, id);
	if (!found) return null;
	const { siblings, parent } = found;
	const index = siblings.findIndex((sibling) => sibling.id === id);

	switch (key) {
		case 'up':
			return index > 0
				? { kind: 'reorder', id, placement: { before: siblings[index - 1].id } }
				: null;
		case 'down':
			return index < siblings.length - 1
				? { kind: 'reorder', id, placement: { after: siblings[index + 1].id } }
				: null;
		case 'indent':
			return index > 0 ? { kind: 'move', id, parentId: siblings[index - 1].id } : null;
		case 'outdent':
			return parent
				? { kind: 'move', id, parentId: parent.parentId, placement: { after: parent.id } }
				: null;
	}
}

export type DropZone = 'before' | 'inside' | 'after';

/** The upper quarter of a row means "before it", the lower quarter "after it", the middle "inside it". */
export function dropZone(offsetY: number, height: number): DropZone {
	if (height <= 0) return 'inside';
	const ratio = offsetY / height;
	if (ratio < 0.25) return 'before';
	if (ratio > 0.75) return 'after';
	return 'inside';
}

/**
 * The write a drop means, or `null` when it means nothing: dropping a page on
 * itself or into its own subtree (the domain refuses it as `cycle`, and the tree
 * does not offer it), or back where it already is.
 */
export function intentForDrop(
	roots: PageTreeNode[],
	id: string,
	targetId: string,
	zone: DropZone
): PageTreeIntent | null {
	if (isWithin(roots, id, targetId)) return null;
	const dragged = locate(roots, id);
	const target = locate(roots, targetId);
	if (!dragged || !target) return null;

	if (zone === 'inside') {
		return dragged.parent?.id === target.node.id
			? null
			: { kind: 'move', id, parentId: target.node.id };
	}
	const placement: PageTreePlacement =
		zone === 'before' ? { before: targetId } : { after: targetId };
	const sameParent = (dragged.parent?.id ?? null) === (target.parent?.id ?? null);
	return sameParent
		? { kind: 'reorder', id, placement }
		: { kind: 'move', id, parentId: target.parent?.id ?? null, placement };
}

export interface ParentOption {
	value: string;
	label: string;
}

/**
 * The pages a parent picker offers: depth first, each title indented by its
 * level. `excludeId` leaves out a page and everything below it, which is what
 * "move under…" must not offer (the domain refuses it as `cycle`).
 */
export function parentOptions(
	entries: readonly PageTreeEntry[],
	excludeId?: string
): ParentOption[] {
	const options: ParentOption[] = [];
	const walk = (nodes: PageTreeNode[], level: number) => {
		for (const node of nodes) {
			if (node.id === excludeId || node.status === 'archived') continue;
			options.push({ value: node.id, label: `${'\u2003'.repeat(level)}${node.title}` });
			walk(node.children, level + 1);
		}
	};
	walk(buildTree(entries), 0);
	return options;
}
