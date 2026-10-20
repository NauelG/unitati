import { render } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import type { LabelFormatKey } from '#lib/domain/label-formats.js';
import LabelSheets from './LabelSheets.svelte';

const qrSvg = '<svg viewBox="0 0 29 29"><path d="M0 0h1v1H0z"/></svg>';

function labels(count: number) {
	return Array.from({ length: count }, (_, i) => ({
		tag: `AST-${String(i + 1).padStart(4, '0')}`,
		name: `Laptop ${i + 1}`,
		qrSvg
	}));
}

function draw(format: LabelFormatKey, count: number, skip = 0, markUrl: string | null = null) {
	return render(LabelSheets, {
		labels: labels(count),
		format,
		skip,
		productName: 'Acme IT',
		markUrl
	});
}

describe('LabelSheets', () => {
	it('pads the QR by 4 modules, as a share of the QR box', () => {
		const { container } = draw('a4-3x8', 1);
		const qr = container.querySelector<HTMLElement>('.qr');
		// 29 modules + 2 × 4 quiet modules => 4 / 37.
		expect(Number(qr?.style.getPropertyValue('--quiet'))).toBeCloseTo(4 / 37, 5);
	});

	it('starts the first sheet at the chosen cell and spills onto a second sheet', () => {
		const { container } = draw('a4-3x8', 30, 5);

		const sheets = container.querySelectorAll('[data-sheet]');
		expect(sheets).toHaveLength(2);
		expect(sheets[0].querySelectorAll('[data-empty]')).toHaveLength(5);
		expect(sheets[0].children[5].getAttribute('data-label')).toBe('AST-0001');
		expect(sheets[1].children[0].getAttribute('data-label')).toBe('AST-0020');
	});

	it('prints one label per page on the roll', () => {
		const { container } = draw('roll-62x29', 3, 4);

		expect(container.querySelectorAll('[data-sheet]')).toHaveLength(3);
		expect(container.querySelectorAll('[data-empty]')).toHaveLength(0);
	});

	it('prints the tag, the owner and the name on the large format', () => {
		const { container } = draw('a4-3x8', 1);

		expect(container.textContent).toContain('AST-0001');
		expect(container.textContent).toContain('Laptop 1');
		expect(container.textContent).toContain('Propiedad de Acme IT');
	});

	it('leaves the name off the smaller formats', () => {
		for (const format of ['a4-4x10', 'roll-62x29'] as const) {
			const { container } = draw(format, 1);
			expect(container.textContent).toContain('AST-0001');
			expect(container.textContent).not.toContain('Laptop 1');
		}
	});

	it('shows the brand mark where it fits and not on the dense format', () => {
		expect(draw('a4-3x8', 1, 0, '/brand/mark?v=x').container.querySelector('img')).not.toBeNull();
		expect(draw('a4-4x10', 1, 0, '/brand/mark?v=x').container.querySelector('img')).toBeNull();
	});
});
