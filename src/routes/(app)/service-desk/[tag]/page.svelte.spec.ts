import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import Page from './+page.svelte';

const submitted = vi.hoisted(() => [] as { action: string; data: FormData }[]);

// Same contract as SvelteKit's `enhance`; the real one needs its runtime.
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
			submitted.push({ action: form.getAttribute('action') ?? '', data: formData });
			await submit({ formData })({ result: { type: 'success' }, update: async () => {} });
		};
		form.addEventListener('submit', onSubmit);
		return { destroy: () => form.removeEventListener('submit', onSubmit) };
	}
}));
vi.mock('svelte-sonner', () => ({ toast: { error: vi.fn() } }));
vi.mock('$app/state', () => ({ page: { url: new URL('http://localhost/') } }));
vi.mock('$app/navigation', () => ({ goto: vi.fn(), invalidateAll: vi.fn() }));

beforeAll(() => {
	Element.prototype.scrollIntoView = () => {};
});
beforeEach(() => {
	submitted.length = 0;
	location.hash = '';
});

function pageData(canManage: boolean) {
	return {
		user: { name: 'Tech', personId: 'p1' },
		ticket: {
			id: 't1',
			ticketTag: 'TCK-0001',
			subject: 'Broken laptop',
			status: 'new',
			priority: 'normal',
			channel: 'portal',
			requesterName: 'Ada',
			createdAt: new Date('2026-01-01T10:00:00Z'),
			assigneePersonId: null,
			assigneeName: null,
			queueId: 'q1',
			queueName: 'Hardware',
			queueColor: null
		},
		labels: [
			{ id: 'l1', name: 'vpn', color: 'blue', description: 'Remote access', active: true },
			{ id: 'l2', name: 'viejo', color: 'gray', description: null, active: false }
		],
		thread: [],
		related: Promise.resolve([]),
		may: {
			editSubject: canManage,
			assign: canManage,
			moveToQueue: canManage,
			setLabels: canManage,
			setPriority: canManage,
			changeStatus: canManage,
			link: canManage,
			unlink: canManage,
			citePage: canManage,
			linkHandover: canManage,
			deliver: false,
			commentInternal: false,
			escalate: false,
			escalateCreate: false
		},
		follow: { canFollow: false as const },
		escalationDraft: null,
		nextStatuses: ['in_progress', 'closed'],
		choices: {
			queues: canManage ? [{ id: 'q1', name: 'Hardware', color: null }] : [],
			labels: canManage
				? [
						{ id: 'l1', name: 'vpn', color: 'blue', description: 'Remote access', active: true },
						{ id: 'l2', name: 'viejo', color: 'gray', description: null, active: false },
						{ id: 'l3', name: 'auditoría', color: 'red', description: null, active: true }
					]
				: [],
			people: canManage ? [{ id: 'p1', fullName: 'Tech' }] : [],
			inStockForRequest: []
		},
		requestedCategory: null
	};
}

const renderPage = (canManage: boolean) =>
	render(Page, { data: pageData(canManage), form: null } as never);

describe('ticket record header', () => {
	it('posts the picked status to ?/status', async () => {
		renderPage(true);
		await fireEvent.click(screen.getByRole('button', { name: /^Estado/ }));
		const options = await screen.findAllByRole('option', { hidden: true });
		// The current status plus only the allowed transitions.
		expect(options).toHaveLength(3);
		await fireEvent.click(await screen.findByRole('option', { name: 'En curso', hidden: true }));
		await waitFor(() => expect(submitted).toHaveLength(1));
		expect(submitted[0].action).toBe('?/status');
		expect(submitted[0].data.get('status')).toBe('in_progress');
	});

	it('survives the optimistic status while nextStatuses is still the old one', async () => {
		renderPage(true);
		await fireEvent.click(screen.getByRole('button', { name: /^Estado/ }));
		await fireEvent.click(await screen.findByRole('option', { name: 'En curso', hidden: true }));
		await waitFor(() => expect(submitted).toHaveLength(1));
		expect(screen.getByRole('button', { name: 'Estado: En curso' })).toBeTruthy();
		await fireEvent.click(screen.getByRole('button', { name: /^Estado/ }));
		expect(await screen.findAllByRole('option', { hidden: true })).toHaveLength(2);
	});

	it('has no Propiedades panel', () => {
		renderPage(true);
		expect(screen.queryByText('Propiedades')).toBeNull();
	});

	it('shows plain chips and rows without tickets.manage', () => {
		renderPage(false);
		expect(
			screen.queryByRole('button', { name: /^(Estado|Prioridad|Asignada a|Cola|Etiquetas)/ })
		).toBeNull();
	});

	it('shows the labels on the ticket, with the description as a tooltip, to a reader', () => {
		renderPage(false);
		expect(screen.getByText('vpn').closest('[title]')?.getAttribute('title')).toBe('Remote access');
		expect(screen.getByText('viejo')).toBeTruthy();
	});

	it('posts the whole picked label set to ?/labels, archived label included while it is kept', async () => {
		renderPage(true);
		await fireEvent.click(screen.getByRole('button', { name: /^Etiquetas/ }));
		await fireEvent.click(await screen.findByRole('option', { name: 'auditoría', hidden: true }));
		// Saves when the popover closes.
		await fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' });
		await waitFor(() => expect(submitted).toHaveLength(1));
		expect(submitted[0].action).toBe('?/labels');
		expect(submitted[0].data.getAll('labelIds').sort()).toEqual(['l1', 'l2', 'l3']);
	});
});
