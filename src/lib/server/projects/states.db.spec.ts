import { describe, expect, it } from 'vitest';
import { getDb } from '../db';
import { activity } from '../activity/schema';
import { createOrganisation, createViewer } from '../assets/testing/fixtures';
import { ensureDefaultStates } from './defaults';
import { createProject, createTask, moveTask } from './index';
import {
	createState,
	defaultTaskState,
	deleteState,
	listStates,
	renameState,
	reorderState
} from './states';
import { createStateRow, createWorkspace, statesByGroup } from './testing/fixtures';

const groups = async (viewer: Awaited<ReturnType<typeof createWorkspace>>['admin']) =>
	(await listStates(viewer)).map((state) => state.group);

describe('listStates', () => {
	it('reads left to right: group first, then position inside the group', async () => {
		const { organisation, admin } = await createWorkspace();
		await createStateRow(organisation.id, 'Second started', 'started', 2);
		await createStateRow(organisation.id, 'First started', 'started', 1);

		const listed = await listStates(admin);

		expect(listed.map((state) => state.group)).toEqual([
			'backlog',
			'unstarted',
			'started',
			'started',
			'started',
			'completed',
			'cancelled'
		]);
		expect(listed.filter((state) => state.group === 'started').map((s) => s.position)).toEqual([
			0, 1, 2
		]);
	});

	it('never shows another organisation its states', async () => {
		const mine = await createWorkspace();
		const elsewhere = await createOrganisation('Other', 'other');
		await ensureDefaultStates(getDb(), elsewhere.id);
		const other = await createViewer(elsewhere.id, 'admin', 'Other Admin');

		expect(await listStates(other)).toHaveLength(5);
		expect(
			(await listStates(mine.admin)).every((s) => s.organisationId === mine.organisation.id)
		).toBe(true);
	});
});

describe('createState', () => {
	it('appends to the end of its group', async () => {
		const { admin } = await createWorkspace();

		const first = await createState(admin, { name: 'In review', group: 'started' });
		const second = await createState(admin, { name: 'Blocked', group: 'started' });

		expect(first.ok && second.ok).toBe(true);
		const started = (await listStates(admin)).filter((state) => state.group === 'started');
		expect(started.map((state) => state.name)).toEqual([started[0].name, 'In review', 'Blocked']);
		expect(started.map((state) => state.position)).toEqual([0, 1, 2]);
	});

	it('refuses a name already taken, however it is spaced', async () => {
		const { admin } = await createWorkspace();
		await createState(admin, { name: 'In review', group: 'started' });

		const again = await createState(admin, { name: '  In review ', group: 'unstarted' });

		expect(again).toEqual({ ok: false, error: 'duplicate_state_name' });
	});

	it('refuses to run for a viewer who cannot manage projects', async () => {
		const { employee } = await createWorkspace();

		await expect(createState(employee, { name: 'x', group: 'started' })).rejects.toThrow(
			/cannot manage projects/
		);
	});
});

describe('renameState', () => {
	it('renames, trims, and leaves the group alone', async () => {
		const { admin, organisation } = await createWorkspace();
		const { started } = await statesByGroup(organisation.id);

		const renamed = await renameState(admin, started.id, { name: '  Doing ' });

		expect(renamed.ok).toBe(true);
		const after = (await statesByGroup(organisation.id)).started;
		expect(after.name).toBe('Doing');
		expect(after.group).toBe('started');
	});

	it('refuses a name a sibling already has, and an unknown state', async () => {
		const { admin, organisation } = await createWorkspace();
		const { started, backlog } = await statesByGroup(organisation.id);

		expect(await renameState(admin, started.id, { name: backlog.name })).toEqual({
			ok: false,
			error: 'duplicate_state_name'
		});
		expect(await renameState(admin, crypto.randomUUID(), { name: 'Ghost' })).toEqual({
			ok: false,
			error: 'state_not_found'
		});
	});

	it('cannot be talked into changing the group', async () => {
		const { admin, organisation } = await createWorkspace();
		const { started } = await statesByGroup(organisation.id);

		// A payload that smuggles `group` in is stripped by validation, not written.
		await renameState(admin, started.id, { name: 'Sneaky', group: 'completed' } as never);

		expect((await statesByGroup(organisation.id)).started.id).toBe(started.id);
	});

	it('leaves past task.state.changed entries as they were written', async () => {
		const { admin, organisation } = await createWorkspace();
		const { unstarted, started } = await statesByGroup(organisation.id);
		const project = await createProject(admin, { name: 'Move' });
		if (!project.ok) throw new Error('setup');
		const task = await createTask(admin, project.value.id, {
			title: 'Pack',
			stateId: unstarted.id
		});
		if (!task.ok) throw new Error('setup');
		await moveTask(admin, task.value.id, started.id);

		await renameState(admin, started.id, { name: 'Renamed afterwards' });
		await renameState(admin, unstarted.id, { name: 'Also renamed' });

		const entries = await getDb().select().from(activity);
		const moved = entries.find((entry) => entry.verb === 'task.state.changed');
		expect(moved?.payload).toMatchObject({
			fromStateId: unstarted.id,
			fromStateName: unstarted.name,
			toStateId: started.id,
			toStateName: started.name
		});
	});
});

describe('reorderState', () => {
	it('moves a state within its group and rewrites a dense order', async () => {
		const { admin } = await createWorkspace();
		const a = await createState(admin, { name: 'A', group: 'started' });
		const b = await createState(admin, { name: 'B', group: 'started' });
		if (!a.ok || !b.ok) throw new Error('setup');

		await reorderState(admin, b.value.id, 0);

		const started = (await listStates(admin)).filter((state) => state.group === 'started');
		expect(started.map((state) => state.name)).toEqual(['B', started[1].name, 'A']);
		expect(started.map((state) => state.position)).toEqual([0, 1, 2]);
	});

	it('clamps an index past the end, and never crosses a group', async () => {
		const { admin, organisation } = await createWorkspace();
		const { backlog } = await statesByGroup(organisation.id);

		await reorderState(admin, backlog.id, 99);

		expect(await groups(admin)).toEqual([
			'backlog',
			'unstarted',
			'started',
			'completed',
			'cancelled'
		]);
	});

	it('refuses a state that is not there', async () => {
		const { admin } = await createWorkspace();

		expect(await reorderState(admin, crypto.randomUUID(), 0)).toEqual({
			ok: false,
			error: 'state_not_found'
		});
	});
});

describe('deleteState', () => {
	it('deletes an empty state', async () => {
		const { admin } = await createWorkspace();
		const extra = await createState(admin, { name: 'Extra', group: 'started' });
		if (!extra.ok) throw new Error('setup');

		expect((await deleteState(admin, extra.value.id)).ok).toBe(true);

		expect((await listStates(admin)).find((state) => state.id === extra.value.id)).toBeUndefined();
	});

	it('is refused, with the row still there, while a task occupies the state', async () => {
		const { admin, organisation } = await createWorkspace();
		const { backlog } = await statesByGroup(organisation.id);
		const extra = await createState(admin, { name: 'Extra', group: 'backlog' });
		const project = await createProject(admin, { name: 'Move' });
		if (!extra.ok || !project.ok) throw new Error('setup');
		await createTask(admin, project.value.id, { title: 'Pack', stateId: backlog.id });

		const refused = await deleteState(admin, backlog.id);

		expect(refused).toEqual({ ok: false, error: 'state_in_use' });
		expect((await listStates(admin)).some((state) => state.id === backlog.id)).toBe(true);
	});

	it('is refused for the last state that is not done or cancelled', async () => {
		const { admin, organisation } = await createWorkspace();
		const { backlog, unstarted, started } = await statesByGroup(organisation.id);
		await deleteState(admin, backlog.id);
		await deleteState(admin, unstarted.id);

		const refused = await deleteState(admin, started.id);

		expect(refused).toEqual({ ok: false, error: 'last_open_state' });
		expect((await listStates(admin)).some((state) => state.id === started.id)).toBe(true);
	});

	it('lets the terminal groups go, since nothing lands in them by default', async () => {
		const { admin, organisation } = await createWorkspace();
		const { completed, cancelled } = await statesByGroup(organisation.id);

		expect((await deleteState(admin, completed.id)).ok).toBe(true);
		expect((await deleteState(admin, cancelled.id)).ok).toBe(true);
	});

	it('refuses an unknown state', async () => {
		const { admin } = await createWorkspace();

		expect(await deleteState(admin, crypto.randomUUID())).toEqual({
			ok: false,
			error: 'state_not_found'
		});
	});
});

describe('defaultTaskState', () => {
	it('is the lowest position in backlog', async () => {
		const { admin, organisation } = await createWorkspace();
		const { backlog } = await statesByGroup(organisation.id);
		await createState(admin, { name: 'Later', group: 'backlog' });

		expect((await defaultTaskState(getDb(), organisation.id))?.id).toBe(backlog.id);
	});

	it('falls to unstarted, then started, as the earlier groups empty out', async () => {
		const { admin, organisation } = await createWorkspace();
		const { backlog, unstarted, started } = await statesByGroup(organisation.id);

		await deleteState(admin, backlog.id);
		expect((await defaultTaskState(getDb(), organisation.id))?.id).toBe(unstarted.id);

		await deleteState(admin, unstarted.id);
		expect((await defaultTaskState(getDb(), organisation.id))?.id).toBe(started.id);
	});

	it('follows position, not the order states were created in', async () => {
		const { admin, organisation } = await createWorkspace();
		const { backlog } = await statesByGroup(organisation.id);
		const first = await createState(admin, { name: 'First in line', group: 'backlog' });
		if (!first.ok) throw new Error('setup');

		await reorderState(admin, first.value.id, 0);

		expect((await defaultTaskState(getDb(), organisation.id))?.id).toBe(first.value.id);
		expect(backlog.id).not.toBe(first.value.id);
	});
});
