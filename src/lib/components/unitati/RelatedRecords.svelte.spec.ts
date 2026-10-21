import { render, screen } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import RelatedRecords from './RelatedRecords.svelte';

describe('RelatedRecords link affordance', () => {
	it('offers Vincular in place of the empty sentence when it can link', () => {
		render(RelatedRecords, {
			groups: [],
			linkAction: '?/linkAssets',
			linkLabel: 'Vincular activo'
		});

		expect(screen.getByRole('button', { name: 'Vincular activo' })).toBeTruthy();
		expect(screen.queryByText('Todavía no hay nada relacionado.')).toBeNull();
	});

	it('draws nothing about linking without linkAction', () => {
		render(RelatedRecords, { groups: [], linkLabel: 'Vincular activo' });

		expect(screen.queryByRole('button', { name: /Vincular/ })).toBeNull();
		expect(screen.getByText('Todavía no hay nada relacionado.')).toBeTruthy();
	});
});

describe('RelatedRecords restricted records', () => {
	it('says how many it hides and draws no code, title or link for them', () => {
		const { container } = render(RelatedRecords, {
			groups: [{ relation: 'resolved_in', icon: 'task', items: [], restricted: 2 }]
		});

		expect(screen.getByText('2 elementos restringidos')).toBeTruthy();
		expect(container.querySelector('a')).toBeNull();
	});

	it('uses the singular for one', () => {
		render(RelatedRecords, {
			groups: [{ relation: 'handled_in', icon: 'project', items: [], restricted: 1 }]
		});

		expect(screen.getByText('1 elemento restringido')).toBeTruthy();
	});

	it("merges the requester's work groups into one count", () => {
		render(RelatedRecords, {
			requester: true,
			groups: [
				{ relation: 'resolved_in', icon: 'task', items: [], restricted: 1 },
				{ relation: 'handled_in', icon: 'project', items: [], restricted: 1 }
			]
		});

		expect(screen.getByText('2 elementos restringidos')).toBeTruthy();
	});
});
