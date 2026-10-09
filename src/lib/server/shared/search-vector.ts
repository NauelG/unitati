import { sql, type SQL } from 'drizzle-orm';
import { customType } from 'drizzle-orm/pg-core';

/**
 * `tsvector` has no Drizzle column type, so it gets a custom one. Typed as a
 * plain string: nothing in the application reads the vector, it only matches
 * against it in SQL, and pretending to parse it would be a lie about the value.
 */
export const tsvector = customType<{ data: string; driverData: string }>({
	dataType() {
		return 'tsvector';
	}
});

/** The text-search configurations the product uses; the choice is per field. */
export type SearchDictionary = 'simple' | 'spanish';

/**
 * A generated-column expression over `unaccent`, through the immutable wrapper
 * the first migration creates (`unaccent(text)` itself is `STABLE`, and Postgres
 * refuses a non-immutable generated expression).
 *
 * Written with bare column names rather than Drizzle column references on
 * purpose: Drizzle renders a reference as `"table"."column"`, and Postgres
 * rejects a qualified name inside a generated-column expression.
 */
export function searchVector(dictionary: SearchDictionary, expression: string): SQL {
	return sql.raw(`to_tsvector('${dictionary}', immutable_unaccent(${expression}))`);
}
