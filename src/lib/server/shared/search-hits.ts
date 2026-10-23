import { sql, type SQL, type SQLWrapper } from 'drizzle-orm';
import { codeFromScan } from '../../domain/scan';
import type { SearchDictionary } from './search-vector';

/**
 * What the domains and `search/` agree on (ADR 0002): each domain builds its own
 * scoped sub-query, in the shape below, and `search/` only composes them. The
 * domain owns its tables and its permission scope; `search/` owns the term, the
 * grouping, the ranking across domains and the limits.
 *
 * Scope belongs **inside** the sub-query. A search that fetched everything and
 * dropped the rows a viewer may not see would still know how many there were, and
 * "47 results" of which 3 render tells an employee how many machines the company
 * owns.
 */

/** The kinds of record a hit can be, in a form `search/` groups on. */
export type SearchHitKind = 'asset' | 'ticket' | 'project' | 'task' | 'person' | 'page';

/** A typed term: the words the viewer wrote, ready to be matched as a prefix query. */
export interface SearchTerm {
	/** As typed, trimmed: what an exact code is compared with. */
	raw: string;
	/** A `to_tsquery` source: every word is a prefix, joined with `&`. */
	tsquery: string;
}

/**
 * Words are letters and digits only. Everything else is dropped, so the tsquery
 * operators (`& | ! : ( )`) can never come from the viewer and a stray `'` cannot
 * make the query throw. `null` when nothing is left to search for.
 *
 * Every word is a prefix, so a half-typed word already matches. The stemmer still
 * applies to a Spanish column: "impresoras:*" and "impresora" meet at the stem.
 */
export function parseSearchTerm(input: string): SearchTerm | null {
	// A scanned label arrives as a URL: what the viewer means is the code in it.
	const raw = codeFromScan(input) ?? input.trim();
	const words = raw.match(/[\p{L}\p{N}]+/gu) ?? [];
	if (words.length === 0) return null;

	return { raw, tsquery: words.map((word) => `${word}:*`).join(' & ') };
}

function query(dictionary: SearchDictionary, term: SearchTerm): SQL {
	return sql`to_tsquery(${sql.raw(`'${dictionary}'`)}, immutable_unaccent(${term.tsquery}))`;
}

/** `vector @@ query`, unaccented on both sides like the generated columns. */
export function matches(vector: SQLWrapper, dictionary: SearchDictionary, term: SearchTerm): SQL {
	return sql`${vector} @@ ${query(dictionary, term)}`;
}

/** `lower(code) = lower(typed)`: the exact-code shortcut. */
export function isCode(code: SQLWrapper, term: SearchTerm): SQL {
	return sql`lower(${code}) = lower(${term.raw})`;
}

/**
 * An exact code outranks any amount of text relevance: `ts_rank` stays well
 * under 1, and the exact group is shown first regardless.
 */
export function rankOf(
	vector: SQLWrapper,
	dictionary: SearchDictionary,
	term: SearchTerm,
	exact: SQL
): SQL<number> {
	return sql<number>`case when ${exact} then 10 else ts_rank(${vector}, ${query(dictionary, term)}) end`;
}
