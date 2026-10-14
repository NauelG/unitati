import { z } from 'zod';
import { STATE_GROUPS } from '#lib/domain/status.js';
import { m } from '#lib/paraglide/messages.js';
import {
	createState,
	deleteState,
	listStatesWithTaskCount,
	renameState,
	reorderState
} from '#lib/server/projects/index.js';
import type {
	CreateStateFailure,
	DeleteStateFailure,
	RenameStateFailure
} from '#lib/server/projects/index.js';
import { requireSettingsSection } from '#lib/server/settings/guard.js';
import { fieldsOf, rejected } from '../../../assets/form-data';
import type { Actions, PageServerLoad } from './$types';

const SECTION = '/settings/projects/states';

export const load: PageServerLoad = async ({ locals }) => {
	const user = requireSettingsSection(locals.user, SECTION);
	const states = await listStatesWithTaskCount(user);
	return {
		states: states.map(({ id, name, group, taskCount }) => ({ id, name, group, taskCount }))
	};
};

const named = z.object({ name: z.string().trim().min(1) });
const grouped = z.object({ group: z.enum(STATE_GROUPS) });
const withId = z.object({ id: z.uuid() });
const moved = z.object({ direction: z.enum(['up', 'down']) });

function writeFailure(failure: CreateStateFailure | RenameStateFailure): string {
	return failure === 'duplicate_state_name'
		? m.project_states_error_duplicate()
		: m.project_states_error_not_found();
}

export const actions: Actions = {
	create: async ({ locals, request }) => {
		const user = requireSettingsSection(locals.user, SECTION);
		const fields = await fieldsOf(request);
		const name = named.safeParse(fields);
		const group = grouped.safeParse(fields);
		if (!name.success || !group.success)
			return rejected('create', m.project_states_error_invalid());

		const outcome = await createState(user, { name: name.data.name, group: group.data.group });
		if (!outcome.ok) return rejected('create', writeFailure(outcome.error));
		return { action: 'create' as const, message: null, id: null };
	},

	// The group is never read: it is fixed when the state is created (#121).
	rename: async ({ locals, request }) => {
		const user = requireSettingsSection(locals.user, SECTION);
		const fields = await fieldsOf(request);
		const id = withId.safeParse(fields);
		const name = named.safeParse(fields);
		if (!id.success || !name.success) return rejected('rename', m.project_states_error_invalid());

		const outcome = await renameState(user, id.data.id, { name: name.data.name });
		if (!outcome.ok) return rejected('rename', writeFailure(outcome.error), id.data.id);
		return { action: 'rename' as const, message: null, id: null };
	},

	reorder: async ({ locals, request }) => {
		const user = requireSettingsSection(locals.user, SECTION);
		const fields = await fieldsOf(request);
		const id = withId.safeParse(fields);
		const direction = moved.safeParse(fields);
		if (!id.success || !direction.success) {
			return rejected('reorder', m.project_states_error_invalid());
		}

		const states = await listStatesWithTaskCount(user);
		const state = states.find((candidate) => candidate.id === id.data.id);
		if (!state) return rejected('reorder', m.project_states_error_not_found(), id.data.id);

		const siblings = states.filter((candidate) => candidate.group === state.group);
		const index = siblings.findIndex((candidate) => candidate.id === state.id);
		const target = direction.data.direction === 'up' ? index - 1 : index + 1;
		// A group boundary: nothing to do, and not a failure worth a toast.
		if (target < 0 || target >= siblings.length) {
			return { action: 'reorder' as const, message: null, id: null };
		}

		const outcome = await reorderState(user, state.id, target);
		if (!outcome.ok) return rejected('reorder', m.project_states_error_not_found(), state.id);
		return { action: 'reorder' as const, message: null, id: null };
	},

	delete: async ({ locals, request }) => {
		const user = requireSettingsSection(locals.user, SECTION);
		const id = withId.safeParse(await fieldsOf(request));
		if (!id.success) return rejected('delete', m.project_states_error_not_found());

		const state = (await listStatesWithTaskCount(user)).find((s) => s.id === id.data.id);
		const outcome = await deleteState(user, id.data.id);
		if (!outcome.ok) {
			return rejected('delete', deleteFailure(outcome.error, state), id.data.id);
		}
		return { action: 'delete' as const, message: null, id: null };
	}
};

function deleteFailure(
	failure: DeleteStateFailure,
	state: { name: string; taskCount: number } | undefined
): string {
	if (failure === 'state_not_found' || !state) return m.project_states_error_not_found();
	if (failure === 'last_open_state') return m.project_states_error_last_open({ name: state.name });
	// The count was read just before the delete; if a task arrived in between it
	// can be one short, which the sentence tolerates — the refusal is what matters.
	return state.taskCount === 1
		? m.project_states_error_in_use_one({ name: state.name })
		: m.project_states_error_in_use_other({ name: state.name, count: state.taskCount });
}
