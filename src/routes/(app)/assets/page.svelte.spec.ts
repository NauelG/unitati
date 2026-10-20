import { fireEvent, render, screen } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';
import Page from './+page.svelte';

// The donut's chart library reads `matchMedia` as it loads; jsdom has none.
vi.hoisted(() => {
	window.matchMedia = ((query: string) => ({
		matches: false,
		media: query,
		addEventListener() {},
		removeEventListener() {}
	})) as never;
});
vi.mock('$app/navigation', () => ({ goto: vi.fn(), navigating: { to: null } }));

function row(index: number) {
	const tag = `AST-${String(index).padStart(4, '0')}`;
	return {
		visibility: 'full',
		id: `id-${index}`,
		assetTag: tag,
		name: `Laptop ${index}`,
		modelName: 'ThinkPad',
		state: 'in_stock',
		custodianName: null,
		locationPath: null
	};
}

function pageData(canManage: boolean, rows = 3) {
	return {
		result: {
			rows: Array.from({ length: rows }, (_, i) => row(i + 1)),
			total: rows,
			page: 1,
			pageCount: 1,
			perPage: 25
		},
		search: '',
		summary: { total: rows, unassigned: rows },
		distribution: [],
		seesWholeInventory: true,
		canManage
	} as never;
}

const renderPage = (canManage: boolean, rows?: number) =>
	render(Page, { data: pageData(canManage, rows) } as never);

describe('/assets label selection', () => {
	it('has no checkboxes and no print button without assets.manage', () => {
		renderPage(false);
		expect(screen.queryAllByRole('checkbox')).toHaveLength(0);
		expect(screen.queryByRole('link', { name: /Imprimir etiquetas/ })).toBeNull();
	});

	it('shows the print button only once something is selected, linking the selected tags', async () => {
		renderPage(true);
		expect(screen.queryByRole('link', { name: /Imprimir etiquetas/ })).toBeNull();

		await fireEvent.click(screen.getByRole('checkbox', { name: 'Laptop 1' }));
		await fireEvent.click(screen.getByRole('checkbox', { name: 'Laptop 3' }));

		const link = screen.getByRole('link', { name: 'Imprimir etiquetas (2)' });
		expect(link.getAttribute('href')).toBe('/assets/labels?tag=AST-0001&tag=AST-0003');
	});
});
