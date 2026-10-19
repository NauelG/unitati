import { fireEvent, render, screen } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';
import { MAX_ATTACHMENT_BYTES } from '#lib/domain/attachments.js';
import TicketComposer from './TicketComposer.svelte';

// Not under test: SvelteKit's form enhancement needs its runtime.
vi.mock('$app/forms', () => ({ enhance: () => ({ destroy() {} }) }));

// jsdom has no `DataTransfer` and only accepts a real `FileList` in `input.files`:
// a minimal stand-in lets the component rebuild the input's list the way browsers do.
class FakeDataTransfer {
	private list: File[] = [];
	items = { add: (file: File) => void this.list.push(file) };
	get files() {
		return this.list;
	}
}
vi.stubGlobal('DataTransfer', FakeDataTransfer);
const filesByInput = new WeakMap<HTMLInputElement, File[]>();
Object.defineProperty(HTMLInputElement.prototype, 'files', {
	configurable: true,
	get(this: HTMLInputElement) {
		return filesByInput.get(this) ?? [];
	},
	set(this: HTMLInputElement, value: File[]) {
		filesByInput.set(this, [...value]);
	}
});

function file(name: string, size = 10) {
	const f = new File(['x'], name);
	Object.defineProperty(f, 'size', { value: size });
	return f;
}

function fileInput(container: HTMLElement) {
	return container.querySelector<HTMLInputElement>('input[type="file"]')!;
}

async function choose(input: HTMLInputElement, files: File[]) {
	input.files = files as unknown as FileList;
	await fireEvent.change(input);
}

describe('TicketComposer attachments', () => {
	it('offers an Adjuntar button and keeps the input in the form', () => {
		const { container } = render(TicketComposer, { action: '?/reply' });
		expect(screen.getByRole('button', { name: 'Adjuntar' })).toBeTruthy();
		expect(fileInput(container).name).toBe('files');
	});

	it('renders a chip per chosen file', async () => {
		const { container } = render(TicketComposer, { action: '?/reply' });
		await choose(fileInput(container), [file('a.pdf', 2048), file('b.png')]);
		expect(screen.getAllByRole('listitem')).toHaveLength(2);
		expect(screen.getByText('a.pdf')).toBeTruthy();
		expect(screen.getByText('2 KB')).toBeTruthy();
	});

	it('removes a file from the chips and from input.files', async () => {
		const { container } = render(TicketComposer, { action: '?/reply' });
		const input = fileInput(container);
		await choose(input, [file('a.pdf'), file('b.png')]);
		await fireEvent.click(screen.getByRole('button', { name: 'Quitar a.pdf' }));
		expect(screen.getAllByRole('listitem')).toHaveLength(1);
		expect(Array.from(input.files ?? []).map((f: File) => f.name)).toEqual(['b.png']);
	});

	it('rejects a sixth file with a message and keeps the first five', async () => {
		const { container } = render(TicketComposer, { action: '?/reply' });
		const input = fileInput(container);
		await choose(
			input,
			['1', '2', '3', '4', '5', '6'].map((n) => file(`f${n}.txt`))
		);
		expect(screen.getAllByRole('listitem')).toHaveLength(5);
		expect(input.files).toHaveLength(5);
		expect(screen.getByRole('alert').textContent).toContain('5 archivos');
	});

	it('rejects a file over 10 MiB and keeps the others', async () => {
		const { container } = render(TicketComposer, { action: '?/reply' });
		await choose(fileInput(container), [
			file('ok.txt'),
			file('huge.bin', MAX_ATTACHMENT_BYTES + 1)
		]);
		expect(screen.getAllByRole('listitem')).toHaveLength(1);
		expect(screen.getByRole('alert').textContent).toContain('huge.bin');
	});

	it('adds dropped files to the selection', async () => {
		const { container } = render(TicketComposer, { action: '?/reply' });
		await choose(fileInput(container), [file('a.pdf')]);
		const form = container.querySelector('form')!;
		const dataTransfer = { types: ['Files'], files: [file('dropped.txt')] };
		await fireEvent.dragEnter(form, { dataTransfer });
		expect(screen.getByText('Suelta los archivos para adjuntarlos')).toBeTruthy();
		await fireEvent.drop(form, { dataTransfer });
		expect(screen.getAllByRole('listitem')).toHaveLength(2);
		expect(screen.queryByText('Suelta los archivos para adjuntarlos')).toBeNull();
	});
});
