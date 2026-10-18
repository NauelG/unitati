import { z } from 'zod';

/**
 * Schemas the API names (ADR 0022). A schema registered here becomes one entry
 * under `components.schemas` in the OpenAPI document and is `$ref`'d wherever it
 * appears, instead of being repeated in every operation.
 *
 * A registry of our own rather than `z.globalRegistry`: the global one throws
 * when an id is registered twice, which is what happens when a module is
 * evaluated again under hot reload.
 */
export const schemaNames = z.registry<{ id: string }>();

/** Gives `schema` a name in the OpenAPI document; returns it, so a declaration reads as before. */
export function named<S extends z.ZodType>(id: string, schema: S): S {
	schemaNames.add(schema, { id });
	return schema;
}

/** The one shape of every error the API answers with (`dispatch.ts`). */
export const errorEnvelopeSchema = named(
	'Error',
	z.object({
		error: z.object({
			/** Machine-readable, stable: `invalid_input`, `not_found`, `invalid_transition`... */
			code: z.string(),
			message: z.string(),
			/** Present on a `400`: one entry per field that failed, as Zod reports them. */
			issues: z
				.array(z.object({ path: z.array(z.union([z.string(), z.number()])), message: z.string() }))
				.optional(),
			/** Present on a refusal that has facts to report, such as the counts behind `in_use`. */
			details: z.record(z.string(), z.unknown()).optional()
		})
	})
);

/** `meta` of every paginated list. */
export const paginationMetaSchema = named(
	'PaginationMeta',
	z.object({
		page: z.number(),
		perPage: z.number(),
		total: z.number(),
		pageCount: z.number()
	})
);

/** The `meta` of a page, from the domain's `Page`. */
export function toMeta(result: {
	page: number;
	perPage: number;
	total: number;
	pageCount: number;
}): z.input<typeof paginationMetaSchema> {
	return {
		page: result.page,
		perPage: result.perPage,
		total: result.total,
		pageCount: result.pageCount
	};
}
