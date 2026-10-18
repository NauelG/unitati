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
});
