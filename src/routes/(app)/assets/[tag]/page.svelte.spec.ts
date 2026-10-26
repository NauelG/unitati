import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { get, writable, type Writable } from 'svelte/store';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import Page from './+page.svelte';

const submitted = vi.hoisted(() => ({
	actions: [] as string[],
	onResult: undefined as undefined | ((event: { result: { type: 'redirect' } }) => void),
	tainted: undefined as Writable<Record<string, boolean> | undefined> | undefined
}));

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
	superForm: (_data: unknown, options: { id?: string; onResult?: typeof submitted.onResult }) => {
		const tainted = writable<Record<string, boolean> | undefined>(undefined);
		// The page builds several forms (the create-model dialog too): only the
		// edit sheet's own callbacks and tainted store are the ones under test.
		if (options?.id === 'asset-edit-sheet') {
			submitted.onResult = options.onResult;
			submitted.tainted = tainted;
		}
		return {
			form: writable({}),
			errors: writable({}),
			enhance: (form: HTMLFormElement) => {
				const onSubmit = (event: Event) => {
					event.preventDefault();
					submitted.actions.push(form.action);
				};
				form.addEventListener('submit', onSubmit);
				return { destroy: () => form.removeEventListener('submit', onSubmit) };
			},
			submitting: writable(false),
			tainted
		};
	}
}));
vi.mock('svelte-sonner', () => ({ toast: { error: vi.fn() } }));

beforeAll(() => {
	Element.prototype.scrollIntoView = () => {};
});
beforeEach(() => {
	submitted.actions = [];
	submitted.onResult = undefined;
	submitted.tainted = undefined;
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
	const { canManage, canCheckout } = permissions;
	return {
		asset,
		may: {
			printLabel: canManage,
			edit: canManage,
			changeLocation: canManage,
			changeState: canManage,
			archive: canManage,
			unarchive: false,
			comment: canManage,
			attach: canManage,
			deliver: false,
			takeBack: canCheckout,
			waiveHandover: false,
			linkTickets: false
		},
		choices: {
			people: [
				{ id: 'p-1', fullName: 'Anna Puig' },
				{ id: 'p-2', fullName: 'Bernat Soler' }
			],
			locations: [],
			deliverable: [],
			heldAssets: [],
			models: [],
			catalogues: { manufacturers: [], categories: [] }
		},
		context: { fromTicket: null },
		waiveReasonMax: 500,
		recentMonths: 6,
		editForm: {},
		modelForm: {},
		comments: [],
		rail: Promise.resolve({ timeline: [], recentTickets: 0, related: [] })
	} as never;
}

type Mutable = {
	asset: unknown;
	may: Record<string, boolean>;
	choices: Record<string, unknown>;
};

/** The asset nobody holds: the page offers the delivery instead of the take-back. */
function unheld(data: Mutable, canCheckout: boolean) {
	data.asset = { ...asset, custodianPersonId: null, custodianName: null };
	data.may = { ...data.may, deliver: canCheckout, takeBack: false };
}

const renderPage = (permissions: { canManage: boolean; canCheckout: boolean }) =>
	render(Page, { data: pageData(permissions), form: null } as never);

describe('asset record in-place editing', () => {
	it('closes the edit sheet without a discard prompt after the save redirects', async () => {
		renderPage({ canManage: true, canCheckout: false });
		await fireEvent.click(screen.getByRole('link', { name: 'Editar' }));
		expect(await screen.findByRole('button', { name: 'Guardar cambios' })).toBeTruthy();
		submitted.tainted!.set({ name: true });

		expect(submitted.onResult).toBeTypeOf('function');
		submitted.onResult!({ result: { type: 'redirect' } });

		await waitFor(() =>
			expect(screen.queryByRole('button', { name: 'Guardar cambios' })).toBeNull()
		);
		expect(get(submitted.tainted!)).toBeUndefined();
		expect(screen.queryByText(/descartar cambios/i)).toBeNull();
	});

	it('submits the edit sheet to the named save action', async () => {
		renderPage({ canManage: true, canCheckout: false });
		await fireEvent.click(screen.getByRole('link', { name: 'Editar' }));
		const save = await screen.findByRole('button', { name: 'Guardar cambios' });
		await fireEvent.submit(save.closest('form')!);
		expect(
			submitted.actions.map((action) => {
				const url = new URL(action);
				return url.pathname + url.search;
			})
		).toContain('/assets/AST-1/edit?/save');
	});

	it('opens the take-back dialog, listing what the custodian holds', async () => {
		const data = pageData({ canManage: true, canCheckout: true }) as unknown as Mutable;
		data.choices.heldAssets = [
			{ id: 'a-1', assetTag: 'AST-1', name: 'Laptop', requiresHandover: true }
		];
		render(Page, { data, form: null } as never);

		await fireEvent.click(screen.getByRole('button', { name: 'Recuperar…' }));
		expect(await screen.findByText(/Se emitirá una devolución pendiente de firma/)).toBeTruthy();
		expect(screen.queryByRole('button', { name: /^Custodia/ })).toBeNull();
	});

	it('offers the delivery dialog instead of a select when nobody holds the asset', async () => {
		const data = pageData({ canManage: true, canCheckout: true }) as unknown as Mutable;
		unheld(data, true);
		data.choices.deliverable = [
			{ id: 'a-1', assetTag: 'AST-1', name: 'Laptop', requiresHandover: true }
		];
		render(Page, { data, form: null } as never);

		await fireEvent.click(screen.getByRole('button', { name: 'Entregar…' }));
		expect(await screen.findByText(/Se emitirá una entrega pendiente de firma/)).toBeTruthy();
		expect(screen.queryByRole('button', { name: /^Custodia/ })).toBeNull();
	});

	describe('waiving the handover (ADR 0035, decision 8)', () => {
		function openDelivery(options: { canWaiveHandover: boolean; requiresHandover: boolean }) {
			const data = pageData({ canManage: true, canCheckout: true }) as unknown as Mutable;
			unheld(data, true);
			data.may.waiveHandover = options.canWaiveHandover;
			data.choices.deliverable = [
				{
					id: 'a-1',
					assetTag: 'AST-1',
					name: 'Laptop',
					requiresHandover: options.requiresHandover
				}
			];
			render(Page, { data, form: null } as never);
			return fireEvent.click(screen.getByRole('button', { name: 'Entregar…' }));
		}

		it('hides the option from someone without the permission', async () => {
			await openDelivery({ canWaiveHandover: false, requiresHandover: true });
			expect(await screen.findByText(/Se emitirá una entrega pendiente de firma/)).toBeTruthy();
			expect(screen.queryByRole('checkbox', { name: 'Dispensar la firma' })).toBeNull();
		});

		it('hides it when no handover is required, since there is nothing to waive', async () => {
			await openDelivery({ canWaiveHandover: true, requiresHandover: false });
			expect(await screen.findByText(/Ningún activo requiere firma/)).toBeTruthy();
			expect(screen.queryByRole('checkbox', { name: 'Dispensar la firma' })).toBeNull();
		});

		it('asks an admin for a reason once they choose to waive', async () => {
			await openDelivery({ canWaiveHandover: true, requiresHandover: true });
			const option = await screen.findByRole('checkbox', { name: 'Dispensar la firma' });
			expect(screen.queryByLabelText('Motivo de la dispensa')).toBeNull();

			await fireEvent.click(option);

			const reason = screen.getByLabelText('Motivo de la dispensa');
			expect(reason.hasAttribute('required')).toBe(true);
			expect(reason.getAttribute('maxlength')).toBe('500');
			expect(screen.getByText(/dispensada: no se pedirá firma/)).toBeTruthy();
		});
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
		expect(screen.getByRole('button', { name: 'Recuperar…' })).toBeTruthy();
		expect(screen.queryByRole('button', { name: /^Estado/ })).toBeNull();
		expect(screen.queryByRole('button', { name: /^Ubicación/ })).toBeNull();
		expect(screen.queryByRole('button', { name: 'Comentar' })).toBeNull();
	});

	it('shows the note composer to someone who can manage', async () => {
		renderPage({ canManage: true, canCheckout: false });
		expect(await screen.findByRole('button', { name: 'Comentar' })).toBeTruthy();
	});

	it('offers the label only to someone who can manage assets', () => {
		const { unmount } = renderPage({ canManage: true, canCheckout: false });
		const link = screen.getByRole('link', { name: 'Imprimir etiqueta' });
		expect(link.getAttribute('href')).toBe('/assets/labels?tag=AST-1');
		unmount();

		renderPage({ canManage: false, canCheckout: true });
		expect(screen.queryByRole('link', { name: 'Imprimir etiqueta' })).toBeNull();
	});
});
