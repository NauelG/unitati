import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import EditableHarness from '#lib/testing/EditableHarness.svelte';

// What the server answers to the next submit; the real `enhance` needs SvelteKit's runtime.
const outcome = vi.hoisted(() => ({
	result: { type: 'success' } as { type: string; data?: unknown },
	submitted: [] as FormData[]
}));

// Same contract as SvelteKit's `enhance`: run the submit function, then hand its callback the
// result. `optimisticEnhance` (the code under test) wraps this, so apply/rollback/toast are real.
vi.mock('$app/forms', () => ({
	enhance: (
		form: HTMLFormElement,
		submit: (input: {
			formData: FormData;
		}) => (opts: { result: unknown; update: () => Promise<void> }) => Promise<void>
	) => {
		const onSubmit = async (event: Event) => {
			event.preventDefault();
			const formData = new FormData(form);
			outcome.submitted.push(formData);
			const done = submit({ formData });
			await done({ result: outcome.result, update: async () => {} });
		};
		form.addEventListener('submit', onSubmit);
		return { destroy: () => form.removeEventListener('submit', onSubmit) };
	}
}));

const toastError = vi.hoisted(() => vi.fn());
vi.mock('svelte-sonner', () => ({ toast: { error: toastError } }));

// jsdom has no layout: the Command list scrolls the active item into view.
beforeAll(() => {
	Element.prototype.scrollIntoView = () => {};
});

beforeEach(() => {
	outcome.result = { type: 'success' };
	outcome.submitted = [];
	location.hash = '';
});
afterEach(() => toastError.mockClear());

const mirror = () => screen.getByTestId('mirror').textContent;
const posted = () => outcome.submitted.map((f) => f.get('field'));

// The popover is styled `visibility: hidden` in jsdom, so role queries need `hidden: true`.
async function openAndPick(trigger: RegExp, option: string) {
	await fireEvent.click(screen.getByRole('button', { name: trigger }));
	const item = await screen.findByRole('option', { name: option, hidden: true });
	await fireEvent.click(item);
}

describe.each(['chip', 'row'] as const)('%s', (component) => {
	it('submits the form with the chosen value and shows it at once', async () => {
		render(EditableHarness, { component, initial: 'new' });
		await openAndPick(/^Estado/, 'En curso');
		await waitFor(() => expect(posted()).toEqual(['in_progress']));
		expect(mirror()).toBe('in_progress');
		expect(toastError).not.toHaveBeenCalled();
	});

	it('restores the previous value and toasts when the submit fails', async () => {
		outcome.result = { type: 'failure', data: { message: 'Sin permiso.' } };
		render(EditableHarness, { component, initial: 'new' });
		await openAndPick(/^Estado/, 'Cerrado');
		await waitFor(() => expect(toastError).toHaveBeenCalledWith('Sin permiso.'));
		expect(mirror()).toBe('new');
	});

	it('does not submit when the current option is picked again', async () => {
		render(EditableHarness, { component, initial: 'new' });
		await openAndPick(/^Estado/, 'Nuevo');
		expect(posted()).toEqual([]);
	});

	it('renders no button without permission', () => {
		render(EditableHarness, { component, initial: 'new', editable: false });
		expect(screen.queryByRole('button')).toBeNull();
		expect(screen.getByText('Nuevo')).toBeTruthy();
	});

	it('opens its popover when location.hash matches openOnHash', async () => {
		location.hash = '#action-status';
		render(EditableHarness, { component, initial: 'new', openOnHash: '#action-status' });
		expect(await screen.findByRole('option', { name: 'Cerrado', hidden: true })).toBeTruthy();
	});

	it('stays closed when the hash is another one', async () => {
		location.hash = '#action-custody';
		render(EditableHarness, { component, initial: 'new', openOnHash: '#action-status' });
		await Promise.resolve();
		expect(screen.queryByRole('option', { hidden: true })).toBeNull();
	});
});

describe('EditableChip accessibility', () => {
	it('announces a listbox popup and its expanded state', async () => {
		render(EditableHarness, { component: 'chip', initial: 'new' });
		const trigger = screen.getByRole('button', { name: /^Estado/ });
		expect(trigger.getAttribute('aria-haspopup')).toBe('listbox');
		expect(trigger.getAttribute('aria-expanded')).toBe('false');
		await fireEvent.click(trigger);
		expect(trigger.getAttribute('aria-expanded')).toBe('true');
	});
});

describe('EditableText', () => {
	async function startEditing() {
		render(EditableHarness, { component: 'text', initial: 'Portátil' });
		await fireEvent.click(screen.getByRole('button', { name: /^Título/ }));
		return screen.getByRole('textbox', { name: 'Título' }) as HTMLInputElement;
	}

	it('Enter saves the new text', async () => {
		const input = await startEditing();
		await fireEvent.input(input, { target: { value: 'Portátil 14' } });
		await fireEvent.keyDown(input, { key: 'Enter' });
		await waitFor(() => expect(posted()).toEqual(['Portátil 14']));
		expect(mirror()).toBe('Portátil 14');
	});

	it('blur saves the new text', async () => {
		const input = await startEditing();
		await fireEvent.input(input, { target: { value: 'Otro' } });
		await fireEvent.blur(input);
		await waitFor(() => expect(posted()).toEqual(['Otro']));
	});

	it('Escape cancels without submitting, even though the input then blurs', async () => {
		const input = await startEditing();
		await fireEvent.input(input, { target: { value: 'Descartado' } });
		await fireEvent.keyDown(input, { key: 'Escape' });
		await fireEvent.blur(input);
		expect(posted()).toEqual([]);
		expect(mirror()).toBe('Portátil');
		expect(screen.queryByRole('textbox')).toBeNull();
	});

	it('keeps the input open and shows a validation error under it', async () => {
		render(EditableHarness, {
			component: 'text',
			initial: 'AST-1',
			error: 'Ese código ya existe.'
		});
		const input = await screen.findByRole('textbox', { name: 'Título' });
		expect(screen.getByRole('alert').textContent).toBe('Ese código ya existe.');
		expect(input.getAttribute('aria-invalid')).toBe('true');
	});
});
