import { render } from '@testing-library/svelte';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { sourceUrl } from '#lib/source-url.js';
import { APP_SOURCE_URL, APP_VERSION } from '#lib/version.js';
import pkg from '../../../package.json' with { type: 'json' };
import AppVersion from './AppVersion.svelte';

const state = vi.hoisted(() => ({ page: { data: { brand: { customised: false } } } }));
vi.mock('$app/state', () => state);

const ATTRIBUTION = 'Con tecnología de Unitati';
const SOURCE = 'Código fuente';

function customise(customised: boolean) {
	state.page.data.brand.customised = customised;
}

function text(container: HTMLElement): string {
	return container.textContent?.replace(/\s+/g, ' ').trim() ?? '';
}

beforeEach(() => customise(false));

describe('AppVersion', () => {
	it('is the version and the source link when the brand is not customised', () => {
		const { container } = render(AppVersion);

		expect(text(container)).toBe(`v${APP_VERSION} · ${SOURCE}`);
		expect(container.textContent).not.toContain('Con tecnología');
	});

	it('puts the attribution, the version and the source link on one line when customised and inline', () => {
		customise(true);
		const { container } = render(AppVersion, { layout: 'inline' });

		expect(container.children).toHaveLength(1);
		expect(text(container)).toBe(`${ATTRIBUTION} · v${APP_VERSION} · ${SOURCE}`);
	});

	it('is inline by default', () => {
		customise(true);
		const { container } = render(AppVersion);

		expect(text(container)).toBe(`${ATTRIBUTION} · v${APP_VERSION} · ${SOURCE}`);
	});

	it('stacks the attribution above the version when customised and stacked', () => {
		customise(true);
		const { container } = render(AppVersion, { layout: 'stacked' });

		const lines = container.querySelectorAll('[data-line]');
		expect(lines).toHaveLength(2);
		expect(lines[0].textContent?.trim()).toBe(ATTRIBUTION);
		expect(lines[1].textContent?.replace(/\s+/g, ' ').trim()).toBe(`v${APP_VERSION} · ${SOURCE}`);
	});

	it('takes the source URL from package.json repository', () => {
		expect(APP_SOURCE_URL).toBe(sourceUrl(pkg.repository.url));
	});

	// AGPL-3.0 section 13: every installation offers its source, branded or not (ADR 0041).
	it.each([
		{ customised: false, props: {} },
		{ customised: false, props: { layout: 'stacked' as const } },
		{ customised: true, props: { layout: 'inline' as const } },
		{ customised: true, props: { layout: 'stacked' as const } }
	])('always links the source code, %j', ({ customised, props }) => {
		customise(customised);
		const { container } = render(AppVersion, props);

		const links = container.querySelectorAll('a');
		expect(links).toHaveLength(1);
		expect(links[0].getAttribute('href')).toBe(APP_SOURCE_URL);
		expect(links[0].textContent?.trim()).toBe(SOURCE);
		expect(links[0].getAttribute('rel')).toContain('noopener');
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
