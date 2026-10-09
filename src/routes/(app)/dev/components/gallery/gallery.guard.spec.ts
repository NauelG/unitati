/**
 * Regression guard for #85: a `unitati/*.svelte` component must have a
 * gallery manifest entry — the ratchet ADR 0011 calls "a component that is
 * not in the gallery is not finished", now that the gallery is 20 pages
 * instead of one list. An entry needs a documented exception
 * (`GALLERY_EXCEPTIONS`) to opt out, mirroring the "deliberately missing"
 * list `unitati/README.md` used to keep by hand.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { COMPONENT_MANIFEST, GALLERY_EXCEPTIONS } from './manifest.js';

const UNITATI_DIR = join(process.cwd(), 'src/lib/components/unitati');
const GALLERY_ROOT = join(process.cwd(), 'src/routes/(app)/dev/components');

function listComponentFiles(): string[] {
	return readdirSync(UNITATI_DIR).filter((entry) => entry.endsWith('.svelte'));
}

/**
 * Every `+server.ts` endpoint under the gallery route, excluding `gallery/` itself (the
 * manifest and specs, not a route). A `+server.ts` endpoint is not a page, so SvelteKit never
 * runs a parent `+layout.server.ts` `load` before it — it has to guard itself.
 */
function listGalleryEndpointFiles(dir: string): string[] {
	return readdirSync(dir, { withFileTypes: true }).flatMap((dirent) => {
		if (dirent.name === 'gallery') return [];
		const path = join(dir, dirent.name);
		if (dirent.isDirectory()) return listGalleryEndpointFiles(path);
		return dirent.name === '+server.ts' ? [path] : [];
	});
}

describe('gallery coverage guard', () => {
	const files = listComponentFiles();

	it('found components to check', () => {
		expect(files.length).toBeGreaterThan(0);
	});

	it.each(files)('%s has a gallery manifest entry or a documented exception', (file) => {
		const covered = COMPONENT_MANIFEST.some((entry) => entry.sourceFile === file);
		const excepted = GALLERY_EXCEPTIONS.some((exception) => exception.sourceFile === file);
		expect(
			covered || excepted,
			`${file} is in unitati/ but has no gallery page. Add a manifest entry in ` +
				`src/routes/(app)/dev/components/gallery/manifest.ts and a spec under ` +
				`gallery/specs/, or add a reviewed exception to GALLERY_EXCEPTIONS with a reason.`
		).toBe(true);
	});

	it('every manifest entry names a component file that actually exists', () => {
		for (const entry of COMPONENT_MANIFEST) {
			expect(
				files,
				`manifest entry "${entry.id}" names "${entry.sourceFile}", which does not exist in unitati/.`
			).toContain(entry.sourceFile);
		}
	});

	it('every manifest entry has a unique id (the route segment)', () => {
		const ids = COMPONENT_MANIFEST.map((entry) => entry.id);
		expect(new Set(ids).size).toBe(ids.length);
	});

	it('every exception names a component file that actually exists', () => {
		const stale = GALLERY_EXCEPTIONS.filter((exception) => !files.includes(exception.sourceFile));
		expect(
			stale,
			`these exceptions no longer match a real file in unitati/; remove them: ${stale
				.map((exception) => exception.sourceFile)
				.join(', ')}`
		).toEqual([]);
	});
});

describe('gallery production guard', () => {
	const guardPattern = /isProduction\(APP_ENV\)\)\s*error\(404/;

	it('the gallery layout 404s in production (ADR 0013)', () => {
		const layout = readFileSync(join(GALLERY_ROOT, '+layout.server.ts'), 'utf8');
		expect(
			guardPattern.test(layout),
			'dev/components/+layout.server.ts does not call error(404, …) when isProduction(APP_ENV) ' +
				'— every page under /dev/components inherits this guard, so it is the one place that ' +
				'must have it.'
		).toBe(true);
	});

	const endpointFiles = listGalleryEndpointFiles(GALLERY_ROOT);

	it('found endpoint files to check', () => {
		expect(endpointFiles.length).toBeGreaterThan(0);
	});

	it.each(endpointFiles)('%s 404s in production (ADR 0013)', (file) => {
		const content = readFileSync(file, 'utf8');
		expect(
			guardPattern.test(content),
			`${file} does not call error(404, …) when isProduction(APP_ENV) — a +server.ts endpoint ` +
				`is not a page, so the parent layout's guard never runs for it; it must guard itself.`
		).toBe(true);
	});
});
