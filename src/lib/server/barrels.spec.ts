import { is } from 'drizzle-orm';
import { isPgEnum, PgTable, PgSequence } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';

/**
 * ADR 0048 rule 3: a business module's `index.ts` carries no tables, enums or
 * sequences as values. dependency-cruiser sees the `export … from './schema'`
 * edge but not the names, and cannot tell a re-export from an import that the
 * file also uses, so the invariant is checked here on the real exports.
 */
const barrels = import.meta.glob('./*/index.ts');
const BUSINESS = [
	'assets',
	'service-desk',
	'projects',
	'knowledge',
	'links',
	'directory',
	'activity',
	'notifications',
	'imports',
	'search',
	'api',
	'seed'
];

describe('business module barrels', () => {
	it('cover every business module', () => {
		const found = Object.keys(barrels).map((path) => path.split('/')[1]);
		for (const name of BUSINESS) expect(found).toContain(name);
	});

	for (const name of BUSINESS) {
		it(`${name}/index.ts exports no table, enum or sequence`, async () => {
			const module = (await barrels[`./${name}/index.ts`]()) as Record<string, unknown>;
			const offenders = Object.entries(module)
				.filter(([, value]) => is(value, PgTable) || is(value, PgSequence) || isPgEnum(value))
				.map(([exported]) => exported);
			expect(offenders).toEqual([]);
		});
	}
});
