import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('$app/env/private', () => ({ BETTER_AUTH_URL: 'https://unitati.test' }));
vi.mock('./shared/runtime', () => ({ runtimeMailer: () => null }));
const notify = vi.hoisted(() => vi.fn(async () => {}));
vi.mock('./links/notify-task-completed', () => ({ notifyTaskCompleted: notify }));
const decided = vi.hoisted(() => vi.fn(async () => {}));
vi.mock('./links/notify-handover-decided', () => ({ notifyHandoverDecided: decided }));

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

		// Both decisions of a handover reach the one ticket-note handler (#279).
		const base = {
			organisationId: 'org',
			handoverId: 'h',
			handoverCode: 'HND-0001',
			direction: 'delivery' as const,
			personId: 'p',
			personName: 'Ada',
			occurredAt: new Date()
		};

		emit('handover.accepted', base);
		emit('handover.rejected', { ...base, reason: 'No' });
		await flushEvents();

		expect(decided).toHaveBeenCalledTimes(2);
	});
});
