import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { writable } from 'svelte/store';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import Page from './+page.svelte';

const submitted = vi.hoisted(() => ({ actions: [] as string[] }));

vi.mock('$app/forms', () => ({
	enhance: (form: HTMLFormElement, submit: (input: { formData: FormData }) => unknown) => {
		const onSubmit = (event: Event) => {
			event.preventDefault();
			submitted.actions.push(form.getAttribute('action') ?? '');
			submit({ formData: new FormData(form) });
		};
		form.addEventListener('submit', onSubmit);
		return { destroy: () => form.removeEventListener('submit', onSubmit) };
	}
}));
vi.mock('sveltekit-superforms', () => ({
	superForm: () => ({
		form: writable({}),
		errors: writable({}),
		enhance: () => ({ destroy() {} }),
		submitting: writable(false),
		tainted: writable(undefined)
	})
}));
vi.mock('svelte-sonner', () => ({ toast: { error: vi.fn() } }));

beforeAll(() => {
	Element.prototype.scrollIntoView = () => {};
});
beforeEach(() => {
	submitted.actions = [];
	location.hash = '';
});

const asset = {
	visibility: 'full',
	id: 'a-1',
	assetTag: 'AST-1',
	name: 'Laptop',
	serial: null,
	modelName: null,
	manufacturerName: null,
	categoryName: null,
	shared: false,
	state: 'in_use',
	custodianPersonId: 'p-1',
	custodianName: 'Anna Puig',
	locationId: null,
	locationPath: null
};

function pageData(permissions: { canManage: boolean; canCheckout: boolean }) {
	return {
		asset,
		...permissions,
		canLinkTickets: false,
		recentMonths: 6,
		people: [
			{ id: 'p-1', fullName: 'Anna Puig' },
			{ id: 'p-2', fullName: 'Bernat Soler' }
		],
		locations: [],
		editModels: [],
		manufacturers: [],
		categories: [],
		editForm: {},
		modelForm: {},
		timelineRail: Promise.resolve({ timeline: [], recentTickets: 0, related: [] })
	} as never;
}

const renderPage = (permissions: { canManage: boolean; canCheckout: boolean }) =>
	render(Page, { data: pageData(permissions), form: null } as never);

describe('asset record in-place editing', () => {
	it('returns custody when "Nadie" is picked', async () => {
		renderPage({ canManage: true, canCheckout: true });
		await fireEvent.click(screen.getByRole('button', { name: /^Custodia/ }));
		await fireEvent.click(await screen.findByRole('option', { name: 'Nadie', hidden: true }));
		await waitFor(() => expect(submitted.actions).toEqual(['?/returnCustody']));
	});

	it('assigns custody when a person is picked', async () => {
		renderPage({ canManage: true, canCheckout: true });
		await fireEvent.click(screen.getByRole('button', { name: /^Custodia/ }));
		await fireEvent.click(
			await screen.findByRole('option', { name: 'Bernat Soler', hidden: true })
		);
		await waitFor(() => expect(submitted.actions).toEqual(['?/assignCustody']));
	});

	it('shows no Custodia, Estado, Ubicación or Nota panels', () => {
		renderPage({ canManage: true, canCheckout: true });
		for (const heading of ['Custodia', 'Estado', 'Ubicación', 'Nota']) {
			expect(screen.queryByRole('heading', { name: heading })).toBeNull();
		}
	});

	it('keeps the custodian read-only without assets.checkout', () => {
		renderPage({ canManage: false, canCheckout: false });
		expect(screen.queryByRole('button', { name: /^Custodia/ })).toBeNull();
		expect(screen.getByText('Anna Puig')).toBeTruthy();
	});

	it('lets a custodian-only user change custody but not state, location or notes', () => {
		renderPage({ canManage: false, canCheckout: true });
		expect(screen.getByRole('button', { name: /^Custodia/ })).toBeTruthy();
		expect(screen.queryByRole('button', { name: /^Estado/ })).toBeNull();
		expect(screen.queryByRole('button', { name: /^Ubicación/ })).toBeNull();
		expect(screen.queryByRole('button', { name: 'Añadir nota' })).toBeNull();
	});

	it('shows the note composer to someone who can manage', async () => {
		renderPage({ canManage: true, canCheckout: false });
		expect(await screen.findByRole('button', { name: 'Añadir nota' })).toBeTruthy();
	});
});
