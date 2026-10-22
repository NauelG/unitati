import { describe, expect, it } from 'vitest';
import {
	ancestorIds,
	buildTree,
	dropZone,
	intentForDrop,
	intentForKey,
	parentOptions,
	visibleRows,
	type PageTreeEntry
} from './page-tree.js';

const entry = (
	id: string,
	parentId: string | null,
	position: number,
	status: PageTreeEntry['status'] = 'published'
): PageTreeEntry => ({ id, tag: `DOC-${id}`, title: id, parentId, position, status });

// a (1) ─ a1 (1), a2 (2)
// b (2)
// c (3)
const entries = [
	entry('c', null, 3),
	entry('a', null, 1),
	entry('b', null, 2),
	entry('a2', 'a', 2),
	entry('a1', 'a', 1)
];

describe('buildTree', () => {
	it('orders roots and children by position', () => {
		const roots = buildTree(entries);

		expect(roots.map((node) => node.id)).toEqual(['a', 'b', 'c']);
		expect(roots[0].children.map((node) => node.id)).toEqual(['a1', 'a2']);
	});

	it('puts a page whose parent is not listed at the root', () => {
		const roots = buildTree([entry('x', 'hidden', 1), entry('y', null, 2)]);

		expect(roots.map((node) => node.id)).toEqual(['x', 'y']);
	});
});

describe('visibleRows', () => {
	const roots = buildTree(entries);

	it('hides the children of a collapsed node', () => {
		expect(visibleRows(roots, new Set()).map((row) => row.node.id)).toEqual(['a', 'b', 'c']);
	});

	it('lists them in order, with their level, once expanded', () => {
		const rows = visibleRows(roots, new Set(['a']));

		expect(rows.map((row) => [row.node.id, row.level])).toEqual([
			['a', 1],
			['a1', 2],
			['a2', 2],
			['b', 1],
			['c', 1]
		]);
	});
});

describe('ancestorIds', () => {
	it('walks up to the root, parent first', () => {
		const deep = [entry('r', null, 1), entry('m', 'r', 1), entry('l', 'm', 1)];

		expect(ancestorIds(deep, 'l')).toEqual(['m', 'r']);
		expect(ancestorIds(deep, 'r')).toEqual([]);
	});
});

describe('intentForKey', () => {
	const roots = buildTree(entries);

	it('swaps with the previous and the next sibling', () => {
		expect(intentForKey(roots, 'b', 'up')).toEqual({
			kind: 'reorder',
			id: 'b',
			placement: { before: 'a' }
		});
		expect(intentForKey(roots, 'b', 'down')).toEqual({
			kind: 'reorder',
			id: 'b',
			placement: { after: 'c' }
		});
	});

	it('has nowhere to go at the ends', () => {
		expect(intentForKey(roots, 'a', 'up')).toBeNull();
		expect(intentForKey(roots, 'c', 'down')).toBeNull();
		expect(intentForKey(roots, 'a', 'indent')).toBeNull();
		expect(intentForKey(roots, 'b', 'outdent')).toBeNull();
	});

	it('indents under the previous sibling and outdents after the parent', () => {
		expect(intentForKey(roots, 'b', 'indent')).toEqual({ kind: 'move', id: 'b', parentId: 'a' });
		expect(intentForKey(roots, 'a1', 'outdent')).toEqual({
			kind: 'move',
			id: 'a1',
			parentId: null,
			placement: { after: 'a' }
		});
	});
});

describe('intentForDrop', () => {
	const roots = buildTree(entries);

	it('reorders among siblings, and moves across parents', () => {
		expect(intentForDrop(roots, 'c', 'a', 'before')).toEqual({
			kind: 'reorder',
			id: 'c',
			placement: { before: 'a' }
		});
		expect(intentForDrop(roots, 'c', 'a1', 'after')).toEqual({
			kind: 'move',
			id: 'c',
			parentId: 'a',
			placement: { after: 'a1' }
		});
	});

	it('nests a page when it lands inside another', () => {
		expect(intentForDrop(roots, 'c', 'b', 'inside')).toEqual({
			kind: 'move',
			id: 'c',
			parentId: 'b'
		});
	});

	it('means nothing on itself, on its own subtree, or on its current parent', () => {
		expect(intentForDrop(roots, 'a', 'a', 'inside')).toBeNull();
		expect(intentForDrop(roots, 'a', 'a2', 'before')).toBeNull();
		expect(intentForDrop(roots, 'a1', 'a', 'inside')).toBeNull();
	});
});

describe('dropZone', () => {
	it('splits a row in quarters, middle half inside', () => {
		expect(dropZone(2, 40)).toBe('before');
		expect(dropZone(20, 40)).toBe('inside');
		expect(dropZone(38, 40)).toBe('after');
	});
});

describe('parentOptions', () => {
	it('lists pages depth first, indented, without the excluded subtree or archived pages', () => {
		const withArchived = [...entries, entry('z', null, 4, 'archived')];

		expect(parentOptions(withArchived).map((option) => option.value)).toEqual([
			'a',
			'a1',
			'a2',
			'b',
			'c'
		]);
		expect(parentOptions(withArchived, 'a').map((option) => option.value)).toEqual(['b', 'c']);
		expect(parentOptions(withArchived)[1].label.startsWith('\u2003')).toBe(true);
	});
});
