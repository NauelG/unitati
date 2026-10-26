import { fireEvent, render, screen } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import TimePanel from './TimePanel.svelte';

const props = {
	entries: [],
	totalMinutes: 0,
	types: [{ id: 'type-1', name: 'General', isDefault: true }],
	canLog: true,
	today: '2026-10-26'
};

afterEach(() => vi.useRealTimers());

async function openLogForm() {
	await fireEvent.click(screen.getByRole('button', { name: 'Registrar tiempo' }));
	return (await screen.findByRole('dialog')).querySelector<HTMLInputElement>(
		'input[type="hidden"][name="workDate"]'
	)!;
}

describe('TimePanel work date', () => {
	it("defaults to the organisation's day when the browser is still on the previous one", async () => {
		// The browser's clock says the 25th; the server says the organisation is on the 26th.
		vi.useFakeTimers({ toFake: ['Date'] });
		vi.setSystemTime(new Date(2026, 9, 25, 23, 30));
		render(TimePanel, props);

		expect((await openLogForm()).value).toBe('2026-10-26');
	});

	it("does not offer days after the organisation's today in the calendar", async () => {
		render(TimePanel, props);
		await openLogForm();

		await fireEvent.click(screen.getByRole('button', { name: /calendario/i }));
		const tomorrow = await screen.findByRole('button', { name: /27/ });
		const today = screen
			.getAllByText('26')
			.map((node) => node.closest('[data-bits-day]'))
			.find(Boolean)!;
		expect(tomorrow.closest('[data-disabled]')).not.toBeNull();
		expect(today.hasAttribute('data-disabled')).toBe(false);
	});
});
