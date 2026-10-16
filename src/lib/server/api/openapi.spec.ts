import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { APP_VERSION } from '../../version';
import { ENDPOINTS } from './endpoints';
import { buildOpenApiDocument, type OpenApiDocument } from './openapi';
import { defineEndpoint } from './registry';

const options = { version: APP_VERSION, serverUrl: 'https://desk.example.com' };

function operationsOf(document: OpenApiDocument) {
	return Object.entries(document.paths).flatMap(([path, methods]) =>
		Object.entries(methods).map(([method, operation]) => ({ path, method, operation }))
	);
}

function refsOf(node: unknown): string[] {
	if (Array.isArray(node)) return node.flatMap(refsOf);
	if (node === null || typeof node !== 'object') return [];
	return Object.entries(node).flatMap(([key, value]) =>
		key === '$ref' && typeof value === 'string' ? [value] : refsOf(value)
	);
}

function resolves(document: unknown, ref: string): boolean {
	if (!ref.startsWith('#/')) return false;
	let node: unknown = document;
	for (const part of ref.slice(2).split('/')) {
		if (node === null || typeof node !== 'object' || !(part in node)) return false;
		node = (node as Record<string, unknown>)[part];
	}
	return node !== undefined;
}

describe('the OpenAPI document built from the real registry', () => {
	const document = buildOpenApiDocument(ENDPOINTS, options);
	const operations = operationsOf(document);

	it('is OpenAPI 3.1 at the running version, served from the instance', () => {
		expect(document.openapi).toBe('3.1.0');
		expect(document.info.version).toBe(APP_VERSION);
		expect(document.servers).toEqual([{ url: 'https://desk.example.com/api/v1' }]);
		expect(document.security).toEqual([{ bearerAuth: [] }]);
		expect(document.components.securitySchemes.bearerAuth).toEqual({
			type: 'http',
			scheme: 'bearer'
		});
	});

	it('has exactly one operation per registry entry, with its id, method and path', () => {
		expect(operations).toHaveLength(ENDPOINTS.length);
		for (const endpoint of ENDPOINTS) {
			const operation = document.paths[endpoint.path]?.[endpoint.method.toLowerCase()];
			expect(operation?.operationId, endpoint.id).toBe(endpoint.id);
		}
	});

	it('describes every operation and lists its permissions twice', () => {
		for (const { operation } of operations) {
			const endpoint = ENDPOINTS.find((candidate) => candidate.id === operation.operationId)!;
			expect(operation.summary.trim(), operation.operationId).not.toBe('');
			expect(endpoint.description?.trim(), operation.operationId).toBeTruthy();
			expect(operation.description.trim(), operation.operationId).not.toBe('');
			expect(operation['x-unitati-permissions']).toEqual([...endpoint.permissions]);
			for (const permission of endpoint.permissions) {
				expect(operation.description).toContain(`\`${permission}\``);
			}
			expect(operation.description).toContain('Requires any of:');
		}
	});

	it('resolves every $ref inside the document', () => {
		const refs = refsOf(document);
		expect(refs.length).toBeGreaterThan(0);
		for (const ref of refs) expect(resolves(document, ref), ref).toBe(true);
	});

	it('shares the ticket, the error envelope and the pagination meta as components', () => {
		expect(Object.keys(document.components.schemas)).toEqual(
			expect.arrayContaining(['Ticket', 'Error', 'PaginationMeta'])
		);
	});

	it('tags operations by domain, from the id prefix', () => {
		const byId = Object.fromEntries(
			operations.map(({ operation }) => [operation.operationId, operation])
		);
		expect(byId['tickets.list'].tags).toEqual(['Service desk']);
		expect(byId['queues.list'].tags).toEqual(['Service desk']);
		expect(byId['assets.list'].tags).toEqual(['Assets']);
		expect(document.tags).toEqual([
			{ name: 'Service desk' },
			{ name: 'Projects' },
			{ name: 'Assets' }
		]);
	});

	it('takes path parameters, query and body from the input schema', () => {
		const list = document.paths['/tickets'].get;
		expect(list.parameters?.map((parameter) => [parameter.name, parameter.in])).toEqual(
			expect.arrayContaining([
				['status', 'query'],
				['page', 'query']
			])
		);
		expect(list.requestBody).toBeUndefined();

		const comment = document.paths['/tickets/{tag}/comments'].post;
		expect(comment.parameters).toMatchObject([{ name: 'tag', in: 'path', required: true }]);
		expect(comment.requestBody?.content['application/json'].schema).toMatchObject({
			required: ['body']
		});
	});

	it('documents the escalation body as a union on its target, without the path parameter', () => {
		const escalate = document.paths['/tickets/{tag}/escalations'].post;
		const schema = escalate.requestBody?.content['application/json'].schema as {
			oneOf: { properties: Record<string, unknown> }[];
		};

		expect(schema.oneOf).toHaveLength(4);
		expect(schema.oneOf.every((variant) => 'target' in variant.properties)).toBe(true);
		expect(schema.oneOf.some((variant) => 'tag' in variant.properties)).toBe(false);
		expect(escalate.parameters).toMatchObject([{ name: 'tag', in: 'path', required: true }]);
		expect(Object.keys(escalate.responses)).toEqual(expect.arrayContaining(['201', '403', '422']));
		expect(document.paths['/tickets'].post.responses['403']).toBeUndefined();
	});

	it('answers 201, 204 and 200 as the registry says, and shares the error envelope', () => {
		expect(Object.keys(document.paths['/tickets'].post.responses)).toEqual(
			expect.arrayContaining(['201', '400', '401', '404', '409', '429'])
		);
		const unlink = document.paths['/tickets/{tag}/assets/{assetTag}'].delete;
		expect(unlink.responses['204']).toBeDefined();
		expect(unlink.responses['204'].content).toBeUndefined();
		expect(document.paths['/tickets'].get.responses['200']).toBeDefined();
		expect(document.paths['/tickets'].get.responses['409']).toBeUndefined();
		expect(document.paths['/tickets'].get.responses['429'].content).toEqual({
			'application/json': { schema: { $ref: '#/components/schemas/Error' } }
		});
	});
});

describe('a throwaway endpoint in a test registry', () => {
	it('appears in the built document with no other change', () => {
		const throwaway = defineEndpoint({
			id: 'widgets.ping',
			method: 'GET',
			path: '/widgets/{id}/ping',
			summary: 'Ping a widget.',
			permissions: ['tickets.view'],
			input: z.object({ id: z.string(), verbose: z.coerce.boolean().optional() }),
			output: z.object({ data: z.object({ pong: z.boolean() }) }),
			handler: async () => ({ data: { pong: true } })
		});

		const document = buildOpenApiDocument([...ENDPOINTS, throwaway], options);

		const operation = document.paths['/widgets/{id}/ping'].get;
		expect(operation.operationId).toBe('widgets.ping');
		expect(operation.tags).toEqual(['Widgets']);
		expect(operation.description).toContain('Ping a widget.');
		expect(operation['x-unitati-permissions']).toEqual(['tickets.view']);
		expect(operation.parameters?.map((parameter) => parameter.name)).toEqual(['id', 'verbose']);
	});
});
