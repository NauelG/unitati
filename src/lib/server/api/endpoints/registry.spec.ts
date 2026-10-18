import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
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
		expect(patched.map((endpoint) => endpoint.id)).toEqual(['assets.update']);
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
			'assets.custody.assign': 'assignCustody',
			'assets.custody.return': 'returnCustody',
			'assets.state': 'changeState',
			'assets.location': 'changeLocation',
			'assets.note': 'addNote'
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
