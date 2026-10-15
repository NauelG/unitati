/**
 * Reads the OpenAPI document the server built (ADR 0022) for the in-app
 * documentation: JSON Schema to the rows of a field table, and an operation to
 * a `curl` line. Pure on purpose: the page renders what the document says, and
 * nothing here knows about Unitati's endpoints.
 */

export type JsonSchema = Record<string, unknown>;

export interface FieldRow {
	/** Dotted path: `data.queue.id`, with `[]` for array items. */
	name: string;
	type: string;
	required: boolean;
	description: string;
}

interface Operation {
	operationId: string;
	parameters?: {
		name: string;
		in: string;
		required: boolean;
		description?: string;
		schema: JsonSchema;
	}[];
	requestBody?: { content: { 'application/json': { schema: JsonSchema; example?: unknown } } };
	responses: Record<string, { content?: { 'application/json': { schema: JsonSchema } } }>;
}

type Components = Record<string, JsonSchema>;

function resolve(schema: JsonSchema, components: Components): JsonSchema {
	const ref = schema.$ref;
	if (typeof ref !== 'string') return schema;
	return components[ref.replace('#/components/schemas/', '')] ?? {};
}

const isNull = (schema: JsonSchema) => schema.type === 'null';

/** The variants of a union, with the `null` of a nullable pulled out. */
function variantsOf(schema: JsonSchema): { variants: JsonSchema[]; nullable: boolean } | null {
	const list = (schema.anyOf ?? schema.oneOf) as JsonSchema[] | undefined;
	if (!list) return null;
	return { variants: list.filter((variant) => !isNull(variant)), nullable: list.some(isNull) };
}

function scalarLabel(schema: JsonSchema): string {
	if ('const' in schema) return JSON.stringify(schema.const);
	if (Array.isArray(schema.enum))
		return schema.enum.map((value) => JSON.stringify(value)).join(' | ');
	const type = Array.isArray(schema.type) ? schema.type.join(' | ') : schema.type;
	if (typeof type !== 'string') return 'any';
	return typeof schema.format === 'string' ? `${type} (${schema.format})` : type;
}

export function typeLabel(schema: JsonSchema, components: Components): string {
	const resolved = resolve(schema, components);
	const union = variantsOf(resolved);
	if (union) {
		const labels = union.variants.map((variant) => typeLabel(variant, components));
		return [...labels, ...(union.nullable ? ['null'] : [])].join(' | ');
	}
	if (resolved.type === 'array') {
		const items = typeLabel((resolved.items ?? {}) as JsonSchema, components);
		return items.includes(' | ') ? `(${items})[]` : `${items}[]`;
	}
	return scalarLabel(resolved);
}

function describe(schema: JsonSchema, components: Components): string {
	const own = schema.description ?? resolve(schema, components).description;
	return typeof own === 'string' ? own : '';
}

function rowsOf(
	schema: JsonSchema,
	components: Components,
	prefix: string,
	seen: readonly string[]
): FieldRow[] {
	let resolved = resolve(schema, components);
	// `T | null` descends into `T`: the null is already in its type label.
	const union = variantsOf(resolved);
	if (union?.variants.length === 1) resolved = resolve(union.variants[0], components);

	const ref = typeof schema.$ref === 'string' ? schema.$ref : undefined;
	if (ref && seen.includes(ref)) return [];
	const path = ref ? [...seen, ref] : seen;

	if (resolved.type === 'array') {
		return rowsOf((resolved.items ?? {}) as JsonSchema, components, `${prefix}[]`, path);
	}
	if (resolved.type !== 'object' || typeof resolved.properties !== 'object') return [];

	const required = new Set((resolved.required ?? []) as string[]);
	return Object.entries(resolved.properties as Record<string, JsonSchema>).flatMap(
		([name, property]) => {
			const full = prefix ? `${prefix}.${name}` : name;
			return [
				{
					name: full,
					type: typeLabel(property, components),
					required: required.has(name),
					description: describe(property, components)
				},
				...rowsOf(property, components, full, path)
			];
		}
	);
}

/** A schema flattened to one row per field, nested objects and array items included. */
export function schemaFields(schema: JsonSchema, components: Components): FieldRow[] {
	return rowsOf(schema, components, '', []);
}

/** Path and query parameters of an operation as rows. */
export function parameterFields(operation: Operation, components: Components): FieldRow[] {
	return (operation.parameters ?? []).map((parameter) => ({
		name: parameter.name,
		type: typeLabel(parameter.schema, components),
		required: parameter.required,
		description: parameter.description ?? ''
	}));
}

export function requestFields(operation: Operation, components: Components): FieldRow[] {
	const schema = operation.requestBody?.content['application/json'].schema;
	return schema ? schemaFields(schema, components) : [];
}

/** The success response: the first `2xx` that has a body. */
export function responseFields(operation: Operation, components: Components): FieldRow[] {
	for (const [status, response] of Object.entries(operation.responses)) {
		const schema = response.content?.['application/json'].schema;
		if (status.startsWith('2') && schema) return schemaFields(schema, components);
	}
	return [];
}

/**
 * A copyable `curl`. The key is always `$UNITATI_API_KEY`; a path parameter is a
 * `<placeholder>` inside quotes, because curl would treat `{tag}` as a glob.
 */
export function curlExample(
	operation: Operation & { method: string; path: string },
	serverUrl: string
): string {
	const url = `${serverUrl}${operation.path.replace(/\{(\w+)\}/g, '<$1>')}`;
	const method = operation.method.toUpperCase();
	const example = operation.requestBody?.content['application/json'].example;

	const lines = [`curl ${method === 'GET' ? '' : `-X ${method} `}"${url}"`];
	lines.push('  -H "Authorization: Bearer $UNITATI_API_KEY"');
	if (example !== undefined) {
		lines.push('  -H "Content-Type: application/json"');
		lines.push(`  -d '${JSON.stringify(example)}'`);
	}
	return lines.join(' \\\n');
}
