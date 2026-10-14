import { sql, type SQL, type SQLWrapper } from 'drizzle-orm';

/**
 * The `q` filter for the domain: Spanish stemming, so "mudanzas" finds
 * "Mudanza", and unaccented on both sides, so "migracion" finds "Migración".
 * The vectors it matches against are the generated `search` columns on
 * `projects` and `tasks`.
 */
export function matchesQuery(vector: SQLWrapper, term: string): SQL {
	return sql`${vector} @@ plainto_tsquery('spanish', immutable_unaccent(${term}))`;
}
