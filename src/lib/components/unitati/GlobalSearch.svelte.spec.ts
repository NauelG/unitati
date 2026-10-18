import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SearchResult } from '#lib/server/search/index.js';
import GlobalSearch from './GlobalSearch.svelte';

const { gotoMock } = vi.hoisted(() => ({ gotoMock: vi.fn() }));

// Not under test: they reach for SvelteKit's runtime, which jsdom does not have.
vi.mock('$app/navigation', () => ({ goto: gotoMock, invalidateAll: () => {} }));
vi.mock('$app/state', () => ({ page: { url: new URL('http://localhost/') } }));
vi.mock('$app/env/public', () => ({ APP_ENV: 'development' }));

const RESULT: SearchResult = {
	groups: [
		{
			key: 'assets',
			total: 1,
			hits: [
				{
					kind: 'asset',
					code: 'AST-0142',
					title: 'MacBook Pró de Ada',
					subtitle: 'Planta 2',
					href: '/assets/AST-0142'
				}
			]
		},
		{
			key: 'tickets',
			total: 7,
			hits: [
				{
					kind: 'ticket',
					code: 'TCK-0093',
					title: 'La impresora no imprime',
					subtitle: null,
					href: '/service-desk/TCK-0093'
				}
			]
		}
	]
};

/** A title is split into runs when part of it is highlighted, so match on the whole element. */
const titleOf = (title: string) =>
	screen.queryByText(
		(_, element) =>
			element?.classList.contains('truncate') === true && element.textContent?.trim() === title
	);

function respondWith(result: SearchResult) {
	const fetchMock = vi.fn(async () => Response.json(result));
	vi.stubGlobal('fetch', fetchMock);
	return fetchMock;
}

async function openAndType(text: string) {
	render(GlobalSearch, { permissions: ['assets.view', 'tickets.view'], open: true });
	await fireEvent.input(screen.getByRole('combobox'), { target: { value: text } });
}

describe('GlobalSearch', () => {
	beforeEach(() => {
		// jsdom implements neither; the list scrolls the selected row into view.
		Element.prototype.scrollIntoView = vi.fn();
		vi.useRealTimers();
		gotoMock.mockReset();
	});
	afterEach(() => vi.unstubAllGlobals());

	it('asks the server for what was typed and draws the groups it returns, with the scoped total beside a group that has more', async () => {
		const fetchMock = respondWith(RESULT);

		await openAndType('macbook');

		await waitFor(() => expect(titleOf('MacBook Pró de Ada')).toBeTruthy());
		expect(fetchMock).toHaveBeenCalledWith(
			'/api/search?q=macbook',
			expect.objectContaining({ signal: expect.anything() })
		);
		expect(screen.getByText('Activos')).toBeTruthy();
		expect(screen.getByText('Tickets · 7')).toBeTruthy();
	});

	it('highlights what matched, ignoring accents and the plural', async () => {
		respondWith(RESULT);

		await openAndType('impresoras');

		await waitFor(() => expect(titleOf('La impresora no imprime')).toBeTruthy());
		const marked = [...document.querySelectorAll('mark')].map((mark) => mark.textContent);
		expect(marked).toContain('impresora');
	});

	it('opens the first result on Enter, so an exact code is a jump', async () => {
		respondWith({
			groups: [
				{
					key: 'code',
					total: 1,
					hits: [
						{
							kind: 'asset',
							code: 'AST-0142',
							title: 'MacBook Pró de Ada',
							subtitle: null,
							href: '/assets/AST-0142'
						}
					]
				}
			]
		});

		await openAndType('AST-0142');
		await waitFor(() => expect(titleOf('MacBook Pró de Ada')).toBeTruthy());
		await waitFor(() => expect(document.querySelector('[data-selected]')).not.toBeNull());
		await fireEvent.keyDown(screen.getByRole('combobox'), { key: 'Enter' });

		await waitFor(() => expect(gotoMock).toHaveBeenCalledWith('/assets/AST-0142'));
	});

	it('says only that nothing was found — never why', async () => {
		respondWith({ groups: [] });

		await openAndType('TCK-9999');

		await waitFor(() => expect(screen.getByText('Sin resultados.')).toBeTruthy());
	});

	it('opens on Ctrl+K from anywhere', async () => {
		respondWith({ groups: [] });
		render(GlobalSearch, { permissions: [], open: false });
		expect(screen.queryByRole('combobox')).toBeNull();

		await fireEvent.keyDown(window, { key: 'k', ctrlKey: true });

		await waitFor(() => expect(screen.getByRole('combobox')).toBeTruthy());
	});
});
