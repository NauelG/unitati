import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { createOrganisation, createPerson, createViewer } from '../assets/testing/fixtures';
import { users } from '../auth/schema';
import { getDb } from '../db';
import { createQueue, createTicket } from '../service-desk/testing/fixtures';
import { authenticateRequest } from './authenticate-request';
import { handleApiRequest } from './dispatch';
import { createApiKey } from './keys';
import { conflict, defineEndpoint } from './registry';
import { z } from 'zod';
import { RATE_LIMIT_PER_MINUTE } from './rate-limit';

/**
 * The HTTP seam, end to end below the SvelteKit adapter: a real `Request` goes
 * through the same two functions the hook and the catch-all route call, against
 * a real database. What is asserted is what a `curl` would see.
 */

async function workspace() {
	const organisation = await createOrganisation();
	const technician = await createViewer(organisation.id, 'technician', 'Tom Technician');
	const admin = await createViewer(organisation.id, 'admin', 'Ada Admin');
	const queue = await createQueue(organisation.id, 'General');
	return { organisation, technician, admin, queue };
}

async function keyFor(
	actor: Awaited<ReturnType<typeof workspace>>['technician'],
	scopes: Parameters<typeof createApiKey>[1]['scopes']
) {
	const issued = await createApiKey(actor, {
		name: crypto.randomUUID(),
		scopes,
		expiresInDays: 90
	});
	if (!issued.ok) throw new Error(issued.error);
	return issued.value.key;
}

/** What `hooks.server.ts` and `+server.ts` do, in order. */
async function call(path: string, headers: Record<string, string> = {}) {
	const request = new Request(`http://localhost${path}`, { headers });
	const locals = { user: null, api: undefined } as unknown as App.Locals;
	Object.assign(locals, await authenticateRequest(request));
	const response = await handleApiRequest({ request, locals });
	const text = await response.text();
	return { response, body: text ? JSON.parse(text) : null };
}

const bearer = (key: string) => ({ authorization: `Bearer ${key}` });

describe('GET /api/v1/tickets', () => {
	it('returns the organisation tickets as JSON, page-based', async () => {
		const { organisation, technician, queue } = await workspace();
		const requester = await createPerson(organisation.id, 'Rita Requester');
		const ticket = await createTicket(organisation.id, queue.id, requester.id, {
			subject: 'Printer jammed'
		});
		const key = await keyFor(technician, ['tickets.view']);

		const { response, body } = await call('/api/v1/tickets', bearer(key));

		expect(response.status).toBe(200);
		expect(response.headers.get('content-type')).toContain('application/json');
		expect(body.meta).toEqual({ page: 1, perPage: 25, total: 1, pageCount: 1 });
		expect(body.data).toEqual([
			{
				tag: ticket.ticketTag,
				subject: 'Printer jammed',
				status: 'new',
				priority: 'normal',
				channel: 'portal',
				queue: { id: queue.id, name: 'General' },
				requester: { id: requester.id, name: 'Rita Requester' },
				assignee: null,
				createdAt: ticket.createdAt.toISOString(),
				updatedAt: ticket.updatedAt.toISOString()
			}
		]);
	});

	it('does not expose the ticket UUID or any internal column', async () => {
		const { organisation, technician, queue } = await workspace();
		const requester = await createPerson(organisation.id, 'Rita Requester');
		const ticket = await createTicket(organisation.id, queue.id, requester.id);
		const key = await keyFor(technician, ['tickets.view']);

		const { body } = await call('/api/v1/tickets', bearer(key));

		expect(JSON.stringify(body)).not.toContain(ticket.id);
		expect(Object.keys(body.data[0]).sort()).toEqual(
			[
				'assignee',
				'channel',
				'createdAt',
				'priority',
				'queue',
				'requester',
				'status',
				'subject',
				'tag',
				'updatedAt'
			].sort()
		);
	});

	it('clamps and honours paging and filters', async () => {
		const { organisation, technician, queue } = await workspace();
		const requester = await createPerson(organisation.id, 'Rita Requester');
		for (let n = 0; n < 3; n += 1) await createTicket(organisation.id, queue.id, requester.id);
		await createTicket(organisation.id, queue.id, requester.id, { status: 'closed' });
		const key = await keyFor(technician, ['tickets.view']);

		const paged = await call('/api/v1/tickets?perPage=2&page=2', bearer(key));
		expect(paged.body.meta).toEqual({ page: 2, perPage: 2, total: 4, pageCount: 2 });
		expect(paged.body.data).toHaveLength(2);

		const huge = await call('/api/v1/tickets?perPage=100000', bearer(key));
		expect(huge.body.meta.perPage).toBe(100);

		const closed = await call('/api/v1/tickets?status=closed', bearer(key));
		expect(closed.body.meta.total).toBe(1);
	});

	it('answers 400 with the Zod issues for an invalid filter', async () => {
		const { technician } = await workspace();
		const key = await keyFor(technician, ['tickets.view']);

		const { response, body } = await call('/api/v1/tickets?status=nope', bearer(key));

		expect(response.status).toBe(400);
		expect(body.error.code).toBe('invalid_input');
		expect(body.error.issues[0].path).toEqual(['status']);
	});

	it('scopes rows through can(): a tickets.view.own key sees only what the owner requested', async () => {
		const { organisation, technician, queue } = await workspace();
		const other = await createPerson(organisation.id, 'Olga Other');
		const mine = await createTicket(organisation.id, queue.id, technician.personId!);
		await createTicket(organisation.id, queue.id, other.id);
		const key = await keyFor(technician, ['tickets.view.own']);

		const { body } = await call('/api/v1/tickets', bearer(key));

		expect(body.data.map((ticket: { tag: string }) => ticket.tag)).toEqual([mine.ticketTag]);
	});

	it('loses tickets.view when the owner is demoted, with no change to the key', async () => {
		const { organisation, technician, queue } = await workspace();
		const requester = await createPerson(organisation.id, 'Rita Requester');
		await createTicket(organisation.id, queue.id, requester.id);
		const key = await keyFor(technician, ['tickets.view']);
		await getDb().update(users).set({ role: 'employee' }).where(eq(users.id, technician.id));

		const { response } = await call('/api/v1/tickets', bearer(key));

		expect(response.status).toBe(404);
	});

	it('answers 404 to a key with no ticket scope', async () => {
		const { technician } = await workspace();
		const key = await keyFor(technician, ['assets.view']);

		const { response, body } = await call('/api/v1/tickets', bearer(key));

		expect(response.status).toBe(404);
		expect(body.error.code).toBe('not_found');
	});
});

describe('GET /api/v1/tickets/{tag}', () => {
	it('returns one ticket by its tag', async () => {
		const { organisation, technician, queue } = await workspace();
		const requester = await createPerson(organisation.id, 'Rita Requester');
		const ticket = await createTicket(organisation.id, queue.id, requester.id);
		const key = await keyFor(technician, ['tickets.view']);

		const { response, body } = await call(`/api/v1/tickets/${ticket.ticketTag}`, bearer(key));

		expect(response.status).toBe(200);
		expect(body.data.tag).toBe(ticket.ticketTag);
	});

	it('answers 404 for a ticket the principal cannot see, and for one that does not exist', async () => {
		const { organisation, technician, queue } = await workspace();
		const other = await createPerson(organisation.id, 'Olga Other');
		const hidden = await createTicket(organisation.id, queue.id, other.id);
		const key = await keyFor(technician, ['tickets.view.own']);

		expect((await call(`/api/v1/tickets/${hidden.ticketTag}`, bearer(key))).response.status).toBe(
			404
		);
		expect((await call('/api/v1/tickets/TCK-9999', bearer(key))).response.status).toBe(404);
	});

	it('answers 404 to a key without ticket scopes', async () => {
		const { organisation, technician, queue } = await workspace();
		const requester = await createPerson(organisation.id, 'Rita Requester');
		const ticket = await createTicket(organisation.id, queue.id, requester.id);
		const key = await keyFor(technician, ['assets.view']);

		expect((await call(`/api/v1/tickets/${ticket.ticketTag}`, bearer(key))).response.status).toBe(
			404
		);
	});
});

describe('authentication', () => {
	it('answers 401 with the JSON envelope when there is no header', async () => {
		const { response, body } = await call('/api/v1/tickets');

		expect(response.status).toBe(401);
		expect(response.headers.get('content-type')).toContain('application/json');
		expect(body.error.code).toBe('unauthorized');
		expect(typeof body.error.message).toBe('string');
	});

	it('answers 401 for a malformed, an unknown, a revoked and an expired key', async () => {
		const { technician } = await workspace();
		const { revokeApiKey } = await import('./keys');
		const revoked = await createApiKey(technician, {
			name: 'r',
			scopes: ['tickets.view'],
			expiresInDays: 90
		});
		const expired = await createApiKey(
			technician,
			{ name: 'e', scopes: ['tickets.view'], expiresInDays: 30 },
			new Date('2020-01-01T00:00:00Z')
		);
		if (!revoked.ok || !expired.ok) throw new Error('setup');
		await revokeApiKey(technician, revoked.value.record.id);

		for (const key of ['garbage', `unt_${'A'.repeat(43)}`, revoked.value.key, expired.value.key]) {
			const { response, body } = await call('/api/v1/tickets', bearer(key));
			expect(response.status).toBe(401);
			expect(body.error.code).toBe('unauthorized');
		}
	});

	it('refuses a scheme other than Bearer', async () => {
		const { technician } = await workspace();
		const key = await keyFor(technician, ['tickets.view']);

		const { response } = await call('/api/v1/tickets', { authorization: `Basic ${key}` });
		expect(response.status).toBe(401);
	});

	it('never reads the session cookie on /api/v1', async () => {
		const result = await authenticateRequest(
			new Request('http://localhost/api/v1/tickets', {
				headers: { cookie: 'better-auth.session_token=anything' }
			})
		);

		expect(result.user).toBeNull();
	});
});

describe('routing', () => {
	it('answers 404 with the envelope for an unknown path under /api/v1', async () => {
		const { technician } = await workspace();
		const key = await keyFor(technician, ['tickets.view']);

		const { response, body } = await call('/api/v1/nothing/here', bearer(key));

		expect(response.status).toBe(404);
		expect(body.error.code).toBe('not_found');
	});

	it('answers 404 for a method the path does not serve', async () => {
		const { technician } = await workspace();
		const key = await keyFor(technician, ['tickets.view']);
		const request = new Request('http://localhost/api/v1/tickets', {
			method: 'DELETE',
			headers: bearer(key)
		});
		const locals = { ...(await authenticateRequest(request)) } as unknown as App.Locals;

		expect((await handleApiRequest({ request, locals })).status).toBe(404);
	});
});

describe('rate limit', () => {
	it('answers 429 with Retry-After on the 121st request in a minute', async () => {
		const { technician } = await workspace();
		const key = await keyFor(technician, ['tickets.view']);

		for (let n = 0; n < RATE_LIMIT_PER_MINUTE; n += 1) {
			expect((await call('/api/v1/tickets', bearer(key))).response.status).toBe(200);
		}
		const { response, body } = await call('/api/v1/tickets', bearer(key));

		expect(response.status).toBe(429);
		expect(Number(response.headers.get('retry-after'))).toBeGreaterThan(0);
		expect(body.error.code).toBe('rate_limited');
	});
});

describe('errors raised by a handler', () => {
	const refusing = defineEndpoint({
		id: 'tests.refuse',
		method: 'POST',
		path: '/refuse',
		summary: 'Always refuses.',
		permissions: ['tickets.manage'],
		input: z.object({ reason: z.string().min(1) }),
		output: z.object({}),
		handler: async ({ input }) => {
			throw conflict('illegal_transition', `Refused: ${input.reason}`);
		}
	});

	async function post(key: string, body: string) {
		const request = new Request('http://localhost/api/v1/refuse', {
			method: 'POST',
			headers: { ...bearer(key), 'content-type': 'application/json' },
			body
		});
		const locals = { ...(await authenticateRequest(request)) } as unknown as App.Locals;
		const response = await handleApiRequest({ request, locals }, [refusing]);
		return { response, body: await response.json() };
	}

	it('answers 409 with the envelope for a domain refusal', async () => {
		const { technician } = await workspace();
		const key = await keyFor(technician, ['tickets.manage']);

		const { response, body } = await post(key, JSON.stringify({ reason: 'closed' }));

		expect(response.status).toBe(409);
		expect(body).toEqual({
			error: { code: 'illegal_transition', message: 'Refused: closed' }
		});
	});

	it('answers 400 for a body that is not a JSON object, and for one that fails the schema', async () => {
		const { technician } = await workspace();
		const key = await keyFor(technician, ['tickets.manage']);

		expect((await post(key, '[1]')).response.status).toBe(400);
		const invalid = await post(key, JSON.stringify({ reason: '' }));
		expect(invalid.response.status).toBe(400);
		expect(invalid.body.error.issues[0].path).toEqual(['reason']);
	});
});
