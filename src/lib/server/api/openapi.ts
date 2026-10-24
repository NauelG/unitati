import { z } from 'zod';
import { defaultConflictMessage, type Endpoint, type RefusalTable } from './registry';
import { errorEnvelopeSchema, schemaNames } from './shared-schemas';

/**
 * The OpenAPI 3.1 document, generated from the endpoint registry and from
 * nothing else (ADR 0022), so it cannot drift from what is served. OpenAPI 3.1
 * uses JSON Schema 2020-12, which is what Zod 4's `z.toJSONSchema()` emits: no
 * OpenAPI library is involved.
 */

export type JsonSchema = Record<string, unknown>;

export interface OpenApiOperation {
	operationId: string;
	summary: string;
	description: string;
	tags: string[];
	/** The permissions that open this operation, "any of", machine-readable. */
	'x-unitati-permissions': string[];
	parameters?: OpenApiParameter[];
	requestBody?: {
		required: boolean;
		content: { 'application/json': { schema: JsonSchema; example?: unknown } };
	};
	responses: Record<string, OpenApiResponse>;
}

export interface OpenApiParameter {
	name: string;
	in: 'path' | 'query';
	required: boolean;
	description?: string;
	schema: JsonSchema;
}

export interface OpenApiResponse {
	description: string;
	headers?: Record<string, { description: string; schema: JsonSchema }>;
	content?: { 'application/json': { schema: JsonSchema } };
}

export interface OpenApiDocument {
	openapi: '3.1.0';
	info: { title: string; version: string; description: string };
	servers: { url: string }[];
	security: Record<string, string[]>[];
	tags: { name: string }[];
	paths: Record<string, Record<string, OpenApiOperation>>;
	components: {
		securitySchemes: Record<string, JsonSchema>;
		schemas: Record<string, JsonSchema>;
	};
}

export interface OpenApiOptions {
	/** The running app version (`src/lib/version.ts`). */
	version: string;
	/** The instance origin, without a trailing slash; `/api/v1` is appended. */
	serverUrl: string;
}

/** The tag a use-case id prefix files under; an unlisted prefix is shown capitalised. */
const TAG_BY_PREFIX: Record<string, string> = {
	tickets: 'Service desk',
	queues: 'Service desk',
	assets: 'Assets',
	tasks: 'Projects',
	projects: 'Projects',
	states: 'Projects',
	people: 'Directory',
	locations: 'Directory'
};

export function tagOf(useCaseId: string): string {
	const prefix = useCaseId.split('.')[0];
	return TAG_BY_PREFIX[prefix] ?? prefix.charAt(0).toUpperCase() + prefix.slice(1);
}

const ERROR_DESCRIPTIONS = {
	'400': 'The request is not valid. `error.issues` names each field that failed.',
	'401': 'The API key is missing, malformed, expired or revoked.',
	'403': 'The key may see the record but may not create the records the request asks for.',
	'404': 'There is no such resource, or the key may not know about it.',
	'409': 'The request conflicts with the current state, for example an illegal transition.',
	'422':
		'The request is well formed, but the domain refuses the values, for example an empty title.',
	'429': 'Too many requests. Wait `Retry-After` seconds.'
} as const;

const ERROR_REF = { $ref: '#/components/schemas/Error' };

function errorResponse(status: keyof typeof ERROR_DESCRIPTIONS): OpenApiResponse {
	return {
		description: ERROR_DESCRIPTIONS[status],
		...(status === '401'
			? {
					headers: {
						'WWW-Authenticate': { description: 'Always `Bearer`.', schema: { type: 'string' } }
					}
				}
			: {}),
		...(status === '429'
			? {
					headers: {
						'Retry-After': {
							description: 'Seconds until the next request is accepted.',
							schema: { type: 'integer' }
						}
					}
				}
			: {}),
		content: { 'application/json': { schema: ERROR_REF } }
	};
}

/**
 * The error responses a refusal table implies (ADR 0047): `404` always, `400`
 * when the endpoint has input, and `409`/`403`/`422` only where the table has
 * entries of that kind. Each status narrows `error.code` to the codes it can
 * carry and lists one line per code. Unreachable entries never appear.
 */
function tableResponses(
	entries: RefusalTable['entries'],
	hasInput: boolean
): Record<string, OpenApiResponse> {
	const codes: Record<'400' | '403' | '404' | '409' | '422', Map<string, string>> = {
		'400': new Map(),
		'403': new Map(),
		'404': new Map([['not_found', 'There is no such resource, or the key may not know about it.']]),
		'409': new Map(),
		'422': new Map()
	};
	const fields: string[] = [];

	for (const [key, entry] of Object.entries(entries)) {
		switch (entry.as) {
			case 'conflict': {
				const line = [typeof entry.message === 'string' ? entry.message : null, entry.describe]
					.filter(Boolean)
					.join(' ');
				codes['409'].set(key, line || defaultConflictMessage(key));
				break;
			}
			case 'field':
				if (!fields.includes(entry.path)) fields.push(entry.path);
				break;
			case 'forbidden':
				codes['403'].set('forbidden_create', ERROR_DESCRIPTIONS['403']);
				break;
			case 'unprocessable':
				codes['422'].set('invalid_input', ERROR_DESCRIPTIONS['422']);
				break;
			default:
				break; // not_found is always documented; unreachable never is
		}
	}
	if (hasInput) {
		codes['400'].set('invalid_input', ERROR_DESCRIPTIONS['400']);
	}

	const narrowed = (status: keyof typeof codes): OpenApiResponse => {
		const lines = [...codes[status]].map(([code, text]) => `- \`${code}\`: ${text}`);
		const intro =
			status === '400' && fields.length > 0
				? `${ERROR_DESCRIPTIONS['400']} The fields that can be rejected include ${fields.map((f) => `\`${f}\``).join(', ')}.`
				: ERROR_DESCRIPTIONS[status];
		return {
			description: status === '400' ? intro : `${intro}\n\n${lines.join('\n')}`,
			content: {
				'application/json': {
					schema: {
						allOf: [
							ERROR_REF,
							{
								type: 'object',
								properties: {
									error: {
										type: 'object',
										properties: { code: { enum: [...codes[status].keys()] } }
									}
								}
							}
						]
					}
				}
			}
		};
	};

	const responses: Record<string, OpenApiResponse> = {};
	if (hasInput) responses['400'] = narrowed('400');
	responses['404'] = narrowed('404');
	for (const status of ['403', '409', '422'] as const) {
		if (codes[status].size > 0) responses[status] = narrowed(status);
	}
	return responses;
}

interface Converted {
	schema: JsonSchema;
	defs: Record<string, JsonSchema>;
}

/** Zod to JSON Schema, with named schemas lifted out as `$defs` and pointed at `components.schemas`. */
function convert(schema: z.ZodType, io: 'input' | 'output'): Converted {
	const { $defs, ...rest } = z.toJSONSchema(schema, {
		target: 'draft-2020-12',
		io,
		unrepresentable: 'any',
		metadata: schemaNames
	}) as JsonSchema & { $defs?: Record<string, JsonSchema> };
	// The dialect is the document's to declare (OpenAPI 3.1 defaults to JSON Schema 2020-12).
	delete rest.$schema;

	return {
		schema: relocate(rest) as JsonSchema,
		defs: relocate($defs ?? {}) as Record<string, JsonSchema>
	};
}

function relocate(node: unknown): unknown {
	if (Array.isArray(node)) return node.map(relocate);
	if (node === null || typeof node !== 'object') return node;
	return Object.fromEntries(
		Object.entries(node).map(([key, value]) => [
			key,
			key === '$ref' && typeof value === 'string'
				? value.replace('#/$defs/', '#/components/schemas/')
				: relocate(value)
		])
	);
}

function pathParameterNames(path: string): string[] {
	return [...path.matchAll(/\{(\w+)\}/g)].map((match) => match[1]);
}

function describeEndpoint(endpoint: Endpoint): string {
	const permissions = endpoint.permissions.map((permission) => `\`${permission}\``).join(', ');
	return `${endpoint.description ?? endpoint.summary}\n\nRequires any of: ${permissions}.`;
}

function operationOf(endpoint: Endpoint, schemas: Record<string, JsonSchema>): OpenApiOperation {
	const input = convert(endpoint.input, 'input');
	Object.assign(schemas, input.defs);

	// A body that is a union (an escalation names its target by a discriminator) has
	// no `properties` of its own: the alternatives carry them, each with the path
	// parameters alongside.
	const variants = (input.schema.oneOf ?? input.schema.anyOf) as JsonSchema[] | undefined;
	const properties = (
		variants
			? Object.assign({}, ...variants.map((variant) => variant.properties ?? {}))
			: (input.schema.properties ?? {})
	) as Record<string, JsonSchema>;
	const required = new Set(
		(variants ? [] : ((input.schema.required ?? []) as string[])) as string[]
	);
	const pathNames = pathParameterNames(endpoint.path);
	const carriesBody = endpoint.method === 'POST' || endpoint.method === 'PATCH';

	const parameters: OpenApiParameter[] = [
		...pathNames.map((name) => ({
			name,
			in: 'path' as const,
			required: true,
			schema: properties[name] ?? { type: 'string' }
		})),
		...(carriesBody
			? []
			: Object.entries(properties)
					.filter(([name]) => !pathNames.includes(name))
					.map(([name, schema]) => ({
						name,
						in: 'query' as const,
						required: required.has(name),
						schema
					})))
	].map((parameter) => {
		const description = parameter.schema.description;
		return typeof description === 'string' ? { ...parameter, description } : parameter;
	});

	const bodyProperties = Object.fromEntries(
		Object.entries(properties).filter(([name]) => !pathNames.includes(name))
	);
	const bodyRequired = [...required].filter((name) => !pathNames.includes(name));
	const withoutPath = (variant: JsonSchema): JsonSchema => ({
		...variant,
		properties: Object.fromEntries(
			Object.entries((variant.properties ?? {}) as Record<string, JsonSchema>).filter(
				([name]) => !pathNames.includes(name)
			)
		),
		required: ((variant.required ?? []) as string[]).filter((name) => !pathNames.includes(name))
	});
	const body: OpenApiOperation['requestBody'] = variants
		? carriesBody
			? {
					required: true,
					content: {
						'application/json': {
							schema: {
								...(input.schema.discriminator
									? { discriminator: input.schema.discriminator }
									: {}),
								oneOf: variants.map(withoutPath)
							},
							...(endpoint.example === undefined ? {} : { example: endpoint.example })
						}
					}
				}
			: undefined
		: carriesBody && Object.keys(bodyProperties).length > 0
			? {
					required: bodyRequired.length > 0,
					content: {
						'application/json': {
							schema: {
								type: 'object',
								properties: bodyProperties,
								...(bodyRequired.length > 0 ? { required: bodyRequired } : {})
							},
							...(endpoint.example === undefined ? {} : { example: endpoint.example })
						}
					}
				}
			: undefined;

	const responses: Record<string, OpenApiResponse> = {};
	if (endpoint.output instanceof z.ZodNull) {
		responses['204'] = { description: 'Done. There is no body.' };
	} else {
		const output = convert(endpoint.output, 'output');
		Object.assign(schemas, output.defs);
		const status = endpoint.status ?? 200;
		responses[String(status)] = {
			description: status === 201 ? 'Created.' : 'Success.',
			...(status === 201
				? {
						headers: {
							Location: {
								description: 'The new resource, relative to the host.',
								schema: { type: 'string' }
							}
						}
					}
				: {}),
			content: { 'application/json': { schema: output.schema } }
		};
	}
	// An endpoint with no table refuses nothing: it still answers 404 for what the key cannot see.
	const derived = tableResponses(
		endpoint.refusalTable?.entries ?? {},
		parameters.length > 0 || body !== undefined
	);
	if (derived['400']) responses['400'] = derived['400'];
	responses['401'] = errorResponse('401');
	for (const status of ['403', '404', '409', '422']) {
		if (derived[status]) responses[status] = derived[status];
	}
	responses['429'] = errorResponse('429');

	return {
		operationId: endpoint.id,
		summary: endpoint.summary,
		description: describeEndpoint(endpoint),
		tags: [tagOf(endpoint.id)],
		'x-unitati-permissions': [...endpoint.permissions],
		...(parameters.length > 0 ? { parameters } : {}),
		...(body ? { requestBody: body } : {}),
		responses
	};
}

export function buildOpenApiDocument(
	registry: readonly Endpoint[],
	{ version, serverUrl }: OpenApiOptions
): OpenApiDocument {
	const schemas: Record<string, JsonSchema> = {};
	const paths: OpenApiDocument['paths'] = {};
	const tags: string[] = [];

	for (const endpoint of registry) {
		const tag = tagOf(endpoint.id);
		if (!tags.includes(tag)) tags.push(tag);
		(paths[endpoint.path] ??= {})[endpoint.method.toLowerCase()] = operationOf(endpoint, schemas);
	}

	// The error envelope is referenced by every operation, so it is always present.
	Object.assign(schemas, convert(errorEnvelopeSchema, 'output').defs);

	return {
		openapi: '3.1.0',
		info: {
			title: 'Unitati API',
			version,
			description:
				'Projects, service desk and assets over one data model. Authenticate with an API key as a bearer token; the key acts as its owner, limited to the permissions it was given.'
		},
		servers: [{ url: `${serverUrl.replace(/\/$/, '')}/api/v1` }],
		security: [{ bearerAuth: [] }],
		tags: tags.map((name) => ({ name })),
		paths,
		components: {
			securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer' } },
			schemas
		}
	};
}
