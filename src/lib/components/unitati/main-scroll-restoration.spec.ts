import type { NavigationType } from '$app/navigation';
import { describe, expect, it } from 'vitest';
import { MainScrollRestoration } from './main-scroll-restoration.js';

/** `afterNavigate`'s own type never includes `'leave'`; `'enter'` covers a fresh load. */
const FRESH_LOAD: NavigationType = 'enter';

describe('MainScrollRestoration', () => {
	it('starts a never-visited route at the top', () => {
		const restoration = new MainScrollRestoration();

		expect(restoration.resolve('/assets', 'link')).toBe(0);
	});

	it('restores a remembered position on popstate (browser Back/Forward)', () => {
		const restoration = new MainScrollRestoration();

		restoration.remember('/assets', 420);

		expect(restoration.resolve('/assets', 'popstate')).toBe(420);
	});

	it('starts at the top on any navigation type other than popstate', () => {
		const restoration = new MainScrollRestoration();

		restoration.remember('/assets', 420);

		expect(restoration.resolve('/assets', 'link')).toBe(0);
		expect(restoration.resolve('/assets', 'goto')).toBe(0);
		expect(restoration.resolve('/assets', FRESH_LOAD)).toBe(0);
	});

	it('keeps positions keyed per route', () => {
		const restoration = new MainScrollRestoration();

		restoration.remember('/assets', 420);
		restoration.remember('/service-desk', 90);

		expect(restoration.resolve('/assets', 'popstate')).toBe(420);
		expect(restoration.resolve('/service-desk', 'popstate')).toBe(90);
	});
});
