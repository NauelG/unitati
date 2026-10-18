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

	describe('with uploaded art', () => {
		const art = (slot: string) => ({ sha256: `h-${slot}`, contentType: 'image/webp' });
		const withAssets = (...slots: ('lockup' | 'lockup_dark' | 'mark')[]) => ({
			...acme,
			assets: Object.fromEntries(slots.map((slot) => [slot, art(slot)]))
		});

		it('renders one image, and no wordmark, for a lockup alone', () => {
			const { container } = render(Logo, { brand: withAssets('lockup') });

			const images = container.querySelectorAll('img');
			expect(images).toHaveLength(1);
			expect(images[0].getAttribute('src')).toBe('/brand/lockup?v=h-lockup');
			expect(images[0].getAttribute('alt')).toBe('Acme Desk');
			expect(images[0].getAttribute('decoding')).toBe('async');
			expect(images[0].getAttribute('loading')).toBeNull();
			expect(container.textContent).not.toContain('Acme Desk');
		});

		it('swaps to the dark lockup through CSS, hiding the copy from assistive tech', () => {
			const { container } = render(Logo, { brand: withAssets('lockup', 'lockup_dark') });

			const [light, dark] = container.querySelectorAll('img');
			expect(container.querySelectorAll('img')).toHaveLength(2);
			expect(light.getAttribute('src')).toBe('/brand/lockup?v=h-lockup');
			expect(light.classList.contains('dark:hidden')).toBe(true);
			expect(dark.getAttribute('src')).toBe('/brand/lockup-dark?v=h-lockup_dark');
			expect(dark.getAttribute('alt')).toBe('');
			expect(dark.getAttribute('aria-hidden')).toBe('true');
			expect(dark.classList.contains('hidden')).toBe(true);
			expect(dark.classList.contains('dark:block')).toBe(true);
		});

		it('falls back to the wordmark in light when only the dark lockup exists', () => {
			const { container } = render(Logo, { brand: withAssets('lockup_dark') });

			expect(container.querySelectorAll('img')).toHaveLength(1);
			expect(container.querySelector('img')?.getAttribute('src')).toBe(
				'/brand/lockup-dark?v=h-lockup_dark'
			);
			expect(container.textContent).toContain('Acme Desk');
		});

		it('contains a wide logo inside its box', () => {
			const { container } = render(Logo, { brand: withAssets('lockup') });

			const classes = container.querySelector('img')?.classList;
			for (const name of ['w-auto', 'max-w-full', 'object-contain', 'object-left']) {
				expect(classes?.contains(name)).toBe(true);
			}
		});

		it('renders the uploaded mark for the mark variant, in both themes', () => {
			const { container } = render(Logo, { variant: 'mark', brand: withAssets('mark') });

			const images = container.querySelectorAll('img');
			expect(images).toHaveLength(1);
			expect(images[0].getAttribute('src')).toBe('/brand/mark?v=h-mark');
		});

		it('keeps the HTML monogram for the mark variant when no mark is uploaded', () => {
			const { container } = render(Logo, { variant: 'mark', brand: withAssets('lockup') });

			expect(container.querySelector('img')).toBeNull();
			expect(screen.getByRole('img', { name: 'Acme Desk' }).textContent?.trim()).toBe('A');
		});
	});
});
