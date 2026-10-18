/**
 * Regression guard for the type roles (#185): a size is a `text-<role>` utility
 * from `src/app.css` `@theme inline`, never an arbitrary pixel value in square
 * brackets (13px font size, 18px line-height, …). The vendored `components/ui/` folder is exempt (ADR 0011).
 * If a role is missing, add it to `app.css` and `tokens.json` instead.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { TYPE_ROLES } from '#lib/tv.js';

const ROOT = 'src';
const EXTENSIONS = ['.svelte', '.ts', '.css'];
const VENDORED = join('src', 'lib', 'components', 'ui');
const THIS_FILE = 'type-roles.guard.spec.ts';
const ARBITRARY_TYPE = /text-\[1[0-9]px\]|leading-\[1[0-9]px\]|leading-\[2[0-9]px\]/;

function listFiles(dir: string): string[] {
	return readdirSync(dir).flatMap((entry) => {
		const path = join(dir, entry);
		if (path === VENDORED) return [];
		if (statSync(path).isDirectory()) return listFiles(path);
		return EXTENSIONS.some((ext) => path.endsWith(ext)) && !path.endsWith(THIS_FILE) ? [path] : [];
	});
}

describe('type roles guard', () => {
	const files = listFiles(ROOT);

	it('found files to check', () => {
		expect(files.length).toBeGreaterThan(0);
	});

	it('leaves no arbitrary font size or line-height outside ui/', () => {
		const violations = files.flatMap((file) =>
			readFileSync(file, 'utf8')
				.split('\n')
				.flatMap((line, index) => (ARBITRARY_TYPE.test(line) ? [`${file}:${index + 1}`] : []))
		);
		expect(violations, 'use a text-<role> utility from src/app.css').toEqual([]);
	});

	it('registers every role of app.css with tv() (and nothing else)', () => {
		const css = readFileSync(join('src', 'app.css'), 'utf8');
		const declared = [...css.matchAll(/^\s*--text-([a-z0-9]+(?:-[a-z0-9]+)*):/gm)].map(
			(match) => match[1]
		);
		expect([...TYPE_ROLES].sort()).toEqual(declared.sort());
	});
});
