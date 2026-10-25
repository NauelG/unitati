import { z } from 'zod';
import { m } from '#lib/paraglide/messages.js';
import {
	createType,
	isTimeTrackingEnabled,
	listTypes,
	moveType,
	removeType,
	renameType,
	setDefaultType,
	setTimeTracking
} from '#lib/server/time/index.js';
import type { CatalogueFailure } from '#lib/server/time/index.js';
import { requireSettingsSection } from '#lib/server/settings/guard.js';
import { fail } from '@sveltejs/kit';
import { fieldsOf, rejected, withId } from '../../assets/form-data';
import type { Actions, PageServerLoad } from './$types';

const SECTION = '/settings/time';

/**
 * Time tracking's settings (ADR 0051): the organisation's switch and the
 * entry-type catalogue. The catalogue is only there while tracking is on: every
 * write is refused otherwise, and the page offers the switch alone.
 */
export const load: PageServerLoad = async ({ locals }) => {
	const user = requireSettingsSection(locals.user, SECTION);
	const enabled = await isTimeTrackingEnabled(user.organisationId);
	const types = enabled ? await listTypes(user.organisationId) : [];

	return {
		enabled,
		types: types.map(({ id, name, isDefault, archived, entryCount }) => ({
			id,
			name,
			isDefault,
			archived,
			entryCount
		}))
	};
};

const named = z.object({ name: z.string() });
const moved = z.object({ direction: z.enum(['up', 'down']) });

function failureMessage(failure: CatalogueFailure): string {
	switch (failure) {
		case 'name_required':
			return m.time_settings_error_name_required();
		case 'name_too_long':
			return m.time_settings_error_name_too_long();
		case 'name_taken':
			return m.time_settings_error_name_taken();
		case 'type_archived':
			return m.time_settings_error_archived();
		case 'default_type':
			return m.time_settings_error_default();
		case 'time_tracking_disabled':
			return m.time_error_disabled();
		case 'forbidden':
		case 'type_not_found':
			return m.time_settings_error_not_found();
	}
}

export const actions: Actions = {
	toggle: async ({ locals, request }) => {
		const user = requireSettingsSection(locals.user, SECTION);
		const enabled = (await request.formData()).get('enabled') === 'true';

		const outcome = await setTimeTracking(user, enabled);
		if (!outcome.ok) return fail(403);
		return { action: 'toggle' as const, message: null, id: null, enabled: outcome.value };
	},

	create: async ({ locals, request }) => {
		const user = requireSettingsSection(locals.user, SECTION);
		const name = named.safeParse(await fieldsOf(request));
		if (!name.success) return rejected('create', m.time_settings_error_name_required());

		const outcome = await createType(user, name.data.name);
		if (!outcome.ok) return rejected('create', failureMessage(outcome.error));
		return { action: 'create' as const, message: null, id: null };
	},

	rename: async ({ locals, request }) => {
		const user = requireSettingsSection(locals.user, SECTION);
		const fields = await fieldsOf(request);
		const id = withId.safeParse(fields);
		const name = named.safeParse(fields);
		if (!id.success || !name.success) {
			return rejected('rename', m.time_settings_error_name_required());
		}

		const outcome = await renameType(user, id.data.id, name.data.name);
		if (!outcome.ok) return rejected('rename', failureMessage(outcome.error), id.data.id);
		return { action: 'rename' as const, message: null, id: null };
	},

	reorder: async ({ locals, request }) => {
		const user = requireSettingsSection(locals.user, SECTION);
		const fields = await fieldsOf(request);
		const id = withId.safeParse(fields);
		const direction = moved.safeParse(fields);
		if (!id.success || !direction.success) {
			return rejected('reorder', m.time_settings_error_not_found());
		}

		const outcome = await moveType(user, id.data.id, direction.data.direction);
		if (!outcome.ok) return rejected('reorder', failureMessage(outcome.error), id.data.id);
		return { action: 'reorder' as const, message: null, id: null };
	},

	makeDefault: async ({ locals, request }) => {
		const user = requireSettingsSection(locals.user, SECTION);
		const id = withId.safeParse(await fieldsOf(request));
		if (!id.success) return rejected('makeDefault', m.time_settings_error_not_found());

		const outcome = await setDefaultType(user, id.data.id);
		if (!outcome.ok) return rejected('makeDefault', failureMessage(outcome.error), id.data.id);
		return { action: 'makeDefault' as const, message: null, id: null };
	},

	delete: async ({ locals, request }) => {
		const user = requireSettingsSection(locals.user, SECTION);
		const id = withId.safeParse(await fieldsOf(request));
		if (!id.success) return rejected('delete', m.time_settings_error_not_found());

		const outcome = await removeType(user, id.data.id);
		if (!outcome.ok) return rejected('delete', failureMessage(outcome.error), id.data.id);
		return { action: 'delete' as const, message: null, id: null, result: outcome.value };
	}
};
