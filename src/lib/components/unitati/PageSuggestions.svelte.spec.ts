import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import PageSuggestions from './PageSuggestions.svelte';

const respond = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });

afterEach(() => vi.unstubAllGlobals());

describe('PageSuggestions', () => {
	it('asks nothing for a subject under three characters', async () => {
		const fetchMock = vi.fn();
		vi.stubGlobal('fetch', fetchMock);

		render(PageSuggestions, { subject: 'im', delay: 0 });
		await new Promise((resolve) => setTimeout(resolve, 20));

		expect(fetchMock).not.toHaveBeenCalled();
		expect(screen.queryByText('¿Te ayuda alguna de estas páginas?')).toBeNull();
	});

	it('lists the suggestions and opens one in place, leaving the form untouched', async () => {
		const fetchMock = vi.fn(async (url: string) =>
			url.includes('/preview')
				? respond({
						tag: 'DOC-0001',
						title: 'Conectar la impresora',
						bodyHtml: '<p>Pulsa el botón.</p>',
						hasBody: true,
						attachments: []
					})
				: respond({ pages: [{ tag: 'DOC-0001', title: 'Conectar la impresora' }] })
		);
		vi.stubGlobal('fetch', fetchMock);

		render(PageSuggestions, { subject: 'impresora', delay: 0 });
		const link = await screen.findByRole('button', { name: /Conectar la impresora/ });
		await fireEvent.click(link);

		expect(await screen.findByText('Pulsa el botón.')).toBeTruthy();
		await fireEvent.click(screen.getByRole('button', { name: 'Seguir con mi solicitud' }));
		await waitFor(() => expect(screen.queryByText('Pulsa el botón.')).toBeNull());
		expect(screen.getByRole('button', { name: /Conectar la impresora/ })).toBeTruthy();
	});
});
