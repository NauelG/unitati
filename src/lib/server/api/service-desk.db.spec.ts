import { and, eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import {
	createAsset,
	createCatalogue,
	createOrganisation,
	createPerson,
	createViewer
} from '../assets/testing/fixtures';
import { getDb } from '../db';
import { relatedTo } from '../links';
import { ticketAsset } from '../links/schema';
import { createComment, createQueue, createTicket } from '../service-desk/testing/fixtures';
import { listActivity } from '../activity';
import { authenticateRequest } from './authenticate-request';
import { handleApiRequest } from './dispatch';
import { createApiKey } from './keys';
import type { ApiPrincipal } from './keys';

/**
 * The service-desk use cases over HTTP (#133): a real `Request` through the
 * dispatcher against a real database, asserted as a `curl` would see it.
 */

async function workspace() {
	const organisation = await createOrganisation();
	const technician = await createViewer(organisation.id, 'technician', 'Tom Technician');
	const queue = await createQueue(organisation.id, 'General');
	const requester = await createPerson(organisation.id, 'Rita Requester');
	return { organisation, technician, queue, requester };
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

async function send(method: string, path: string, key: string, body?: Record<string, unknown>) {
	const request = new Request(`http://localhost${path}`, {
		method,
		headers: {
			authorization: `Bearer ${key}`,
			...(body ? { 'content-type': 'application/json' } : {})
		},
		body: body ? JSON.stringify(body) : undefined
	});
	const locals = { ...(await authenticateRequest(request)) } as unknown as App.Locals;
	return respond(await handleApiRequest({ request, locals }));
}

/** An employee cannot own a key (slice A), so the principal is built by hand. */
async function sendAs(
	principal: ApiPrincipal,
	method: string,
	path: string,
	body?: Record<string, unknown>
) {
	const request = new Request(`http://localhost${path}`, {
		method,
		headers: body ? { 'content-type': 'application/json' } : {},
		body: body ? JSON.stringify(body) : undefined
	});
	const locals = {
		user: principal,
		api: { ok: true, keyId: principal.keyId }
	} as unknown as App.Locals;
	return respond(await handleApiRequest({ request, locals }));
}

async function respond(response: Response) {
	const text = await response.text();
	return { response, body: text ? JSON.parse(text) : null };
}

describe('POST /api/v1/tickets', () => {
	it('lets a technician key scoped to tickets.create open a ticket with two assets, attributed to the owner', async () => {
		const { organisation, technician, queue, requester } = await workspace();
		const catalogue = await createCatalogue(organisation.id);
		const first = await createAsset(organisation.id, catalogue.modelId);
		const second = await createAsset(organisation.id, catalogue.modelId);
		const key = await keyFor(technician, ['tickets.create']);

		const { response, body } = await send('POST', '/api/v1/tickets', key, {
			subject: 'Dead laptop',
			body: 'It will not boot.',
			queueId: queue.id,
			priority: 'high',
			requesterPersonId: requester.id,
			assetTags: [first.assetTag, second.assetTag]
		});

		expect(response.status).toBe(201);
		expect(response.headers.get('location')).toBe(`/api/v1/tickets/${body.data.tag}`);
		// A key scoped to `tickets.create` alone is not staff: it opens a ticket as its owner.
		expect(body.data).toMatchObject({
			subject: 'Dead laptop',
			priority: 'normal',
			channel: 'portal',
			requester: { id: technician.personId },
			status: 'new'
		});

		const links = await getDb()
			.select({ assetId: ticketAsset.assetId })
			.from(ticketAsset)
			.where(eq(ticketAsset.organisationId, organisation.id));
		expect(links.map((link) => link.assetId).sort()).toEqual([first.id, second.id].sort());

		const [ticket] = await getDb().query.tickets.findMany({
			where: (t, { eq: is }) => is(t.ticketTag, body.data.tag)
		});
		const history = await listActivity({
			organisationId: organisation.id,
			target: { ticketId: ticket.id }
		});
		expect(history.length).toBeGreaterThanOrEqual(3);
		expect(history.every((entry) => entry.actorPersonId === technician.personId)).toBe(true);
	});

	it('honours priority and requesterPersonId for a key that also holds tickets.manage', async () => {
		const { technician, queue, requester } = await workspace();
		const key = await keyFor(technician, ['tickets.create', 'tickets.manage']);

		const { response, body } = await send('POST', '/api/v1/tickets', key, {
			subject: 'On behalf',
			body: 'Raised for Rita.',
			queueId: queue.id,
			priority: 'high',
			requesterPersonId: requester.id
		});

		expect(response.status).toBe(201);
		expect(body.data).toMatchObject({
			channel: 'agent',
			priority: 'high',
			requester: { id: requester.id }
		});
	});

	it('answers 400 with the issue path assetTags.<n> for an unknown asset tag', async () => {
		const { organisation, technician, queue } = await workspace();
		const catalogue = await createCatalogue(organisation.id);
		const known = await createAsset(organisation.id, catalogue.modelId);
		const key = await keyFor(technician, ['tickets.create']);

		const { response, body } = await send('POST', '/api/v1/tickets', key, {
			subject: 'Dead laptop',
			body: 'It will not boot.',
			queueId: queue.id,
			assetTags: [known.assetTag, 'AST-9999']
		});

		expect(response.status).toBe(400);
		expect(body.error.issues).toEqual([{ path: ['assetTags', 1], message: 'Asset not found.' }]);
	});

	it('answers 400 for an asset of another organisation, as for an unknown one', async () => {
		const { technician, queue } = await workspace();
		const other = await createOrganisation('Other', 'other');
		const catalogue = await createCatalogue(other.id);
		const foreign = await createAsset(other.id, catalogue.modelId);
		const key = await keyFor(technician, ['tickets.create']);

		const { response, body } = await send('POST', '/api/v1/tickets', key, {
			subject: 'x',
			body: 'y',
			queueId: queue.id,
			assetTags: [foreign.assetTag]
		});

		expect(response.status).toBe(400);
		expect(body.error.issues[0].path).toEqual(['assetTags', 0]);
	});

	it('answers 404 for a queue that does not exist in the organisation', async () => {
		const { technician } = await workspace();
		const key = await keyFor(technician, ['tickets.create']);

		const { response, body } = await send('POST', '/api/v1/tickets', key, {
			subject: 'x',
			body: 'y',
			queueId: crypto.randomUUID()
		});

		expect(response.status).toBe(404);
		expect(body.error.code).toBe('not_found');
	});

	it('treats an employee principal as their own requester and ignores requesterPersonId', async () => {
		const { organisation, queue, requester } = await workspace();
		const employee = await createViewer(organisation.id, 'employee', 'Eve Employee');
		const principal: ApiPrincipal = {
			...employee,
			scopes: ['tickets.create', 'tickets.view.own'],
			keyId: crypto.randomUUID()
		};

		const { response, body } = await sendAs(principal, 'POST', '/api/v1/tickets', {
			subject: 'Mouse broken',
			body: 'Left click is dead.',
			queueId: queue.id,
			requesterPersonId: requester.id,
			priority: 'urgent'
		});

		expect(response.status).toBe(201);
		expect(body.data.requester.id).toBe(employee.personId);
		expect(body.data.channel).toBe('portal');
		expect(body.data.priority).toBe('normal');
	});
});

describe('the ticket thread', () => {
	it('lets an employee principal read only its own thread, without internal notes', async () => {
		const { organisation, technician, queue } = await workspace();
		const employee = await createViewer(organisation.id, 'employee', 'Eve Employee');
		const principal: ApiPrincipal = {
			...employee,
			scopes: ['tickets.create', 'tickets.view.own'],
			keyId: crypto.randomUUID()
		};
		const mine = await createTicket(organisation.id, queue.id, employee.personId!);
		const theirs = await createTicket(organisation.id, queue.id, technician.personId!);
		await createComment(organisation.id, mine.id, employee.personId, 'My question');
		await createComment(organisation.id, mine.id, technician.personId, 'Secret note', 'internal');

		const own = await sendAs(principal, 'GET', `/api/v1/tickets/${mine.ticketTag}/comments`);
		expect(own.response.status).toBe(200);
		expect(own.body.data.filter((item: { kind: string }) => item.kind === 'comment')).toHaveLength(
			1
		);
		expect(JSON.stringify(own.body)).not.toContain('Secret note');

		const other = await sendAs(principal, 'GET', `/api/v1/tickets/${theirs.ticketTag}/comments`);
		expect(other.response.status).toBe(404);
	});

	it('never returns internal comments to a key without tickets.comment.internal', async () => {
		const { organisation, technician, queue, requester } = await workspace();
		const ticket = await createTicket(organisation.id, queue.id, requester.id);
		await createComment(organisation.id, ticket.id, requester.id, 'Public question');
		await createComment(
			organisation.id,
			ticket.id,
			technician.personId,
			'Internal hunch',
			'internal'
		);
		const narrow = await keyFor(technician, ['tickets.view']);
		const full = await keyFor(technician, ['tickets.view', 'tickets.comment.internal']);

		const without = await send('GET', `/api/v1/tickets/${ticket.ticketTag}/comments`, narrow);
		const withIt = await send('GET', `/api/v1/tickets/${ticket.ticketTag}/comments`, full);

		expect(JSON.stringify(without.body)).not.toContain('Internal hunch');
		expect(JSON.stringify(withIt.body)).toContain('Internal hunch');
	});

	it('posts a public comment by default and answers 404 to an internal one without the permission', async () => {
		const { organisation, technician, queue, requester } = await workspace();
		const ticket = await createTicket(organisation.id, queue.id, requester.id);
		const path = `/api/v1/tickets/${ticket.ticketTag}/comments`;
		const narrow = await keyFor(technician, ['tickets.view']);
		const full = await keyFor(technician, ['tickets.view', 'tickets.comment.internal']);

		const posted = await send('POST', path, narrow, { body: 'On it.' });
		expect(posted.response.status).toBe(201);

		const refused = await send('POST', path, narrow, { body: 'Hmm', visibility: 'internal' });
		expect(refused.response.status).toBe(404);

		const note = await send('POST', path, full, { body: 'Hmm', visibility: 'internal' });
		expect(note.response.status).toBe(201);

		const thread = await send('GET', path, full);
		const bodies = thread.body.data
			.filter((item: { kind: string }) => item.kind === 'comment')
			.map((item: { body: string; visibility: string }) => [item.body, item.visibility]);
		expect(bodies).toEqual([
			['On it.', 'public'],
			['Hmm', 'internal']
		]);
	});
});

describe('staff actions', () => {
	async function openTicket() {
		const context = await workspace();
		const ticket = await createTicket(
			context.organisation.id,
			context.queue.id,
			context.requester.id
		);
		const key = await keyFor(context.technician, ['tickets.manage']);
		return { ...context, ticket, key, base: `/api/v1/tickets/${ticket.ticketTag}` };
	}

	it('moves a ticket along a permitted transition and records it in the activity', async () => {
		const { organisation, technician, ticket, key, base } = await openTicket();

		const { response, body } = await send('POST', `${base}/status`, key, { status: 'in_progress' });

		expect(response.status).toBe(200);
		expect(body.data.status).toBe('in_progress');
		const history = await listActivity({
			organisationId: organisation.id,
			target: { ticketId: ticket.id }
		});
		expect(history[0]).toMatchObject({
			verb: 'ticket.status.changed',
			actorPersonId: technician.personId
		});
	});

	it('answers 409 invalid_transition for a transition the lifecycle forbids', async () => {
		const { key, base } = await openTicket();

		const { response, body } = await send('POST', `${base}/status`, key, { status: 'closed' });

		expect(response.status).toBe(409);
		expect(body.error.code).toBe('invalid_transition');
	});

	it('sets priority, assigns and unassigns, and moves queues', async () => {
		const { organisation, technician, key, base } = await openTicket();
		const other = await createQueue(organisation.id, 'Hardware');

		const priority = await send('POST', `${base}/priority`, key, { priority: 'urgent' });
		expect(priority.body.data.priority).toBe('urgent');

		const assigned = await send('POST', `${base}/assignee`, key, { personId: technician.personId });
		expect(assigned.body.data.assignee).toEqual({
			id: technician.personId,
			name: 'Tom Technician'
		});

		const unassigned = await send('POST', `${base}/assignee`, key, { personId: null });
		expect(unassigned.body.data.assignee).toBeNull();

		const moved = await send('POST', `${base}/queue`, key, { queueId: other.id });
		expect(moved.body.data.queue).toEqual({ id: other.id, name: 'Hardware' });

		const missing = await send('POST', `${base}/queue`, key, { queueId: crypto.randomUUID() });
		expect(missing.response.status).toBe(404);
	});

	it('answers 404 to every staff action for a key scoped only to tickets.view', async () => {
		const { technician, ticket, base } = await openTicket();
		const viewOnly = await keyFor(technician, ['tickets.view']);
		const calls: [string, string, Record<string, unknown>?][] = [
			['POST', `${base}/status`, { status: 'in_progress' }],
			['POST', `${base}/priority`, { priority: 'high' }],
			['POST', `${base}/assignee`, { personId: null }],
			['POST', `${base}/queue`, { queueId: crypto.randomUUID() }],
			['POST', `${base}/assets`, { assetTag: 'AST-0001' }],
			['DELETE', `${base}/assets/AST-0001`]
		];

		for (const [method, path, body] of calls) {
			expect((await send(method, path, viewOnly, body)).response.status, path).toBe(404);
		}
		expect(ticket.status).toBe('new');
	});

	it('links an asset idempotently and unlinks it with 204', async () => {
		const { organisation, technician, ticket, key, base } = await openTicket();
		const catalogue = await createCatalogue(organisation.id);
		const asset = await createAsset(organisation.id, catalogue.modelId);
		const linked = async () =>
			getDb()
				.select({ id: ticketAsset.id })
				.from(ticketAsset)
				.where(and(eq(ticketAsset.ticketId, ticket.id), eq(ticketAsset.assetId, asset.id)));

		const first = await send('POST', `${base}/assets`, key, { assetTag: asset.assetTag });
		expect(first.response.status).toBe(201);
		expect(await linked()).toHaveLength(1);

		const related = async () =>
			(await relatedTo(technician, { kind: 'ticket', id: ticket.id })).flatMap((group) =>
				group.items.map((item) => item.ref.tag)
			);
		expect(await related()).toEqual([asset.assetTag]);

		const again = await send('POST', `${base}/assets`, key, { assetTag: asset.assetTag });
		expect(again.response.status).toBe(200);
		expect(await linked()).toHaveLength(1);

		const removed = await send('DELETE', `${base}/assets/${asset.assetTag}`, key);
		expect(removed.response.status).toBe(204);
		expect(removed.body).toBeNull();
		expect(await linked()).toHaveLength(0);
		expect(await related()).toEqual([]);

		const history = await listActivity({
			organisationId: organisation.id,
			target: { ticketId: ticket.id }
		});
		expect(history.map((entry) => [entry.verb, entry.actorPersonId])).toEqual([
			['link.asset.removed', technician.personId],
			['link.asset.added', technician.personId]
		]);

		const twice = await send('DELETE', `${base}/assets/${asset.assetTag}`, key);
		expect(twice.response.status).toBe(404);
	});

	it('answers 404 when linking an unknown asset or ticket', async () => {
		const { key, base } = await openTicket();

		expect(
			(await send('POST', `${base}/assets`, key, { assetTag: 'AST-9999' })).response.status
		).toBe(404);
		expect(
			(await send('POST', '/api/v1/tickets/TCK-9999/status', key, { status: 'in_progress' }))
				.response.status
		).toBe(404);
	});
});

describe('GET /api/v1/queues', () => {
	it('lists the queues for a key that can view or create tickets, and nothing but id and name', async () => {
		const { organisation, technician, queue } = await workspace();
		await createQueue(organisation.id, 'Hardware');
		const key = await keyFor(technician, ['tickets.create']);

		const { response, body } = await send('GET', '/api/v1/queues', key);

		expect(response.status).toBe(200);
		expect(body.data).toHaveLength(2);
		expect(body.data[0]).toEqual({ id: queue.id, name: 'General' });
	});

	it('answers 404 to a key with neither scope', async () => {
		const { technician } = await workspace();
		const key = await keyFor(technician, ['tickets.manage']);

		expect((await send('GET', '/api/v1/queues', key)).response.status).toBe(404);
	});
});
