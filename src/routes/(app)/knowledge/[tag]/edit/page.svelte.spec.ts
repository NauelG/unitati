import { render, screen, waitFor } from '@testing-library/svelte';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import Page from './+page.svelte';

const navigation = vi.hoisted(() => ({
	guard: null as null | ((navigation: unknown) => void)
}));

vi.mock('$app/forms', () => ({ enhance: () => ({ destroy: () => {} }) }));
vi.mock('$app/navigation', () => ({
	goto: vi.fn(),
	beforeNavigate: (guard: (navigation: unknown) => void) => {
		navigation.guard = guard;
	}
}));

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

const data = {
	page: {
		id: 'p1',
		tag: 'DOC-0012',
		title: 'VPN',
		body: 'Versión guardada',
		revision: 1,
		status: 'published' as const
	},
	space: { id: 's1', name: 'Ayuda' },
	path: []
};

const hiddenBody = (container: HTMLElement) =>
	container.querySelector<HTMLInputElement>('input[type="hidden"][name="body"]')!;

describe('/knowledge/[tag]/edit', () => {
	it('opens on the page’s own title, text and revision', () => {
		const { container } = render(Page, { data, form: null } as never);

		expect(screen.getByRole<HTMLInputElement>('textbox', { name: 'Título' }).value).toBe('VPN');
		expect(hiddenBody(container).value).toBe('Versión guardada');
		expect(container.querySelector<HTMLInputElement>('input[name="baseRevision"]')!.value).toBe(
			'1'
		);
		expect(screen.queryByText(/guardó una versión nueva/)).toBeNull();
	});

	it('keeps the user’s title and text after a stale save, and says who saved', async () => {
		const { container } = render(Page, {
			data,
			form: {
				title: 'VPN de Tom',
				body: 'Mi texto **sin guardar**',
				baseRevision: '1',
				message: null,
				stale: { revision: 2, authorName: 'Ada Admin', savedAt: new Date() }
			}
		} as never);

		expect(screen.getByRole<HTMLInputElement>('textbox', { name: 'Título' }).value).toBe(
			'VPN de Tom'
		);
		expect(hiddenBody(container).value).toBe('Mi texto **sin guardar**');
		await waitFor(() =>
			expect(screen.getByRole('textbox', { name: 'Contenido' }).textContent).toContain(
				'Mi texto sin guardar'
			)
		);
		// The base stays the one the user started from: saving again is refused again.
		expect(container.querySelector<HTMLInputElement>('input[name="baseRevision"]')!.value).toBe(
			'1'
		);

		expect(screen.getByText('Ada Admin guardó una versión nueva mientras editabas.')).toBeTruthy();
		const current = screen.getByRole('link', { name: 'Ver la versión actual' });
		expect(current.getAttribute('href')).toBe('/knowledge/DOC-0012');
		expect(current.getAttribute('target')).toBe('_blank');
		expect(screen.getByRole('button', { name: 'Copiar mi texto' })).toBeTruthy();
	});

	it('lets an unchanged form leave without asking', () => {
		render(Page, { data, form: null } as never);
		const clean = {
			type: 'link',
			to: { url: new URL('http://localhost/knowledge') },
			cancel: vi.fn()
		};
		navigation.guard!(clean);
		expect(clean.cancel).not.toHaveBeenCalled();
	});

	it('cancels a navigation away from a changed form and opens the confirmation', async () => {
		render(Page, {
			data,
			form: {
				title: 'Cambiado',
				body: 'Versión guardada',
				baseRevision: '1',
				message: 'x',
				stale: null
			}
		} as never);
		const away = {
			type: 'link',
			to: { url: new URL('http://localhost/knowledge') },
			cancel: vi.fn()
		};
		navigation.guard!(away);

		expect(away.cancel).toHaveBeenCalled();
		const dialog = await screen.findByRole('alertdialog');
		expect(dialog.textContent).toContain('Tienes cambios sin guardar en VPN');
	});
});
