/**
 * Regression guard for ADR 0018 (page layout vocabulary): a route file must
 * not reintroduce its own container width. `PageLayout`'s `index` and
 * `record` variants read the `--size-page-max` ceiling token and `form` is
 * the one fixed measure the vocabulary allows — nothing under `(app)`,
 * `(portal)` or `(auth)` should declare `max-w-{xs,sm,md,lg,xl,2xl,...}` on
 * its own.
 *
 * An inner element that legitimately needs a measure (a search field capped
 * at `max-w-md`, a prose line capped at `max-w-2xl`) is still allowed, but
 * only with a `layout-ok` marker comment next to it (an HTML comment can't
 * sit inside a tag's own attribute list, so "next to it" means on the match
 * line itself or on one of the two lines immediately before it) — proof the
 * width is a deliberate, reviewed exception rather than a page container
 * creeping back in.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROUTE_DIRS = ['src/routes/(app)', 'src/routes/(portal)', 'src/routes/(auth)'];

/** Tailwind's named width scale only; `max-w-[var(--size-page-max)]` (an
 * arbitrary value) is the ceiling token itself and is always allowed. */
const BANNED_MAX_WIDTH = /max-w-(xs|sm|md|lg|xl|\dxl)\b/;
const ESCAPE_HATCH = 'layout-ok';

function listSvelteFiles(dir: string): string[] {
	const entries = readdirSync(dir);
	return entries.flatMap((entry) => {
		const path = join(dir, entry);
		const stats = statSync(path);
		if (stats.isDirectory()) return listSvelteFiles(path);
		return path.endsWith('.svelte') ? [path] : [];
	});
}

/** Looks back far enough to cover a multi-line, multi-attribute component
 * invocation (an attribute list cannot host an HTML comment of its own, so
 * the marker lives on the nearest line before the tag that can carry one),
 * and a little forward too, since Prettier is free to push a comment that
 * opens a tag's content down onto its own line. */
const LOOKBACK_LINES = 20;
const LOOKAHEAD_LINES = 2;

function violationsIn(file: string): number[] {
	const lines = readFileSync(file, 'utf8').split('\n');
	const violations: number[] = [];
	lines.forEach((line, index) => {
		if (!BANNED_MAX_WIDTH.test(line)) return;
		const windowStart = Math.max(0, index - LOOKBACK_LINES);
		const windowEnd = Math.min(lines.length, index + 1 + LOOKAHEAD_LINES);
		const nearby = lines.slice(windowStart, windowEnd);
		if (!nearby.some((candidate) => candidate.includes(ESCAPE_HATCH))) {
			violations.push(index + 1);
		}
	});
	return violations;
}

describe('page layout vocabulary guard', () => {
	const files = ROUTE_DIRS.flatMap((dir) => listSvelteFiles(dir));

	it('found route files to check', () => {
		expect(files.length).toBeGreaterThan(0);
	});

	it.each(files)('%s declares no per-page max-width container', (file) => {
		const violations = violationsIn(file);
		expect(
			violations,
			`${file}: line(s) ${violations.join(', ')} declare a page-container ` +
				`max-width. Use PageLayout's variant instead, or mark a genuine ` +
				`inner-element measure with a "${ESCAPE_HATCH}" comment on the same line.`
		).toEqual([]);
	});
});
