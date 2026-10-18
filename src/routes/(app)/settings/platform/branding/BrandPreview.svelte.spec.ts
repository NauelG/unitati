import { render, screen } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import BrandPreview from './BrandPreview.svelte';

describe('BrandPreview', () => {
	it('explains the adjustment when the colour fails contrast on white', () => {
		render(BrandPreview, { color: '#ff6600', productName: 'Acme Desk', assets: {} });

		expect(screen.getByRole('status').textContent).toContain('Tu color original: #ff6600');
	});

	it('says nothing when the colour already passes', () => {
		render(BrandPreview, { color: '#1d5cf0', productName: 'Acme Desk', assets: {} });

		expect(screen.queryByRole('status')).toBeNull();
	});

	it('shows a light and a dark panel, and labels the dark colour', () => {
		const { container } = render(BrandPreview, {
			color: '#ff6600',
			productName: 'Acme Desk',
			assets: {}
		});

		expect(screen.getByTestId('brand-preview-light')).not.toBeNull();
		const dark = screen.getByTestId('brand-preview-dark');
		expect(dark.classList.contains('dark')).toBe(true);
		expect(dark.textContent).toMatch(/#[0-9a-f]{6}/);
		expect(container.querySelectorAll('[style*="--brand:"]')).toHaveLength(2);
	});

	it('shows the saved logos in both panels', () => {
		const { container } = render(BrandPreview, {
			color: '#1d5cf0',
			productName: 'Acme Desk',
			assets: { mark: { sha256: 'h', contentType: 'image/webp' } }
		});

		expect(container.querySelectorAll('img[src="/brand/mark?v=h"]')).toHaveLength(2);
	});
});
