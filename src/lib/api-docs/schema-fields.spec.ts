import { describe, expect, it } from 'vitest';
import {
	curlExample,
	parameterFields,
	requestFields,
	responseFields,
	schemaFields
} from './schema-fields';

const components = {
	Person: {
		type: 'object',
		properties: { id: { type: 'string' }, name: { type: 'string', description: 'Display name.' } },
		required: ['id', 'name']
	}
};

describe('schemaFields', () => {
	it('flattens nested objects, arrays, unions and refs into rows', () => {
		const rows = schemaFields(
			{
				type: 'object',
				properties: {
					status: { type: 'string', enum: ['new', 'closed'] },
					owner: { anyOf: [{ $ref: '#/components/schemas/Person' }, { type: 'null' }] },
					tags: { type: 'array', items: { type: 'string', format: 'uuid' } }
				},
				required: ['status']
			},
			components
		);

		expect(rows).toEqual([
			{ name: 'status', type: '"new" | "closed"', required: true, description: '' },
			{ name: 'owner', type: 'object | null', required: false, description: '' },
			{ name: 'owner.id', type: 'string', required: true, description: '' },
			{ name: 'owner.name', type: 'string', required: true, description: 'Display name.' },
			{ name: 'tags', type: 'string (uuid)[]', required: false, description: '' }
		]);
	});

	it('does not loop on a schema that contains itself', () => {
		const tree = {
			Node: {
				type: 'object',
				properties: { child: { $ref: '#/components/schemas/Node' } }
			}
		};
		expect(schemaFields({ $ref: '#/components/schemas/Node' }, tree)).toHaveLength(1);
	});
});

const operation = {
	operationId: 'tickets.comment',
	method: 'post',
	path: '/tickets/{tag}/comments',
	parameters: [{ name: 'tag', in: 'path', required: true, schema: { type: 'string' } }],
	requestBody: {
		content: {
			'application/json': {
				schema: { type: 'object', properties: { body: { type: 'string' } }, required: ['body'] },
				example: { body: 'Hello' }
			}
		}
	},
	responses: {
		'201': {
			content: {
				'application/json': {
					schema: { type: 'object', properties: { data: { $ref: '#/components/schemas/Person' } } }
				}
			}
		},
		'404': {}
	}
};

describe('operation helpers', () => {
	it('reads parameters, request body and the success response', () => {
		expect(parameterFields(operation, components).map((row) => row.name)).toEqual(['tag']);
		expect(requestFields(operation, components).map((row) => row.name)).toEqual(['body']);
		expect(responseFields(operation, components).map((row) => row.name)).toEqual([
			'data',
			'data.id',
			'data.name'
		]);
	});

	it('writes a curl that uses the env var and the example body', () => {
		expect(curlExample(operation, 'https://desk.example.com/api/v1')).toBe(
			[
				'curl -X POST "https://desk.example.com/api/v1/tickets/<tag>/comments"',
				'  -H "Authorization: Bearer $UNITATI_API_KEY"',
				'  -H "Content-Type: application/json"',
				`  -d '{"body":"Hello"}'`
			].join(' \\\n')
		);
	});

	it('leaves the method out of a GET', () => {
		const get = { ...operation, method: 'get', requestBody: undefined };
		expect(curlExample(get, 'http://x/api/v1').split('\n')[0]).toBe(
			'curl "http://x/api/v1/tickets/<tag>/comments" \\'
		);
	});
});
