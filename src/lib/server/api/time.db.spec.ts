import { describe, expect, it } from 'vitest';
import { createType, setTimeTracking } from '../time';
import { createTimeScene } from '../time/testing/fixtures';
import { authenticateRequest } from './authenticate-request';
import { handleApiRequest } from './dispatch';
import { createApiKey } from './keys';

/** The time use cases over HTTP (#45): a real `Request` through the dispatcher, asserted as `curl` would see it. */

type Scene = Awaited<ReturnType<typeof createTimeScene>>;

async function keyFor(owner: Scene['technician'], scopes: string[]) {
	const issued = await createApiKey(owner, {
		name: crypto.randomUUID(),
		scopes: scopes as Parameters<typeof createApiKey>[1]['scopes'],
		expiresInDays: 90
	});
	if (!issued.ok) throw new Error(issued.error);
	return issued.value.key;
}

async function send(method: string, path: string, key: string, body?: Record<string, unknown>) {
	const request = new Request(`http://localhost/api/v1${path}`, {
		method,
		headers: {
			authorization: `Bearer ${key}`,
			...(body ? { 'content-type': 'application/json' } : {})
		},
		body: body ? JSON.stringify(body) : undefined
	});
	const locals = { ...(await authenticateRequest(request)) } as unknown as App.Locals;
	const response = await handleApiRequest({ request, locals });
	const text = await response.text();
	return { response, body: text ? JSON.parse(text) : null };
}

const day = { workDate: '2020-01-01' };

async function logged(scene: Scene, key: string, patch: Record<string, unknown> = {}) {
	const { response, body } = await send('POST', '/time-entries', key, {
		taskTag: scene.task.taskTag,
		duration: '1h 30m',
		...day,
		...patch
	});
	expect(response.status).toBe(201);
	return body.data as { id: string; revision: number };
}

describe('POST /time-entries', () => {
	it('logs time on a task by tag, as the person behind the key', async () => {
		const scene = await createTimeScene();
		const key = await keyFor(scene.technician, ['time.log']);

		const { response, body } = await send('POST', '/time-entries', key, {
			taskTag: scene.task.taskTag,
			duration: '1h 30m',
			note: 'Packed',
			...day
		});

		expect(response.status).toBe(201);
		expect(response.headers.get('location')).toBe(`/api/v1/time-entries/${body.data.id}`);
		expect(body.data).toMatchObject({
			minutes: 90,
			hours: '1.50',
			workDate: '2020-01-01',
			note: 'Packed',
			revision: 1,
			person: { id: scene.technician.personId, name: 'Tom Technician' },
			type: { name: 'General' },
			record: { kind: 'task', tag: scene.task.taskTag },
			project: { tag: scene.project.projectTag }
		});
	});

	it('logs on a ticket with minutes, and refuses both or neither of the tags and durations', async () => {
		const scene = await createTimeScene();
		const key = await keyFor(scene.technician, ['time.log']);

		const ok = await send('POST', '/time-entries', key, {
			ticketTag: scene.ticket.ticketTag,
			minutes: 20,
			...day
		});
		expect(ok.response.status).toBe(201);
		expect(ok.body.data.record).toMatchObject({ kind: 'ticket', tag: scene.ticket.ticketTag });

		for (const bad of [
			{ minutes: 20 },
			{ ticketTag: scene.ticket.ticketTag, taskTag: scene.task.taskTag, minutes: 20 },
			{ ticketTag: scene.ticket.ticketTag },
			{ ticketTag: scene.ticket.ticketTag, minutes: 20, duration: '20m' }
		]) {
			const { response } = await send('POST', '/time-entries', key, { ...day, ...bad });
			expect(response.status).toBe(400);
		}
	});

	it('bounds minutes to 1..1440 and a duration to 24 h on create and edit', async () => {
		const scene = await createTimeScene();
		const key = await keyFor(scene.technician, ['time.log']);
		const created = await send('POST', '/time-entries', key, {
			taskTag: scene.task.taskTag,
			minutes: 1440,
			...day
		});
		expect(created.response.status).toBe(201);

		for (const bad of [
			{ minutes: 0 },
			{ minutes: 1441 },
			{ duration: '25h' },
			{ duration: '1h 90m' }
		]) {
			const post = await send('POST', '/time-entries', key, {
				taskTag: scene.task.taskTag,
				...day,
				...bad
			});
			expect(post.response.status, JSON.stringify(bad)).toBe(400);

			const patch = await send('PATCH', `/time-entries/${created.body.data.id}`, key, {
				baseRevision: 1,
				...bad
			});
			expect(patch.response.status, JSON.stringify(bad)).toBe(400);
		}
	});

	it('answers 400 on the field for a bad duration, a future date and an unknown type', async () => {
		const scene = await createTimeScene();
		const key = await keyFor(scene.technician, ['time.log']);
		const post = (patch: Record<string, unknown>) =>
			send('POST', '/time-entries', key, {
				taskTag: scene.task.taskTag,
				duration: '1h',
				...day,
				...patch
			});

		expect((await post({ duration: 'a while' })).body.error.issues[0].path).toEqual(['duration']);
		expect((await post({ workDate: '2999-01-01' })).body.error.issues[0].path).toEqual([
			'workDate'
		]);
		expect((await post({ typeId: crypto.randomUUID() })).body.error.issues[0].path).toEqual([
			'typeId'
		]);
	});

	it('answers 409 time_tracking_disabled while it is off', async () => {
		const scene = await createTimeScene();
		const key = await keyFor(scene.technician, ['time.log']);
		await setTimeTracking(scene.admin, false);

		const off = await send('POST', '/time-entries', key, {
			taskTag: scene.task.taskTag,
			minutes: 5,
			...day
		});
		expect(off.response.status).toBe(409);
		expect(off.body.error.code).toBe('time_tracking_disabled');
	});

	it('is a 404 for a record the key cannot see and for a key without time.log', async () => {
		const scene = await createTimeScene();
		const key = await keyFor(scene.technician, ['time.log']);
		const missing = await send('POST', '/time-entries', key, {
			taskTag: 'TSK-9999',
			minutes: 5,
			...day
		});
		expect(missing.response.status).toBe(404);

		const other = await keyFor(scene.technician, ['tickets.view']);
		const denied = await send('POST', '/time-entries', other, {
			taskTag: scene.task.taskTag,
			minutes: 5,
			...day
		});
		expect(denied.response.status).toBe(404);
	});
});

describe('PATCH and DELETE /time-entries/{id}', () => {
	it('edits an own entry, bumping the revision, and keeps unsent fields', async () => {
		const scene = await createTimeScene();
		const key = await keyFor(scene.technician, ['time.log']);
		const entry = await logged(scene, key);

		const { response, body } = await send('PATCH', `/time-entries/${entry.id}`, key, {
			minutes: 45,
			baseRevision: 1
		});

		expect(response.status).toBe(200);
		expect(body.data).toMatchObject({ minutes: 45, revision: 2, workDate: '2020-01-01' });
	});

	it('answers 409 stale_revision with the current revision, and 400 without baseRevision', async () => {
		const scene = await createTimeScene();
		const key = await keyFor(scene.technician, ['time.log']);
		const entry = await logged(scene, key);
		await send('PATCH', `/time-entries/${entry.id}`, key, { minutes: 10, baseRevision: 1 });

		const stale = await send('PATCH', `/time-entries/${entry.id}`, key, {
			minutes: 20,
			baseRevision: 1
		});
		expect(stale.response.status).toBe(409);
		expect(stale.body.error).toMatchObject({ code: 'stale_revision', details: { revision: 2 } });

		const missing = await send('PATCH', `/time-entries/${entry.id}`, key, { minutes: 20 });
		expect(missing.response.status).toBe(400);
	});

	it('hides somebody else’s entry from a technician and lets an admin correct and delete it', async () => {
		const scene = await createTimeScene();
		const techKey = await keyFor(scene.technician, ['time.log']);
		const colleagueKey = await keyFor(scene.colleague, ['time.log']);
		const adminKey = await keyFor(scene.admin, ['time.log', 'time.manage']);
		const entry = await logged(scene, techKey);

		const edit = { minutes: 5, baseRevision: 1 };
		expect(
			(await send('PATCH', `/time-entries/${entry.id}`, colleagueKey, edit)).response.status
		).toBe(404);
		expect((await send('DELETE', `/time-entries/${entry.id}`, colleagueKey)).response.status).toBe(
			404
		);

		expect((await send('PATCH', `/time-entries/${entry.id}`, adminKey, edit)).response.status).toBe(
			200
		);
		const removed = await send('DELETE', `/time-entries/${entry.id}`, adminKey);
		expect(removed.response.status).toBe(204);
		expect((await send('DELETE', `/time-entries/${entry.id}`, adminKey)).response.status).toBe(404);
	});

	it('answers 409 time_tracking_disabled on PATCH and DELETE while it is off', async () => {
		const scene = await createTimeScene();
		const key = await keyFor(scene.technician, ['time.log']);
		const entry = await logged(scene, key);
		await setTimeTracking(scene.admin, false);

		const patched = await send('PATCH', `/time-entries/${entry.id}`, key, {
			minutes: 5,
			baseRevision: 1
		});
		expect(patched.response.status).toBe(409);
		expect(patched.body.error.code).toBe('time_tracking_disabled');

		const deleted = await send('DELETE', `/time-entries/${entry.id}`, key);
		expect(deleted.response.status).toBe(409);
		expect(deleted.body.error.code).toBe('time_tracking_disabled');
	});

	it('lets a technician delete their own', async () => {
		const scene = await createTimeScene();
		const key = await keyFor(scene.technician, ['time.log']);
		const entry = await logged(scene, key);

		expect((await send('DELETE', `/time-entries/${entry.id}`, key)).response.status).toBe(204);
	});
});

describe('GET /time-entries', () => {
	it('is for time.manage keys only, filtered, with the total in meta', async () => {
		const scene = await createTimeScene();
		const techKey = await keyFor(scene.technician, ['time.log']);
		const adminKey = await keyFor(scene.admin, ['time.manage']);
		await logged(scene, techKey);
		await logged(scene, techKey, { duration: '30m', workDate: '2020-02-01' });

		expect((await send('GET', '/time-entries', techKey)).response.status).toBe(404);

		const all = await send('GET', '/time-entries', adminKey);
		expect(all.response.status).toBe(200);
		expect(all.body.meta).toMatchObject({ total: 2, totalMinutes: 120 });
		expect(all.body.data.map((row: { workDate: string }) => row.workDate)).toEqual([
			'2020-02-01',
			'2020-01-01'
		]);

		const january = await send('GET', '/time-entries?from=2020-01-01&to=2020-01-31', adminKey);
		expect(january.body.meta).toMatchObject({ total: 1, totalMinutes: 90 });
		const byRecord = await send('GET', `/time-entries?recordTag=${scene.task.taskTag}`, adminKey);
		expect(byRecord.body.meta.total).toBe(2);
	});

	it('answers 409 time_tracking_disabled while it is off', async () => {
		const scene = await createTimeScene();
		const adminKey = await keyFor(scene.admin, ['time.manage']);
		await setTimeTracking(scene.admin, false);

		const { response, body } = await send('GET', '/time-entries', adminKey);
		expect(response.status).toBe(409);
		expect(body.error.code).toBe('time_tracking_disabled');
	});
});

describe('GET /time-entry-types', () => {
	it('lists the types with their default and archived flags, to anyone who logs or manages', async () => {
		const scene = await createTimeScene();
		await createType(scene.admin, 'Meetings');
		const key = await keyFor(scene.technician, ['time.log']);

		const { response, body } = await send('GET', '/time-entry-types', key);
		expect(response.status).toBe(200);
		expect(body.data).toEqual([
			expect.objectContaining({ name: 'General', isDefault: true, archived: false }),
			expect.objectContaining({ name: 'Meetings', isDefault: false, archived: false })
		]);

		await setTimeTracking(scene.admin, false);
		const off = await send('GET', '/time-entry-types', key);
		expect(off.response.status).toBe(409);
		expect(off.body.error.code).toBe('time_tracking_disabled');
	});
});
