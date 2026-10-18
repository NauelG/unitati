import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import SearchSelectField from './SearchSelectField.svelte';

const ASSETS = [
	{ value: 'a1', label: 'AST-0001 · MacBook Pro 14' },
	{ value: 'a2', label: 'AST-0002 · MacBook Air' }
];

function respondWith(results: unknown, ok = true) {
	const fetchMock = vi.fn(async () =>
		ok ? Response.json(results) : new Response('nope', { status: 500 })
	);
	vi.stubGlobal('fetch', fetchMock);
	return fetchMock;
}

function renderMultiple(extra: Record<string, unknown> = {}) {
	return render(SearchSelectField, {
		label: 'Activos',
		name: 'assetIds',
		multiple: true,
		searchUrl: '/assets',
		values: ['a1', 'a2'],
		pickedLabels: { a1: ASSETS[0].label, a2: ASSETS[1].label },
		...extra
	});
}

async function openAndSearch(text = '') {
	await fireEvent.click(screen.getByRole('button', { name: /^Activos/ }));
	const input = await screen.findByRole('combobox', { hidden: true });
	await fireEvent.input(input, { target: { value: text } });
	return input as HTMLInputElement;
}

// jsdom has no layout, so the floating popover is styled `visibility: hidden`
// and the role queries skip it.
const liveRegion = () => screen.getByRole('status', { hidden: true });

// jsdom has no layout: the Command list scrolls the active item into view.
beforeAll(() => {
	Element.prototype.scrollIntoView = () => {};
});

afterEach(() => vi.unstubAllGlobals());

describe('SearchSelectField multiple: chips', () => {
	it('lists the selection outside the trigger, each chip with a real remove button', () => {
		renderMultiple();

		const list = screen.getByRole('list', { name: 'Activos: elegidos' });
		const buttons = list.querySelectorAll('button');
		expect(buttons).toHaveLength(2);
		expect(list.textContent).toContain('AST-0001 · MacBook Pro 14');
		expect(
			screen.getByRole('button', { name: 'Quitar AST-0001 · MacBook Pro 14 de Activos' })
		).toBeTruthy();
	});

	it('keeps every interactive element out of the trigger', () => {
		renderMultiple();

		const trigger = document.getElementById(
			screen.getByText('2 seleccionados').closest('button')!.id
		)!;
		expect(trigger.querySelector('button, a, input, [role="button"], [tabindex]')).toBeNull();
		expect(trigger.textContent).toContain('2 seleccionados');
	});

	it('moves focus to the next chip after removing one, else the previous, else the trigger', async () => {
		renderMultiple({
			values: ['a1', 'a2', 'a3'],
			pickedLabels: {
				a1: ASSETS[0].label,
				a2: ASSETS[1].label,
				a3: 'AST-0003 · Dock'
			}
		});
		const remove = (item: string) =>
			screen.getByRole('button', { name: `Quitar ${item} de Activos` });

		await fireEvent.click(remove('AST-0002 · MacBook Air'));
		await waitFor(() => expect(document.activeElement).toBe(remove('AST-0003 · Dock')));

		await fireEvent.click(remove('AST-0003 · Dock'));
		await waitFor(() => expect(document.activeElement).toBe(remove('AST-0001 · MacBook Pro 14')));

		await fireEvent.click(remove('AST-0001 · MacBook Pro 14'));
		await waitFor(() =>
			expect(document.activeElement).toBe(screen.getByRole('button', { name: /^Activos/ }))
		);
		expect(screen.queryByRole('list', { name: 'Activos: elegidos' })).toBeNull();
	});

	it('posts one hidden input per value', () => {
		const { container } = renderMultiple();

		const posted = [...container.querySelectorAll<HTMLInputElement>('input[name="assetIds"]')];
		expect(posted.map((input) => input.value)).toEqual(['a1', 'a2']);
	});

	it('renders the picked labels, not ids, from the bound state', () => {
		renderMultiple({ values: ['a1'] });

		expect(screen.getByText('AST-0001 · MacBook Pro 14')).toBeTruthy();
		expect(screen.queryByText('a1')).toBeNull();
	});
});

describe('SearchSelectField: search popover', () => {
	it('announces the result count in words, overridable by the caller', async () => {
		respondWith(ASSETS);
		renderMultiple({ values: [], countText: (count: number) => `${count} equipos disponibles` });
		await openAndSearch();

		await waitFor(() => expect(liveRegion().textContent).toBe('2 equipos disponibles'));
	});

	it('announces the translated generic count by default', async () => {
		respondWith(ASSETS);
		renderMultiple({ values: [] });
		await openAndSearch();

		await waitFor(() => expect(liveRegion().textContent).toBe('2 resultados'));
	});

	it('shows translated failed and empty texts, with no English left', async () => {
		respondWith(null, false);
		renderMultiple({ values: [] });
		await openAndSearch('x');

		expect(await screen.findByText('No se ha podido buscar. Inténtalo de nuevo.')).toBeTruthy();
		expect(document.body.textContent).not.toMatch(/Couldn't|No matches|: clear/);
	});

	it('shows the translated empty text', async () => {
		respondWith([]);
		renderMultiple({ values: [] });
		await openAndSearch('x');
		expect(await screen.findByText('No hay resultados.')).toBeTruthy();
	});

	it('shows the caller override for the empty text', async () => {
		respondWith([]);
		renderMultiple({ values: [], noneText: 'No hay equipos que coincidan.' });
		await openAndSearch('x');
		expect(await screen.findByText('No hay equipos que coincidan.')).toBeTruthy();
	});

	it('translates the clear button', () => {
		render(SearchSelectField, {
			label: 'Rol',
			options: [{ value: 'admin', label: 'Administrador' }],
			value: 'admin'
		});

		expect(screen.getByRole('button', { name: 'Borrar Rol' })).toBeTruthy();
	});

	it('keeps the query after a pick when multiple, and clears it in single mode', async () => {
		respondWith(ASSETS);
		renderMultiple({ values: [] });
		const input = await openAndSearch('mac');
		await fireEvent.click(await screen.findByText('AST-0001 · MacBook Pro 14'));
		expect(input.isConnected).toBe(true);
		expect(input.value).toBe('mac');
	});

	it('clears the query and closes after a pick in single mode', async () => {
		respondWith(ASSETS);
		render(SearchSelectField, { label: 'Activos', searchUrl: '/assets', value: null });
		const input = await openAndSearch('mac');
		await fireEvent.click(await screen.findByText('AST-0001 · MacBook Pro 14'));

		await waitFor(() => expect(input.isConnected).toBe(false));
		await fireEvent.click(screen.getByText('AST-0001 · MacBook Pro 14'));
		const reopened = await screen.findByRole('combobox', { hidden: true });
		expect((reopened as HTMLInputElement).value).toBe('');
	});

	it('does not let Enter in the search box submit the surrounding form', async () => {
		respondWith(ASSETS);
		renderMultiple({ values: [] });
		const input = await openAndSearch('mac');

		const enter = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
		input.dispatchEvent(enter);

		expect(enter.defaultPrevented).toBe(true);
	});
});
