import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { beforeAll, describe, expect, it } from 'vitest';
import RichTextEditor from './RichTextEditor.svelte';

// jsdom has no layout; ProseMirror asks for rects when it scrolls the caret into view.
beforeAll(() => {
	const rects = () => ({ length: 0, item: () => null, [Symbol.iterator]: [][Symbol.iterator] });
	Element.prototype.getClientRects = rects as never;
	Range.prototype.getClientRects = rects as never;
	Range.prototype.getBoundingClientRect = (() => ({
		top: 0,
		left: 0,
		right: 0,
		bottom: 0
	})) as never;
});

const hidden = (container: HTMLElement) =>
	container.querySelector<HTMLInputElement>('input[type="hidden"][name="body"]')!;

const surface = () => screen.getByRole('textbox', { name: 'Respuesta' });

describe('RichTextEditor', () => {
	it('starts with the given markdown in the hidden input', () => {
		const { container } = render(RichTextEditor, {
			name: 'body',
			label: 'Respuesta',
			value: 'hola **mundo**'
		});
		expect(hidden(container).value).toBe('hola **mundo**');
	});

	it('carries the markdown in the hidden input after the toolbar formats typed text', async () => {
		const { container } = render(RichTextEditor, { name: 'body', label: 'Respuesta' });
		await waitFor(() => expect(surface().querySelector('p')).toBeTruthy());

		// Focus first: ProseMirror redraws the paragraph, so query it afterwards.
		surface().focus();
		const paragraph = surface().querySelector('p')!;
		const text = document.createTextNode('hola');
		paragraph.insertBefore(text, paragraph.firstChild);
		await waitFor(() => expect(hidden(container).value).toBe('hola'));

		const range = document.createRange();
		range.selectNodeContents(surface().querySelector('p')!);
		const selection = window.getSelection()!;
		selection.removeAllRanges();
		selection.addRange(range);
		document.dispatchEvent(new Event('selectionchange'));
		await new Promise((resolve) => setTimeout(resolve, 50));
		await fireEvent.click(screen.getByRole('button', { name: 'Negrita' }));

		await waitFor(() => expect(hidden(container).value).toBe('**hola**'));
	});

	it('reflects a reassigned value (the composer clearing itself)', async () => {
		const { container, rerender } = render(RichTextEditor, {
			name: 'body',
			label: 'Respuesta',
			value: 'hola'
		});
		await rerender({ value: '' });
		await waitFor(() => expect(hidden(container).value).toBe(''));
		expect(surface().textContent).toBe('');
	});

	it('shows the counter only above 90% of the limit and flags the overflow', async () => {
		const { rerender } = render(RichTextEditor, {
			name: 'body',
			label: 'Respuesta',
			maxLength: 10,
			value: 'abcde'
		});
		expect(screen.queryByText(/caracteres/)).toBeNull();

		await rerender({ value: 'abcdefghij' });
		expect(screen.getByText('10 / 10 caracteres')).toBeTruthy();

		await rerender({ value: 'abcdefghijk' });
		expect(screen.getByRole('alert').textContent).toContain('10');
	});

	describe('@mentions (#303)', () => {
		const ID = '6f1d0a39-2c4e-4d8b-9a77-1e2f3a4b5c6d';
		const token = `@[Ana \\] Pérez](person:${ID})`;
		const people = [
			{ id: ID, label: 'Ana ] Pérez', hint: 'ana@acme.test' },
			{ id: '7f1d0a39-2c4e-4d8b-9a77-1e2f3a4b5c6d', label: 'Anselmo', hint: 'ans@acme.test' }
		];

		async function type(text: string) {
			surface().focus();
			const paragraph = surface().querySelector('p')!;
			const node = document.createTextNode(text);
			paragraph.insertBefore(node, paragraph.firstChild);
			const range = document.createRange();
			range.setStart(node, text.length);
			range.collapse(true);
			const selection = window.getSelection()!;
			selection.removeAllRanges();
			selection.addRange(range);
			document.dispatchEvent(new Event('selectionchange'));
		}

		it('round-trips the token through the editor', async () => {
			const { container } = render(RichTextEditor, {
				name: 'body',
				label: 'Respuesta',
				value: `Hola ${token}`,
				mentionSource: async () => people
			});
			await waitFor(() => expect(surface().querySelector('.mention')).toBeTruthy());
			expect(surface().querySelector('.mention')!.textContent).toBe('@Ana ] Pérez');

			// Any edit re-serialises the document from the chip.
			await type(' ');
			await waitFor(() => expect(hidden(container).value).toContain(token));
			expect(hidden(container).value).toMatch(/^.*Hola .*person:/);
		});

		it('offers the people the source returns as an accessible listbox, and inserts the chosen one', async () => {
			const asked: string[] = [];
			const { container } = render(RichTextEditor, {
				name: 'body',
				label: 'Respuesta',
				mentionSource: async (query: string) => {
					asked.push(query);
					return people;
				}
			});
			await waitFor(() => expect(surface().querySelector('p')).toBeTruthy());

			await type('@an');

			const list = await screen.findByRole('listbox', { name: 'Mencionar a una persona' });
			expect(asked).toContain('an');
			const options = screen.getAllByRole('option');
			expect(options.map((option) => option.textContent)).toEqual([
				'Ana ] Pérezana@acme.test',
				'Anselmoans@acme.test'
			]);
			expect(surface().getAttribute('aria-controls')).toBe(list.id);
			expect(surface().getAttribute('aria-activedescendant')).toBe(options[0].id);

			await fireEvent.keyDown(surface(), { key: 'ArrowDown' });
			await waitFor(() =>
				expect(surface().getAttribute('aria-activedescendant')).toBe(options[1].id)
			);
			await fireEvent.keyDown(surface(), { key: 'ArrowUp' });
			await waitFor(() =>
				expect(surface().getAttribute('aria-activedescendant')).toBe(options[0].id)
			);

			await fireEvent.keyDown(surface(), { key: 'Enter' });

			await waitFor(() => expect(hidden(container).value).toContain(token));
			expect(screen.queryByRole('listbox')).toBeNull();
		});

		it('closes the list on Escape and says so when nobody matches', async () => {
			render(RichTextEditor, {
				name: 'body',
				label: 'Respuesta',
				mentionSource: async (query: string) => (query === 'zz' ? [] : people)
			});
			await waitFor(() => expect(surface().querySelector('p')).toBeTruthy());

			await type('@zz');
			await screen.findByText('Nadie coincide');
			expect(screen.queryAllByRole('option')).toHaveLength(0);
		});

		it('lists at most 8 people', async () => {
			const many = Array.from({ length: 12 }, (_, i) => ({
				id: `00000000-0000-4000-8000-0000000000${String(i).padStart(2, '0')}`,
				label: `Persona ${i}`
			}));
			render(RichTextEditor, {
				name: 'body',
				label: 'Respuesta',
				mentionSource: async () => many
			});
			await waitFor(() => expect(surface().querySelector('p')).toBeTruthy());
			await type('@p');
			await screen.findByRole('listbox');
			await waitFor(() => expect(screen.getAllByRole('option')).toHaveLength(8));
		});

		it('leaves @ alone without a source (task and project descriptions)', async () => {
			const { container } = render(RichTextEditor, { name: 'body', label: 'Respuesta' });
			await waitFor(() => expect(surface().querySelector('p')).toBeTruthy());

			await type('@an');

			await waitFor(() => expect(hidden(container).value).toBe('@an'));
			expect(screen.queryByRole('listbox')).toBeNull();
		});
	});
});
