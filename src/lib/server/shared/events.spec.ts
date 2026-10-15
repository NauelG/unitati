import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
	emit,
	flushEvents,
	on,
	resetSubscriptions,
	setDispatchMode,
	type DomainEvents
} from './events';

const event: DomainEvents['task.completed'] = {
	organisationId: 'org',
	taskId: 'task',
	taskTag: 'TSK-0001',
	taskTitle: 'Replace the switch',
	fromStateName: 'In progress',
	toStateName: 'Done',
	actorPersonId: null,
	occurredAt: new Date('2026-10-15T10:00:00Z')
};

beforeEach(() => {
	resetSubscriptions();
	setDispatchMode('async');
});

afterEach(() => {
	vi.restoreAllMocks();
});

describe('emit (async)', () => {
	it('runs the handlers after the emitter returns, not before', async () => {
		const handler = vi.fn();
		on('task.completed', handler);

		emit('task.completed', event);
		expect(handler).not.toHaveBeenCalled();

		await Promise.resolve();
		expect(handler).toHaveBeenCalledWith(event);
	});

	it('logs a throwing or rejecting handler and still runs the others', async () => {
		const error = vi.spyOn(console, 'error').mockImplementation(() => {});
		const survivor = vi.fn();
		on('task.completed', function exploding() {
			throw new Error('boom');
		});
		on('task.completed', async function rejecting() {
			throw new Error('nope');
		});
		on('task.completed', survivor);

		expect(() => emit('task.completed', event)).not.toThrow();
		await new Promise((resolve) => setTimeout(resolve, 0));

		expect(survivor).toHaveBeenCalledOnce();
		const lines = error.mock.calls.map((call) => String(call[0]));
		expect(lines).toContain('event handler "exploding" failed on "task.completed"');
		expect(lines).toContain('event handler "rejecting" failed on "task.completed"');
	});
});

describe('on', () => {
	it('stops delivering after unsubscribe', async () => {
		const handler = vi.fn();
		const off = on('task.completed', handler);
		off();

		emit('task.completed', event);
		await new Promise((resolve) => setTimeout(resolve, 0));

		expect(handler).not.toHaveBeenCalled();
	});

	it('registering the same handler twice delivers once', async () => {
		const handler = vi.fn();
		on('task.completed', handler);
		on('task.completed', handler);

		emit('task.completed', event);
		await new Promise((resolve) => setTimeout(resolve, 0));

		expect(handler).toHaveBeenCalledOnce();
	});
});

describe('emit (sync)', () => {
	it('runs the handlers in order and flushEvents waits for them', async () => {
		setDispatchMode('sync');
		const order: string[] = [];
		on('task.completed', async () => {
			await new Promise((resolve) => setTimeout(resolve, 5));
			order.push('first');
		});
		on('task.completed', () => {
			order.push('second');
		});

		emit('task.completed', event);
		expect(order).toEqual([]);

		await flushEvents();
		expect(order).toEqual(['first', 'second']);
	});
});
