import { fireEvent, render } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';
import PageTree from './PageTree.svelte';
import type { PageTreeEntry } from './page-tree.js';

const entry = (
	id: string,
	parentId: string | null,
	position: number,
	status: PageTreeEntry['status'] = 'published'
): PageTreeEntry => ({ id, tag: `DOC-${id}`, title: `Page ${id}`, parentId, position, status });

const entries = [
	entry('a', null, 1),
	entry('a1', 'a', 1),
	entry('b', null, 2, 'draft'),
	entry('c', null, 3)
];

const mount = (extra: Record<string, unknown> = {}) =>
	render(PageTree, {
		entries,
		label: 'Páginas',
		href: (e: PageTreeEntry) => `/knowledge/${e.tag}`,
		...extra
	});

const titles = (container: HTMLElement) =>
	[...container.querySelectorAll('[role="treeitem"] a')].map((a) => a.textContent?.trim());

describe('PageTree', () => {
	it('starts collapsed and expands a branch from its toggle', async () => {
		const { container } = mount();

		expect(titles(container)).toEqual(['Page a', 'Page b Borrador', 'Page c']);
		expect(
			container.querySelector('[role="treeitem"][aria-level="1"]')!.getAttribute('aria-expanded')
		).toBe('false');

		await fireEvent.click(container.querySelector('button[aria-label^="Desplegar"]')!);

		expect(titles(container)).toEqual(['Page a', 'Page a1', 'Page b Borrador', 'Page c']);
	});

	it('opens on the path to the current page and marks it', () => {
		const { container } = mount({ currentId: 'a1' });

		const current = container.querySelector('[aria-current="page"]');
		expect(current?.textContent).toContain('Page a1');
	});

	it('is a single tab stop', () => {
		const { container } = mount({ expandAll: true });

		const stops = [...container.querySelectorAll('a')].filter((a) => a.tabIndex === 0);
		expect(stops).toHaveLength(1);
	});

	it('reorders with Alt+ArrowUp / Alt+ArrowDown when editable', async () => {
		const onreorder = vi.fn();
		const { container } = mount({ editable: true, onreorder });

		const link = (id: string) => container.querySelector(`[data-page-link="${id}"]`)!;
		await fireEvent.keyDown(link('b'), { key: 'ArrowUp', altKey: true });
		await fireEvent.keyDown(link('b'), { key: 'ArrowDown', altKey: true });

		expect(onreorder).toHaveBeenNthCalledWith(1, 'b', { before: 'a' });
		expect(onreorder).toHaveBeenNthCalledWith(2, 'b', { after: 'c' });
	});

	it('nests with Alt+ArrowRight and lifts with Alt+ArrowLeft', async () => {
		const onmove = vi.fn();
		const { container } = mount({ editable: true, expandAll: true, onmove });

		await fireEvent.keyDown(container.querySelector('[data-page-link="b"]')!, {
			key: 'ArrowRight',
			altKey: true
		});
		await fireEvent.keyDown(container.querySelector('[data-page-link="a1"]')!, {
			key: 'ArrowLeft',
			altKey: true
		});

		expect(onmove).toHaveBeenNthCalledWith(1, 'b', 'a', undefined);
		expect(onmove).toHaveBeenNthCalledWith(2, 'a1', null, { after: 'a' });
	});

	it('does not reorder when it is read-only', async () => {
		const onreorder = vi.fn();
		const { container } = mount({ onreorder });

		await fireEvent.keyDown(container.querySelector('[data-page-link="b"]')!, {
			key: 'ArrowUp',
			altKey: true
		});

		expect(onreorder).not.toHaveBeenCalled();
	});

	it('moves focus with the arrow keys', async () => {
		const { container } = mount();

		const first = container.querySelector<HTMLElement>('[data-page-link="a"]')!;
		first.focus();
		await fireEvent.keyDown(first, { key: 'ArrowDown' });

		await vi.waitFor(() =>
			expect(document.activeElement).toBe(container.querySelector('[data-page-link="b"]'))
		);
	});
});
