import { render } from '@testing-library/svelte';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { APP_VERSION } from '#lib/version.js';
import AppVersion from './AppVersion.svelte';

const state = vi.hoisted(() => ({ page: { data: { brand: { customised: false } } } }));
vi.mock('$app/state', () => state);

const ATTRIBUTION = 'Con tecnología de Unitati';

function customise(customised: boolean) {
	state.page.data.brand.customised = customised;
}

function text(container: HTMLElement): string {
	return container.textContent?.replace(/\s+/g, ' ').trim() ?? '';
}

beforeEach(() => customise(false));

describe('AppVersion', () => {
	it('is exactly the version when the brand is not customised', () => {
		const { container } = render(AppVersion);

		expect(text(container)).toBe(`v${APP_VERSION}`);
		expect(container.textContent).not.toContain('Con tecnología');
	});

	it('puts the attribution and the version on one line when customised and inline', () => {
		customise(true);
		const { container } = render(AppVersion, { layout: 'inline' });

		expect(container.children).toHaveLength(1);
		expect(text(container)).toBe(`${ATTRIBUTION} · v${APP_VERSION}`);
	});

	it('is inline by default', () => {
		customise(true);
		const { container } = render(AppVersion);

		expect(text(container)).toBe(`${ATTRIBUTION} · v${APP_VERSION}`);
	});

	it('stacks the attribution above the version when customised and stacked', () => {
		customise(true);
		const { container } = render(AppVersion, { layout: 'stacked' });

		const lines = container.querySelectorAll('[data-line]');
		expect(lines).toHaveLength(2);
		expect(lines[0].textContent?.trim()).toBe(ATTRIBUTION);
		expect(lines[1].textContent?.trim()).toBe(`v${APP_VERSION}`);
	});

	it('is plain text: no link', () => {
		customise(true);
		const { container } = render(AppVersion, { layout: 'stacked' });

		expect(container.querySelector('a')).toBeNull();
	});

	it.each([
		{},
		{ layout: 'inline' as const },
		{ layout: 'stacked' as const },
		{ class: 'hidden' },
		{ layout: 'stacked' as const, class: 'x' }
	])('always carries the attribution when customised, with props %j', (props) => {
		customise(true);
		const { container } = render(AppVersion, props);

		expect(container.textContent).toContain(ATTRIBUTION);
	});
});
