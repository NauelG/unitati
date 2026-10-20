import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('$app/env/private', () => ({ BETTER_AUTH_URL: 'https://unitati.test' }));
vi.mock('./shared/runtime', () => ({ runtimeMailer: () => null }));
const notify = vi.hoisted(() => vi.fn(async () => {}));
vi.mock('./links/notify-task-completed', () => ({ notifyTaskCompleted: notify }));

import { emit, flushEvents, resetSubscriptions, setDispatchMode } from './shared/events';
import { registerSubscriptions } from './subscriptions';

const event = {
	organisationId: 'org',
	taskId: 'task',
	taskTag: 'TSK-0001',
	taskTitle: 'Replace the switch',
	fromStateName: 'In progress',
	toStateName: 'Done',
	actorPersonId: null,
	occurredAt: new Date()
};

describe('registerSubscriptions', () => {
	beforeEach(() => {
		resetSubscriptions();
		setDispatchMode('sync');
	});

	it('subscribes once however many times the hooks module is evaluated', async () => {
		registerSubscriptions();
		registerSubscriptions();

		emit('task.completed', event);
		await flushEvents();

		expect(notify).toHaveBeenCalledOnce();
	});
});
