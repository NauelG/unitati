import { render, screen } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import type { RelatedGroup } from '#lib/server/links/index.js';
import RelationConstellation from './RelationConstellation.svelte';

function ticketGroup(count: number): RelatedGroup {
	return {
		relation: 'affected_by',
		icon: 'ticket',
		items: Array.from({ length: count }, (_, i) => {
			const tag = `TCK-${String(i + 12).padStart(4, '0')}`;
			return {
				ref: {
					kind: 'ticket' as const,
					id: `id-${i}`,
					tag,
					title: `Ticket ${i}`,
					href: `/service-desk/${tag}`
				},
				status: 'new' as const,
				linkedAt: new Date('2026-01-01')
			};
		})
	};
}

const centre = { kind: 'asset' as const, tag: 'AST-0001' };

describe('RelationConstellation', () => {
	it('renders nothing when no record is linked', () => {
		const { container } = render(RelationConstellation, { centre, groups: [] });
		expect(container.querySelector('svg')).toBeNull();
	});

	it('shows the current record and each linked record as a link to it', () => {
		render(RelationConstellation, { centre, groups: [ticketGroup(3)] });

		const link = screen.getByRole('link', { name: /TCK-0012/ });
		expect(link.getAttribute('href')).toBe('/service-desk/TCK-0012');
		expect(screen.getAllByRole('link')).toHaveLength(3);
		expect(screen.getByText('AST-0001')).toBeTruthy();
	});

	it('names each node by kind, tag and state', () => {
		render(RelationConstellation, { centre, groups: [ticketGroup(1)] });
		expect(screen.getByRole('link', { name: 'Solicitud TCK-0012, Nuevo' })).toBeTruthy();
	});

	it('collapses more than eight relations into one counted node per kind', () => {
		render(RelationConstellation, { centre, groups: [ticketGroup(11)] });

		expect(screen.queryAllByRole('link')).toHaveLength(0);
		expect(screen.getByText('+11')).toBeTruthy();
		expect(screen.getByLabelText(/11/)).toBeTruthy();
	});

	it('hands the record morph to the clicked node, never leaving two elements with one name', () => {
		const chip = document.createElement('a');
		chip.dataset.recordRef = 'TCK-0012';
		chip.style.setProperty('view-transition-name', 'record-tck-0012');
		document.body.append(chip);

		render(RelationConstellation, { centre, groups: [ticketGroup(2)] });
		const node = screen.getByRole('link', { name: /TCK-0012/ });
		node.addEventListener('click', (event) => event.preventDefault());
		node.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

		expect(chip.style.getPropertyValue('view-transition-name')).toBe('none');
		expect(
			node
				.querySelector<HTMLElement>('[data-node-tag]')!
				.style.getPropertyValue('view-transition-name')
		).toBe('record-tck-0012');
		chip.remove();
	});
});
