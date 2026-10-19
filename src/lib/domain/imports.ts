/**
 * What the import flow shares between the server engine and the browser (ADR 0034).
 * The limits are enforced on the server; the client reads them to refuse early.
 */
export const IMPORT_MAX_BYTES = 5 * 1024 * 1024;
export const IMPORT_MAX_ROWS = 5000;

/** Where a target field gets its value: a CSV column, a literal for every row, or nowhere. */
export type FieldSource = { column: string } | { fixed: string } | null;

/** Keyed by target field key. */
export type Mapping = Record<string, FieldSource>;
