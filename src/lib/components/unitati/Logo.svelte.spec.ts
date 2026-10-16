import { render, screen } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import Logo from './Logo.svelte';

const acme = { productName: 'Acme Desk', customised: true };
const unitati = { productName: 'Unitati', customised: false };

describe('Logo', () => {
	it('renders the three bundled images of the lockup when not customised', () => {
		const { container } = render(Logo, { brand: unitati });

		expect(container.querySelectorAll('img')).toHaveLength(2);
		expect(container.querySelector('img[alt="Unitati"]')).not.toBeNull();
		expect(container.querySelector('[role="img"]')).toBeNull();
	});

	it('renders the single mark image when not customised', () => {
		const { container } = render(Logo, { variant: 'mark', brand: unitati });

		expect(container.querySelectorAll('img')).toHaveLength(1);
	});

	it('renders the name as a text wordmark, with no Unitati art, once customised', () => {
		const { container } = render(Logo, { brand: acme });

		const wordmark = screen.getByRole('img', { name: 'Acme Desk' });
		expect(wordmark.textContent?.trim()).toBe('Acme Desk');
		expect(container.querySelector('img')).toBeNull();
	});

	it('renders a monogram of the first letter for the customised mark', () => {
		const { container } = render(Logo, { variant: 'mark', brand: acme });

		const monogram = screen.getByRole('img', { name: 'Acme Desk' });
		expect(monogram.textContent?.trim()).toBe('A');
		expect(container.querySelector('img')).toBeNull();
	});
});
