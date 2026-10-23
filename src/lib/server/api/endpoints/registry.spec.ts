import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { refusalTable, resolveRefusal, defineEndpoint, ApiError } from '../registry';
import { z } from 'zod';
import { ENDPOINTS } from './index';

/** The registry is the one description of the API (ADR 0022): an entry that is not described cannot ship. */
describe('the endpoint registry', () => {
	it('declares every service-desk use case', () => {
		const ids = ENDPOINTS.map((endpoint) => endpoint.id);

		expect(ids).toEqual(
			expect.arrayContaining([
				'tickets.list',
				'tickets.get',
				'tickets.create',
				'tickets.thread',
				'tickets.comment',
				'tickets.status',
				'tickets.priority',
				'tickets.assign',
				'tickets.queue',
				'tickets.assets.link',
				'tickets.assets.unlink',
				'tickets.escalate',
				'tickets.work.list',
				'tickets.task.unlink',
				'tickets.project.unlink',
				'tasks.tickets.list',
				'projects.tickets.list',
				'queues.list'
			])
		);
	});

	it('gives every entry a unique id, a summary, permissions and Zod schemas', () => {
		for (const endpoint of ENDPOINTS) {
			expect(endpoint.summary.trim(), endpoint.id).not.toBe('');
			expect(endpoint.permissions.length, endpoint.id).toBeGreaterThan(0);
			expect(typeof endpoint.input.safeParse, endpoint.id).toBe('function');
			expect(typeof endpoint.output.safeParse, endpoint.id).toBe('function');
		}
		expect(new Set(ENDPOINTS.map((endpoint) => endpoint.id)).size).toBe(ENDPOINTS.length);
	});

	it('never serves a PATCH on tickets: every change to a ticket is a rule', () => {
		const patched = ENDPOINTS.filter((endpoint) => endpoint.method === 'PATCH');
		expect(patched.filter((endpoint) => endpoint.id.startsWith('tickets.'))).toEqual([]);
	});

	it('serves a PATCH only where a field edit has no transition rule (ADR 0022)', () => {
		const patched = ENDPOINTS.filter((endpoint) => endpoint.method === 'PATCH');
		expect(patched.map((endpoint) => endpoint.id)).toEqual([
			'assets.update',
			'locations.update',
			'projects.update',
			'tasks.update',
			'knowledge.pages.update'
		]);
	});

	it('declares every asset use case, each with a description and an example where it writes', () => {
		const assets = ENDPOINTS.filter((endpoint) => endpoint.id.startsWith('assets.'));

		expect(assets.map((endpoint) => endpoint.id).sort()).toEqual(
			[
				'assets.list',
				'assets.get',
				'assets.timeline',
				'assets.register',
				'assets.update',
				'assets.custody.assign',
				'assets.custody.return',
				'assets.state',
				'assets.location',
				'assets.note'
			].sort()
		);
		for (const endpoint of assets) {
			expect(endpoint.description?.trim(), endpoint.id).toBeTruthy();
			if (endpoint.method === 'POST' || endpoint.method === 'PATCH') {
				expect(endpoint.example, endpoint.id).toBeDefined();
			}
		}
	});

	/** The registry's permissions are the gate the UI route applies: they may not drift apart. */
	it('gates each asset write with exactly the permission its route action requires', () => {
		const route = readFileSync(
			new URL('../../../../routes/(app)/assets/[tag]/+page.server.ts', import.meta.url),
			'utf8'
		);
		const routePermission = (action: string) => {
			const body = route.slice(route.indexOf(`\t${action}: async`));
			return /requirePermission\(locals\.user, '([\w.]+)'\)/.exec(body)?.[1];
		};
		const byId = new Map(ENDPOINTS.map((endpoint) => [endpoint.id, endpoint]));
		const pairs = {
			'assets.custody.assign': 'deliver',
			'assets.custody.return': 'takeBack',
			'assets.state': 'changeState',
			'assets.location': 'changeLocation',
			'assets.note': 'addComment'
		} as const;

		for (const [id, action] of Object.entries(pairs)) {
			expect(byId.get(id)?.permissions, id).toEqual([routePermission(action)]);
		}

		const edit = readFileSync(
			new URL('../../../../routes/(app)/assets/[tag]/edit/+page.server.ts', import.meta.url),
			'utf8'
		);
		expect(byId.get('assets.update')?.permissions).toEqual([
			/requirePermission\([\w.]+, '([\w.]+)'\)/.exec(edit)?.[1]
		]);
		const register = readFileSync(
			new URL('../../../../routes/(app)/assets/new/+page.server.ts', import.meta.url),
			'utf8'
		);
		expect(byId.get('assets.register')?.permissions).toEqual([
			/requirePermission\([\w.]+(?:\.\w+)*, '([\w.]+)'\)/.exec(register)?.[1]
		]);
	});

	it('declares the 17 project, task and state use cases, each with its permission', () => {
		const byId = new Map(ENDPOINTS.map((endpoint) => [endpoint.id, endpoint]));
		const reads = ['projects.view', 'projects.view.assigned'];
		const expected: Record<string, [string, string, readonly string[]]> = {
			'projects.list': ['GET', '/projects', reads],
			'projects.get': ['GET', '/projects/{tag}', reads],
			'projects.timeline': ['GET', '/projects/{tag}/timeline', ['projects.view']],
			'projects.create': ['POST', '/projects', ['projects.manage']],
			'projects.update': ['PATCH', '/projects/{tag}', ['projects.manage']],
			'projects.archive': ['POST', '/projects/{tag}/archive', ['projects.manage']],
			'projects.unarchive': ['DELETE', '/projects/{tag}/archive', ['projects.manage']],
			'tasks.list': ['GET', '/tasks', reads],
			'tasks.get': ['GET', '/tasks/{tag}', reads],
			'tasks.timeline': ['GET', '/tasks/{tag}/timeline', reads],
			'tasks.create': ['POST', '/projects/{tag}/tasks', ['projects.manage']],
			'tasks.update': ['PATCH', '/tasks/{tag}', ['projects.manage']],
			'tasks.move': ['POST', '/tasks/{tag}/state', ['projects.manage']],
			'tasks.reparent': ['POST', '/tasks/{tag}/project', ['projects.manage']],
			'tasks.assign': ['POST', '/tasks/{tag}/assignees', ['projects.manage']],
			'tasks.unassign': ['DELETE', '/tasks/{tag}/assignees/{personId}', ['projects.manage']],
			'states.list': ['GET', '/states', reads]
		};

		for (const [id, [method, path, permissions]] of Object.entries(expected)) {
			const endpoint = byId.get(id);
			expect(endpoint, id).toBeDefined();
			expect([endpoint?.method, endpoint?.path, endpoint?.permissions], id).toEqual([
				method,
				path,
				permissions
			]);
			expect(endpoint?.description?.trim(), id).toBeTruthy();
		}
	});

	it('serves no method and path twice', () => {
		const routes = ENDPOINTS.map(
			(endpoint) => `${endpoint.method} ${endpoint.path.replace(/\{\w+\}/g, '{}')}`
		);
		expect(new Set(routes).size).toBe(routes.length);
	});

	it('keeps the endpoints an adapter: none imports a table or the database (ADR 0022)', () => {
		const directory = new URL('.', import.meta.url);
		const files = readdirSync(directory).filter(
			(file) => file.endsWith('.ts') && !file.endsWith('.spec.ts')
		);

		for (const file of files) {
			const source = readFileSync(new URL(file, directory), 'utf8');
			expect(source, file).not.toMatch(/getDb|from 'drizzle-orm|from '[./]+\/db'|\/schema'/);
		}
	});
});

/** The central guarantee of ADR 0047: a failure cannot reach the wire without an explicit answer. */
describe('the refusal table', () => {
	type Failure = 'gone' | 'taken' | { kind: 'busy'; count: number };

	const table = refusalTable<Failure>({
		gone: { as: 'not_found' },
		taken: { as: 'conflict' },
		busy: {
			as: 'conflict',
			message: ({ count }) => `Busy with ${count}.`,
			details: ({ count }) => ({ count })
		}
	});

	it('does not compile when a member of the failure union is missing', () => {
		// @ts-expect-error `busy` is a member of the union and has no entry
		const partial = refusalTable<Failure>({ gone: { as: 'not_found' }, taken: { as: 'conflict' } });
		expect(Object.keys(partial.entries)).toEqual(['gone', 'taken']);
		// @ts-expect-error `extra` is not a member of the union
		const extra = refusalTable<Failure>({ ...table.entries, extra: { as: 'conflict' } });
		expect(extra.entries).toHaveProperty('extra');
	});

	it('does not compile when the handler refuses with a failure the table does not cover', () => {
		const endpoint = defineEndpoint({
			id: 'widgets.break',
			method: 'POST',
			path: '/widgets',
			summary: 'Break.',
			permissions: ['tickets.view'],
			refusalTable: table,
			input: z.object({}),
			output: z.null(),
			handler: async ({ refuse }) => {
				refuse('gone');
				refuse({ kind: 'busy', count: 2 });
				// @ts-expect-error `missing` is not in this endpoint's table
				refuse('missing');
				// @ts-expect-error an object failure needs the data its entry computes from
				refuse({ kind: 'busy' });
				return null;
			}
		});
		expect(endpoint.refusalTable).toBe(table);
	});

	it('does not offer refuse to an endpoint that declares no table', () => {
		const endpoint = defineEndpoint({
			id: 'widgets.plain',
			method: 'GET',
			path: '/widgets',
			summary: 'Plain.',
			permissions: ['tickets.view'],
			input: z.object({}),
			output: z.null(),
			handler: async ({ refuse }) => {
				// @ts-expect-error no table, so nothing can be refused through it
				refuse('gone');
				return null;
			}
		});
		expect(endpoint.refusalTable).toBeUndefined();
	});

	it('answers each entry of the closed vocabulary with its status', () => {
		const answer = (failure: Failure) => resolveRefusal('widgets.x', table, failure) as ApiError;

		expect(answer('gone')).toMatchObject({ status: 404, code: 'not_found' });
		expect(answer('taken')).toMatchObject({ status: 409, code: 'taken', message: 'Taken.' });
		expect(answer({ kind: 'busy', count: 3 })).toMatchObject({
			status: 409,
			code: 'busy',
			message: 'Busy with 3.',
			details: { count: 3 }
		});

		const all = refusalTable<'a' | 'b' | 'c' | 'd'>({
			a: { as: 'field', path: 'parentId', message: 'Nope.' },
			b: { as: 'forbidden' },
			c: { as: 'unprocessable' },
			d: { as: 'unreachable', why: 'The endpoint never sends one.' }
		});
		expect(resolveRefusal('w', all, 'a')).toMatchObject({
			status: 400,
			code: 'invalid_input',
			issues: [{ path: ['parentId'], message: 'Nope.' }]
		});
		expect(resolveRefusal('w', all, 'b')).toMatchObject({ status: 403, code: 'forbidden_create' });
		expect(resolveRefusal('w', all, 'c')).toMatchObject({ status: 422, code: 'invalid_input' });
	});

	it('turns an unreachable entry into an internal error, never a refusal', () => {
		const unreachable = refusalTable<'a'>({ a: { as: 'unreachable', why: 'Never sent.' } });
		const error = resolveRefusal('w', unreachable, 'a');
		expect(error).not.toBeInstanceOf(ApiError);
		expect(error.message).toContain('Never sent.');
	});
});
