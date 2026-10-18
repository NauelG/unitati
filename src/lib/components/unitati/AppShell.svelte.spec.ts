import { render, fireEvent } from '@testing-library/svelte';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createRawSnippet, tick, type Snippet } from 'svelte';
import FolderIcon from '@lucide/svelte/icons/folder';
import AppShell from './AppShell.svelte';
import type { AppShellNavLink } from './app-shell-nav.js';

const { gotoMock } = vi.hoisted(() => ({ gotoMock: vi.fn() }));

// Not under test, and they reach for SvelteKit's public env, which jsdom has no runtime for.
vi.mock('../AppVersion.svelte', () => ({ default: () => {} }));
vi.mock('./GlobalSearch.svelte', () => ({ default: () => {} }));
vi.mock('./KeymapOverlay.svelte', () => ({ default: () => {} }));
vi.mock('$app/state', () => ({ page: { url: new URL('http://localhost/') } }));
vi.mock('$app/env', () => ({ browser: true }));
vi.mock('$app/navigation', () => ({
	afterNavigate: () => {},
	beforeNavigate: () => {},
	goto: gotoMock
}));

const links: AppShellNavLink[] = [
	{
		id: 'work',
		label: 'Proyectos',
		icon: FolderIcon,
		children: [
			{ href: '/projects', label: 'Proyectos', icon: FolderIcon, count: 2 },
			{ href: '/tasks', label: 'Tareas', icon: FolderIcon, count: 9 }
		]
	}
];

function renderShell(
	props: { currentPath?: string; settings?: Snippet<[{ rail: boolean }]> } = {}
) {
	return render(AppShell, {
		links,
		currentPath: '/',
		...props,
		children: (() => {}) as never
	});
}

function parentButton(container: HTMLElement): HTMLButtonElement {
	return container.querySelector<HTMLButtonElement>('button[aria-controls]')!;
}

describe('AppShell navigation groups', () => {
	beforeEach(() => {
		localStorage.clear();
		document.documentElement.removeAttribute('data-sidebar-collapsed');
		gotoMock.mockReset();
	});

	it('toggles with a click, flips aria-expanded and never navigates', async () => {
		const { container } = renderShell();
		const button = parentButton(container);
		expect(button.getAttribute('aria-expanded')).toBe('false');

		await fireEvent.click(button);
		expect(button.getAttribute('aria-expanded')).toBe('true');
		expect(button.closest('[data-nav-group]')?.hasAttribute('data-open')).toBe(true);

		await fireEvent.click(button);
		expect(button.getAttribute('aria-expanded')).toBe('false');
		expect(gotoMock).not.toHaveBeenCalled();
		expect(button.tagName).toBe('BUTTON');
		expect(button.hasAttribute('href')).toBe(false);
	});

	it('points aria-controls at the panel holding the children', () => {
		const { container } = renderShell();
		const panel = container.querySelector(
			`#${CSS.escape(parentButton(container).getAttribute('aria-controls')!)}`
		);
		expect([...panel!.querySelectorAll('a')].map((a) => a.getAttribute('href'))).toEqual([
			'/projects',
			'/tasks'
		]);
	});

	it('renders a count on each child and none on the parent', () => {
		const { container } = renderShell();
		// `RollingNumber` animates its digits in, so assert the count slots, not their text.
		const counts = (root: Element) => root.querySelectorAll('.font-mono').length;
		expect(counts(parentButton(container))).toBe(0);
		expect(counts(container.querySelector('.ut-nav-children')!)).toBe(2);
	});

	it('opens by itself when the current route is inside a child, and marks it', () => {
		const { container } = renderShell({ currentPath: '/tasks/42' });
		const button = parentButton(container);
		expect(button.getAttribute('aria-expanded')).toBe('true');
		expect(button.getAttribute('aria-disabled')).toBe('true');
		expect(container.querySelector('a[href="/tasks"]')?.getAttribute('aria-current')).toBe('page');
		expect(container.querySelector('a[href="/projects"]')?.hasAttribute('aria-current')).toBe(
			false
		);
	});

	it('persists a hand-opened group and restores it on the next mount', async () => {
		const first = renderShell();
		await fireEvent.click(parentButton(first.container));
		expect(JSON.parse(localStorage.getItem('unitati:nav-groups')!)).toEqual(['work']);
		first.unmount();

		const second = renderShell();
		await tick();
		expect(parentButton(second.container).getAttribute('aria-expanded')).toBe('true');
	});

	it('forgets a group the viewer closed again', async () => {
		localStorage.setItem('unitati:nav-groups', JSON.stringify(['work']));
		const { container } = renderShell();
		await tick();
		await fireEvent.click(parentButton(container));
		expect(localStorage.getItem('unitati:nav-groups')).toBeNull();
	});

	describe('in the icon rail', () => {
		beforeEach(() => document.documentElement.setAttribute('data-sidebar-collapsed', ''));

		it('opens a popover with the children from the parent icon and closes it on Escape', async () => {
			const { container, findByRole, queryByRole } = renderShell();
			await tick();
			const trigger = container.querySelector<HTMLButtonElement>('button[aria-label="Proyectos"]')!;
			expect(trigger).not.toBeNull();
			expect(container.querySelector('button[aria-controls]')).toBeNull();

			await fireEvent.click(trigger);
			const tasks = await findByRole('link', { name: /Tareas/ });
			expect(tasks.getAttribute('href')).toBe('/tasks');

			await fireEvent.keyDown(tasks, { key: 'Escape' });
			await vi.waitFor(() => expect(queryByRole('link', { name: /Tareas/ })).toBeNull());
		});
	});
});

describe('AppShell settings link', () => {
	const settings = createRawSnippet(() => ({
		render: () => '<a href="/settings">Configuración</a>'
	}));

	it('renders the settings snippet in the sidebar when one is given', () => {
		const { container } = renderShell({ settings });

		expect(container.querySelector('aside a[href="/settings"]')).not.toBeNull();
	});

	it('renders nothing when the caller passes none', () => {
		const { container } = renderShell();

		expect(container.querySelector('a[href="/settings"]')).toBeNull();
	});
});

describe('AppShell sidebar alignment and footer (#215)', () => {
	beforeEach(() => {
		localStorage.clear();
		document.documentElement.removeAttribute('data-sidebar-collapsed');
	});

	const searchButton = (container: HTMLElement) =>
		container.querySelector<HTMLButtonElement>('aside nav ul button')!;

	const fullWidth = (el: Element) => {
		const classes = [...el.classList];
		return classes.includes('w-full') && classes.includes('text-left');
	};

	it('gives every expanded button entry the full row width, left-aligned', () => {
		const { container } = renderShell();

		expect(fullWidth(searchButton(container))).toBe(true);
		expect(fullWidth(parentButton(container))).toBe(true);
	});

	it('shows no native tooltip on the search entry while its label is visible', () => {
		const { container } = renderShell();

		expect(searchButton(container).hasAttribute('title')).toBe(false);
	});

	it('keeps the collapse button in the footer, not the brand row', () => {
		const { container } = renderShell();

		expect(
			container.querySelector('aside [data-sidebar-footer] button[aria-expanded]')
		).not.toBeNull();
		expect(container.querySelector('aside .ut-brandbar button')).toBeNull();
	});

	describe('in the icon rail', () => {
		beforeEach(() => document.documentElement.setAttribute('data-sidebar-collapsed', ''));

		it('gives the search and group buttons the full width and an accessible name', async () => {
			const { container } = renderShell();
			await tick();
			const trigger = container.querySelector<HTMLButtonElement>('button[aria-label="Proyectos"]')!;

			expect(fullWidth(searchButton(container))).toBe(true);
			expect(searchButton(container).getAttribute('aria-label')).toBeTruthy();
			expect(searchButton(container).hasAttribute('title')).toBe(false);
			expect(fullWidth(trigger)).toBe(true);
		});

		it('marks a group trigger with the submenu indicator, and only a group', async () => {
			const { container } = renderShell();
			await tick();
			const trigger = container.querySelector<HTMLButtonElement>('button[aria-label="Proyectos"]')!;

			expect(trigger.querySelector('[data-nav-indicator="submenu"]')).not.toBeNull();
			expect(searchButton(container).querySelector('[data-nav-indicator]')).toBeNull();
		});

		it('keeps the collapse button in the footer', () => {
			const { container } = renderShell();

			expect(
				container.querySelector('aside [data-sidebar-footer] button[aria-expanded]')
			).not.toBeNull();
		});
	});
});
