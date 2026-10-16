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
