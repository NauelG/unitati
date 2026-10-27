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

	it('bounds the minutes of a time entry and states the duration grammar', () => {
		const operation = document.paths['/time-entries'].post;
		const schema = JSON.stringify(operation.requestBody);
		expect(schema).toContain('"minimum":1');
		expect(schema).toContain('"maximum":1440');
		expect(schema).toContain('1h 30m');
	});

	it('opens the time entry list to time.log, own entries only, and documents the kind filter', () => {
		const operation = document.paths['/time-entries'].get;
		expect(operation['x-unitati-permissions']).toEqual(['time.log', 'time.manage']);
		expect(operation.description).toContain('only the entries of the person behind it');
		const kind = JSON.stringify(
			(operation.parameters as { name: string }[]).find((parameter) => parameter.name === 'kind')
		);
		expect(kind).toContain('"ticket"');
		expect(kind).toContain('"task"');
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
		expect(byId['locations.list'].tags).toEqual(['Directory']);
		expect(byId['states.list'].tags).toEqual(['Projects']);
		expect(byId['knowledge.pages.get'].tags).toEqual(['Knowledge']);
		expect(byId['time.entries.list'].tags).toEqual(['Time']);
		expect(document.tags).toEqual([
			{ name: 'Service desk' },
			{ name: 'Projects' },
			{ name: 'Assets' },
			{ name: 'Directory' },
			{ name: 'Knowledge' },
			{ name: 'Time' }
		]);
	});

	it('documents the five location operations and the optional details on the error envelope', () => {
		const ids = operations
			.map(({ operation }) => operation.operationId)
			.filter((id) => id.startsWith('locations.'))
			.sort();
		expect(ids).toEqual([
			'locations.create',
			'locations.delete',
			'locations.get',
			'locations.list',
			'locations.update'
		]);
		expect(JSON.stringify(document.paths['/locations'].post.responses['201'])).toContain(
			'#/components/schemas/LocationResource'
		);
		expect(document.components.schemas.LocationResource).toBeDefined();

		const envelope = document.components.schemas.Error as {
			properties: { error: { properties: Record<string, unknown>; required: string[] } };
		};
		expect(envelope.properties.error.properties).toHaveProperty('details');
		expect(envelope.properties.error.required).not.toContain('details');
	});

	/** The refusal tables of the locations endpoints are the source of these responses (ADR 0047). */
	describe('the error responses derived from the locations refusal tables', () => {
		type Narrowed = {
			description: string;
			content: {
				'application/json': {
					schema: {
						allOf: [
							unknown,
							{ properties: { error: { properties: { code: { enum: string[] } } } } }
						];
					};
				};
			};
		};
		const codesOf = (response: unknown): string[] =>
			(response as Narrowed).content['application/json'].schema.allOf[1].properties.error.properties
				.code.enum;

		it('narrows the 409 of a write to the codes its table lists, with a line per code', () => {
			const create = document.paths['/locations'].post.responses;
			expect(codesOf(create['409'])).toEqual(['duplicate_name', 'duplicate_code']);
			expect(create['409'].description).toContain(
				'`duplicate_name`: A sibling location already has this name.'
			);
			expect(codesOf(document.paths['/locations/{id}'].patch.responses['409'])).toEqual([
				'duplicate_name',
				'duplicate_code'
			]);
			const remove = document.paths['/locations/{id}'].delete.responses;
			expect(codesOf(remove['409'])).toEqual(['in_use']);
			expect(remove['409'].description).toContain('`children` and `assets`');
		});

		it('names the body fields a 400 can reject, and always answers 404 as not_found', () => {
			const create = document.paths['/locations'].post.responses;
			expect(codesOf(create['400'])).toEqual(['invalid_input']);
			expect(create['400'].description).toContain('`parentId`');
			expect(codesOf(create['404'])).toEqual(['not_found']);

			const remove = document.paths['/locations/{id}'].delete.responses;
			expect(remove['400'].description).not.toContain('`parentId`');
		});

		it('advertises no 403, no 422 and, where no entry conflicts, no 409', () => {
			for (const operation of [
				document.paths['/locations'].post,
				document.paths['/locations/{id}'].patch,
				document.paths['/locations/{id}'].delete
			]) {
				expect(operation.responses['403']).toBeUndefined();
				expect(operation.responses['422']).toBeUndefined();
			}
			expect(document.paths['/locations/{id}'].get.responses['409']).toBeUndefined();
		});

		it('documents only a 404 for a read that refuses nothing, and no 409', () => {
			const list = document.paths['/tickets'].get.responses;
			expect(list['409']).toBeUndefined();
			expect(list['404']).toBeDefined();
		});

		it('leaves no error-code prose in the migrated descriptions', () => {
			for (const id of [
				'locations.get',
				'locations.delete',
				'locations.create',
				'locations.update'
			]) {
				const { operation } = operations.find((item) => item.operation.operationId === id)!;
				expect(operation.description, id).not.toMatch(/\b(409|404|in_use)\b/);
			}
		});
	});

	/** The refusal tables of the assets and knowledge endpoints are the source of these responses (ADR 0047). */
	describe('the error responses derived from the assets and knowledge refusal tables', () => {
		type Narrowed = {
			description: string;
			content: {
				'application/json': {
					schema: {
						allOf: [
							unknown,
							{ properties: { error: { properties: { code: { enum: string[] } } } } }
						];
					};
				};
			};
		};
		const codesOf = (response: unknown): string[] =>
			(response as Narrowed).content['application/json'].schema.allOf[1].properties.error.properties
				.code.enum;
		const responsesOf = (path: string, method: string) =>
			document.paths[path][method].responses as unknown as Record<string, Narrowed>;

		it('lists the exact 409 codes of the asset writes', () => {
			expect(codesOf(responsesOf('/assets', 'post')['409'])).toEqual([
				'duplicate_asset_tag',
				'duplicate_serial'
			]);
			expect(codesOf(responsesOf('/assets/{tag}/custody', 'post')['409'])).toEqual([
				'already_in_custody',
				'no_delivery_template'
			]);
			expect(codesOf(responsesOf('/assets/{tag}/custody', 'delete')['409'])).toEqual([
				'not_in_custody'
			]);
		});

		it('names the body fields a 400 can reject', () => {
			expect(responsesOf('/assets', 'post')['400'].description).toMatch(
				/`assetModelId`.*`locationId`/
			);
			expect(responsesOf('/assets/{tag}/custody', 'post')['400'].description).toContain(
				'`personId`'
			);
			expect(responsesOf('/assets/{tag}/notes', 'post')['400'].description).toContain('`text`');
			expect(responsesOf('/pages', 'post')['400'].description).toMatch(
				/`spaceId`.*`parentTag`.*`body`/
			);
		});

		it('stops advertising a 409 on asset writes that cannot conflict', () => {
			expect(responsesOf('/assets/{tag}/state', 'post')['409']).toBeUndefined();
			expect(responsesOf('/assets/{tag}/location', 'post')['409']).toBeUndefined();
			expect(responsesOf('/assets/{tag}/notes', 'post')['409']).toBeUndefined();
		});

		it('never advertises the waiver failures, which the API cannot reach', () => {
			const codes = codesOf(responsesOf('/assets/{tag}/custody', 'post')['409']);
			expect(codes).not.toContain('waive_forbidden');
			expect(codes).not.toContain('no_assets');
		});

		it('lists the 409 codes of the page writes, with the details of the keyed ones', () => {
			expect(codesOf(responsesOf('/pages/{tag}', 'patch')['409'])).toEqual([
				'archived',
				'stale_revision'
			]);
			expect(responsesOf('/pages/{tag}', 'patch')['409'].description).toContain('`savedAt`');
			const move = responsesOf('/pages/{tag}/move', 'post')['409'];
			expect(codesOf(move)).toEqual([
				'archived',
				'space_archived',
				'parent_archived',
				'cycle',
				'parent_unpublished',
				'not_siblings',
				'confirmation_required',
				'count_changed'
			]);
			expect(move.description).toContain('`subtreeCount`');
			expect(codesOf(responsesOf('/pages/{tag}/archive', 'post')['404'])).toEqual(['not_found']);
			expect(responsesOf('/pages/{tag}/archive', 'post')['409']).toBeUndefined();
			expect(codesOf(responsesOf('/pages/{tag}/archive', 'delete')['409'])).toEqual([
				'space_archived',
				'parent_archived'
			]);
		});

		it('lists the remaining 409 and 400 enums of the asset and page writes', () => {
			expect(codesOf(responsesOf('/assets/{tag}', 'patch')['409'])).toEqual([
				'duplicate_asset_tag',
				'duplicate_serial'
			]);
			expect(responsesOf('/assets/{tag}', 'patch')['400'].description).toContain('`assetModelId`');
			expect(responsesOf('/assets/{tag}/location', 'post')['400'].description).toContain(
				'`locationId`'
			);
			expect(codesOf(responsesOf('/pages', 'post')['409'])).toEqual([
				'space_archived',
				'parent_archived'
			]);
			expect(codesOf(responsesOf('/pages/{tag}/publish', 'post')['409'])).toEqual([
				'archived',
				'parent_unpublished'
			]);
			expect(codesOf(responsesOf('/pages/{tag}/archive', 'delete')['409'])).not.toContain(
				'not_archived'
			);
		});

		it('leaves no error-code prose in the migrated descriptions', () => {
			for (const operation of operations.map((item) => item.operation)) {
				if (
					!/^(assets\.(register|update|custody|state|location|note)|knowledge\.pages\.(create|update|move|publish|archive|unarchive))/.test(
						operation.operationId
					)
				)
					continue;
				expect(operation.description, operation.operationId).not.toMatch(
					/\b(409|400|stale_revision|not_in_custody|no_delivery_template|duplicate_\w+|parent_unpublished)\b/
				);
			}
		});
	});

	/** The refusal tables of the project and task endpoints are the source of these responses (ADR 0047). */
	describe('the error responses derived from the project and task refusal tables', () => {
		type Narrowed = {
			description: string;
			content: {
				'application/json': {
					schema: {
						allOf: [
							unknown,
							{ properties: { error: { properties: { code: { enum: string[] } } } } }
						];
					};
				};
			};
		};
		const codesOf = (response: unknown): string[] =>
			(response as Narrowed).content['application/json'].schema.allOf[1].properties.error.properties
				.code.enum;
		const responsesOf = (path: string, method: string) =>
			document.paths[path][method].responses as unknown as Record<string, Narrowed>;

		it('lists the exact 409 codes of the task writes, and the fields a 400 names', () => {
			const assign = responsesOf('/tasks/{tag}/assignees', 'post');
			expect(codesOf(assign['409'])).toEqual(['project_archived', 'not_a_member']);
			expect(assign['400'].description).toContain('`personId`');
			expect(codesOf(responsesOf('/projects/{tag}/tasks', 'post')['409'])).toEqual([
				'project_archived',
				'duplicate_task_tag',
				'parent_is_subtask',
				'parent_closed'
			]);
			expect(responsesOf('/projects/{tag}/tasks', 'post')['400'].description).toContain(
				'`stateId`'
			);
			expect(responsesOf('/projects/{tag}/tasks', 'post')['400'].description).toContain(
				'`parentTag`'
			);
			expect(codesOf(responsesOf('/tasks/{tag}/state', 'post')['409'])).toEqual([
				'project_archived',
				'invalid_neighbours',
				'open_subtasks',
				'parent_closed'
			]);
		});

		it('lists the subtask conflicts of setting a parent, and none of removing one (ADR 0055)', () => {
			const set = responsesOf('/tasks/{tag}/parent', 'post');
			expect(codesOf(set['409'])).toEqual([
				'project_archived',
				'parent_is_subtask',
				'task_has_subtasks',
				'parent_closed'
			]);
			expect(set['400'].description).toContain('`parentTag`');

			const remove = responsesOf('/tasks/{tag}/parent', 'delete');
			expect(codesOf(remove['409'])).toEqual(['project_archived']);
		});

		it('lists the reparent conflicts, with the computed assignees_not_members', () => {
			const reparent = responsesOf('/tasks/{tag}/project', 'post');
			expect(codesOf(reparent['409'])).toEqual([
				'project_archived',
				'same_project',
				'assignees_not_members'
			]);
			expect(reparent['409'].description).toContain('members-only');
		});

		it('answers a person in the path as 404 and stops advertising a 400 field for it', () => {
			const unassign = responsesOf('/tasks/{tag}/assignees/{personId}', 'delete');
			expect(codesOf(unassign['404'])).toEqual(['not_found']);
			expect(codesOf(unassign['409'])).toEqual(['project_archived', 'not_a_member']);
			expect(unassign['400'].description).not.toContain('`personId`');
		});

		it('lists the project writes, and no 409 where nothing can conflict', () => {
			expect(codesOf(responsesOf('/projects', 'post')['409'])).toEqual(['duplicate_project_tag']);
			expect(responsesOf('/projects', 'post')['400'].description).toContain('`ownerPersonId`');
			expect(codesOf(responsesOf('/projects/{tag}', 'patch')['409'])).toEqual([
				'project_archived',
				'duplicate_project_tag'
			]);
			expect(responsesOf('/projects/{tag}/archive', 'post')['409']).toBeUndefined();
			expect(responsesOf('/projects/{tag}/archive', 'delete')['409']).toBeUndefined();
		});

		it('leaves no error-code prose in the migrated descriptions', () => {
			for (const operation of operations.map((item) => item.operation)) {
				if (
					!/^(projects\.(create|update)|tasks\.(create|update|move|reparent|assign|unassign))$/.test(
						operation.operationId
					)
				)
					continue;
				expect(operation.description, operation.operationId).not.toMatch(
					/\b(409|400|project_archived|same_project|assignees_not_members|duplicate_\w+)\b/
				);
			}
		});
	});

	/** The refusal tables of the service desk endpoints are the source of these responses (ADR 0047). */
	describe('the error responses derived from the service desk refusal tables', () => {
		type Narrowed = {
			description: string;
			content: {
				'application/json': {
					schema: {
						allOf: [
							unknown,
							{ properties: { error: { properties: { code: { enum: string[] } } } } }
						];
					};
				};
			};
		};
		const codesOf = (response: unknown): string[] =>
			(response as Narrowed).content['application/json'].schema.allOf[1].properties.error.properties
				.code.enum;
		const responsesOf = (path: string, method: string) =>
			document.paths[path][method].responses as unknown as Record<string, Narrowed>;

		it('lists the codes of ticket create, with the requester as a field and no attachment codes', () => {
			const create = responsesOf('/tickets', 'post');
			expect(codesOf(create['409'])).toEqual(['duplicate_ticket_tag']);
			expect(create['400'].description).toContain('`requesterPersonId`');
			expect(create['403']).toBeUndefined();
			expect(JSON.stringify(create)).not.toContain('attachments_too');
		});

		it('lists time_tracking_disabled as the 409 of GET /time-entry-types', () => {
			expect(codesOf(responsesOf('/time-entry-types', 'get')['409'])).toEqual([
				'time_tracking_disabled'
			]);
		});

		it('lists the transition conflict, and no 409 on the writes that cannot conflict', () => {
			expect(codesOf(responsesOf('/tickets/{tag}/status', 'post')['409'])).toEqual([
				'invalid_transition'
			]);
			for (const path of ['priority', 'assignee', 'queue']) {
				expect(responsesOf(`/tickets/${'{tag}'}/${path}`, 'post')['409'], path).toBeUndefined();
			}
			expect(responsesOf('/tickets/{tag}/assets', 'post')['409']).toBeUndefined();
			expect(responsesOf('/tickets/{tag}/assets/{assetTag}', 'delete')['409']).toBeUndefined();
		});

		it('turns an over-long comment into a 400 on body, and keeps the citation conflicts', () => {
			const comment = responsesOf('/tickets/{tag}/comments', 'post');
			expect(comment['400'].description).toContain('`body`');
			expect(codesOf(comment['409'])).toEqual(['page_not_public', 'page_not_citable']);
			expect(JSON.stringify(comment)).not.toContain('body_too_long');
			expect(JSON.stringify(comment)).not.toContain('attachments_too');
		});

		it('lists the escalation refusals by status', () => {
			const escalate = responsesOf('/tickets/{tag}/escalations', 'post');
			expect(codesOf(escalate['403'])).toEqual(['forbidden_create']);
			expect(codesOf(escalate['409'])).toEqual(['project_archived']);
			expect(codesOf(escalate['422'])).toEqual(['invalid_input']);
		});

		it('leaves no error-code prose in the migrated descriptions', () => {
			for (const operation of operations.map((item) => item.operation)) {
				if (!/^tickets\.(create|status|escalate)$/.test(operation.operationId)) continue;
				expect(operation.description, operation.operationId).not.toMatch(
					/\b(409|403|422|invalid_transition|project_archived)\b/
				);
			}
		});
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
