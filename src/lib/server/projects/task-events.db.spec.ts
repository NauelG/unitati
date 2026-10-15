import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
	flushEvents,
	on,
	resetSubscriptions,
	setDispatchMode,
	type DomainEvents
} from '../shared/events';
import { createProject, createTask, moveTask } from './index';
import {
	createProjectRow,
	createTaskRow,
	createWorkspace,
	createStateRow
} from './testing/fixtures';
import { statesByGroup } from './testing/fixtures';

/**
 * `task.completed` at the only place it is emitted (#152, ADR 0024): `moveTask`,
 * after commit, on a transition into the `completed` group from any other.
 */

type Completed = DomainEvents['task.completed'];

let seen: Completed[];

beforeEach(() => {
	resetSubscriptions();
	setDispatchMode('sync');
	seen = [];
	on('task.completed', (event) => {
		seen.push(event);
	});
});

afterEach(() => {
	resetSubscriptions();
	setDispatchMode('async');
});

async function scene() {
	const base = await createWorkspace();
	const states = await statesByGroup(base.organisation.id);
	const project = await createProjectRow(base.organisation.id);
	const task = await createTaskRow(base.organisation.id, project.id, states.started.id, {
		taskTag: 'TSK-0001',
		title: 'Book the van'
	});
	return { ...base, states, project, task };
}

describe('moveTask → task.completed', () => {
	it('emits once, with the payload, when a started task is completed', async () => {
		const { admin, organisation, states, task } = await scene();

		const moved = await moveTask(admin, task.id, states.completed.id);
		await flushEvents();

		expect(moved.ok).toBe(true);
		expect(seen).toHaveLength(1);
		expect(seen[0]).toMatchObject({
			organisationId: organisation.id,
			taskId: task.id,
			taskTag: 'TSK-0001',
			taskTitle: 'Book the van',
			fromStateName: states.started.name,
			toStateName: states.completed.name,
			actorPersonId: admin.personId
		});
		expect(seen[0].occurredAt).toBeInstanceOf(Date);
	});

	it('does not emit when moving between two completed-group states', async () => {
		const { admin, organisation, states, task } = await scene();
		const archived = await createStateRow(organisation.id, 'Shipped', 'completed', 9);
		await moveTask(admin, task.id, states.completed.id);
		await flushEvents();
		seen.length = 0;

		await moveTask(admin, task.id, archived.id);
		await flushEvents();

		expect(seen).toEqual([]);
	});

	it('does not emit when moving into cancelled, or within a state', async () => {
		const { admin, states, task } = await scene();

		await moveTask(admin, task.id, states.cancelled.id);
		await moveTask(admin, task.id, states.cancelled.id);
		await flushEvents();

		expect(seen).toEqual([]);
	});

	it('does not emit when the move is refused', async () => {
		const { admin, task } = await scene();

		const moved = await moveTask(admin, task.id, crypto.randomUUID());
		await flushEvents();

		expect(moved.ok).toBe(false);
		expect(seen).toEqual([]);
	});

	it('does not emit for someone who may not move tasks', async () => {
		const { employee, states, task } = await scene();

		await expect(moveTask(employee, task.id, states.completed.id)).rejects.toThrow();
		await flushEvents();

		expect(seen).toEqual([]);
	});

	it('emits again when a task leaves completed and re-enters it', async () => {
		const { admin, states, task } = await scene();

		await moveTask(admin, task.id, states.completed.id);
		await moveTask(admin, task.id, states.started.id);
		await moveTask(admin, task.id, states.completed.id);
		await flushEvents();

		expect(seen).toHaveLength(2);
	});

	it('does not emit when a task is created already completed', async () => {
		const { admin, states } = await scene();
		const project = await createProject(admin, { name: 'Another' });
		if (!project.ok) throw new Error('setup');

		const created = await createTask(admin, project.value.id, {
			title: 'Already done',
			stateId: states.completed.id
		});
		await flushEvents();

		expect(created.ok).toBe(true);
		expect(seen).toEqual([]);
	});
});
