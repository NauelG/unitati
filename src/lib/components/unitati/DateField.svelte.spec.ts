import { fireEvent, render, screen } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';
import DateField from './DateField.svelte';

function hidden(container: HTMLElement) {
	return container.querySelector<HTMLInputElement>('input[type="hidden"][name="dueDate"]')!;
}

describe('DateField', () => {
	it('posts the stored date as YYYY-MM-DD', () => {
		const { container } = render(DateField, {
			label: 'Vence',
			name: 'dueDate',
			value: '2026-11-30'
		});

		expect(hidden(container).value).toBe('2026-11-30');
	});

	it('posts an empty string when there is no date', () => {
		const { container } = render(DateField, { label: 'Vence', name: 'dueDate', value: null });

		expect(hidden(container).value).toBe('');
	});

	it('turns typed day, month and year segments into YYYY-MM-DD', async () => {
		const onchange = vi.fn();
		const { container } = render(DateField, { label: 'Vence', name: 'dueDate', onchange });

		for (const part of ['day', 'month', 'year']) {
			const segment = container.querySelector<HTMLElement>(`[data-segment="${part}"]`)!;
			segment.focus();
			const digits = { day: '30', month: '11', year: '2026' }[part]!;
			for (const key of digits) await fireEvent.keyDown(segment, { key });
		}

		expect(hidden(container).value).toBe('2026-11-30');
		expect(onchange).toHaveBeenLastCalledWith('2026-11-30');
	});

	it('clears through "Borrar" and reports null', async () => {
		const onchange = vi.fn();
		const { container } = render(DateField, {
			label: 'Vence',
			name: 'dueDate',
			value: '2026-11-30',
			onchange
		});

		await fireEvent.click(screen.getByRole('button', { name: /calendario/i }));
		await fireEvent.click(await screen.findByRole('button', { name: 'Borrar' }));

		expect(hidden(container).value).toBe('');
		expect(onchange).toHaveBeenLastCalledWith(null);
	});

	it('opens the calendar with Monday first and Spanish names', async () => {
		render(DateField, { label: 'Vence', name: 'dueDate', value: '2026-11-30' });

		await fireEvent.click(screen.getByRole('button', { name: /calendario/i }));

		const heads = (await screen.findAllByRole('columnheader')).map((h) => h.textContent?.trim());
		expect(heads[0]?.toLowerCase()).toBe('lu');
		expect(screen.getAllByText(/noviembre/i).length).toBeGreaterThan(0);
	});
});
