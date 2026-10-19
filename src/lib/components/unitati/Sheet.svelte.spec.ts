import { render, screen } from '@testing-library/svelte';
import { createRawSnippet } from 'svelte';
import { describe, expect, it } from 'vitest';
import Sheet from './Sheet.svelte';

const html = (markup: string) => createRawSnippet(() => ({ render: () => markup }));

const base = { open: true, onOpenChange: () => {}, title: 'Edit AST-0231' };

describe('Sheet fields and footer', () => {
	it('wraps both regions in one form, so the submit button submits the fields', () => {
		render(Sheet, {
			...base,
			form: { action: '?/update', method: 'POST' },
			fields: html('<input aria-label="Name" />'),
			footer: html('<button type="submit">Save</button>')
		});

		const form = screen.getByLabelText('Name').closest('form');
		expect(form).not.toBeNull();
		expect(form?.getAttribute('action')).toBe('?/update');
		expect(form?.getAttribute('method')).toBe('POST');
		expect(form?.contains(screen.getByRole('button', { name: 'Save' }))).toBe(true);
	});

	it('pads the scroll region so the focus ring is not clipped, and keeps the footer outside it', () => {
		render(Sheet, {
			...base,
			form: { action: '?/update' },
			fields: html('<input aria-label="Name" />'),
			footer: html('<button type="submit">Save</button>')
		});

		const region = screen.getByLabelText('Name').parentElement as HTMLElement;
		expect(region.className).toContain('overflow-y-auto');
		expect(region.className).toMatch(/\bp-1\.5\b/);
		expect(region.contains(screen.getByRole('button', { name: 'Save' }))).toBe(false);
	});

	it('runs the form action on the form it renders', () => {
		let seen: HTMLFormElement | null = null;
		render(Sheet, {
			...base,
			form: {
				action: '?/update',
				use: (node: HTMLFormElement) => {
					seen = node;
				}
			},
			fields: html('<input aria-label="Name" />'),
			footer: html('<button type="submit">Save</button>')
		});

		expect(seen).toBe(screen.getByLabelText('Name').closest('form'));
	});

	it('still renders children as-is, for forms that build their own layout', () => {
		render(Sheet, { ...base, children: html('<form aria-label="Own"></form>') });

		expect(screen.getByRole('form', { name: 'Own' })).toBeTruthy();
	});
});
