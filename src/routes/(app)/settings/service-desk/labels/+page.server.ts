import { z } from 'zod';
import { CATALOGUE_COLORS, DEFAULT_CATALOGUE_COLOR } from '#lib/domain/catalogue-color.js';
import { LABEL_DESCRIPTION_MAX, LABEL_NAME_MAX } from '#lib/domain/label.js';
import { m } from '#lib/paraglide/messages.js';
import {
	createLabel,
	deleteLabel,
	listLabels,
	setLabelActive,
	updateLabel
} from '#lib/server/service-desk/index.js';
import { requireSettingsSection } from '#lib/server/settings/guard.js';
import { failureMessage } from '#lib/ticket-errors.js';
import { fieldsOf, rejected } from '../../../assets/form-data';
import type { Actions, PageServerLoad } from './$types';

const SECTION = '/settings/service-desk/labels';

export const load: PageServerLoad = async ({ locals }) => {
	const user = requireSettingsSection(locals.user, SECTION);
	return {
		labels: await listLabels(user),
		nameMax: LABEL_NAME_MAX,
		descriptionMax: LABEL_DESCRIPTION_MAX
	};
};

const invalid = () => failureMessage('invalid_label');

// Bounds are the domain's to enforce (and say); this only shapes the form fields.
const named = z.object({
	name: z.string(),
	description: z.string().optional(),
	color: z.enum(CATALOGUE_COLORS).default(DEFAULT_CATALOGUE_COLOR)
});
const withId = z.object({ id: z.uuid() });

export const actions: Actions = {
	create: async ({ locals, request }) => {
		const user = requireSettingsSection(locals.user, SECTION);
		const parsed = named.safeParse(await fieldsOf(request));
		if (!parsed.success) return rejected('create', invalid());

		const outcome = await createLabel(user, parsed.data);
		if (!outcome.ok) return rejected('create', failureMessage(outcome.error));
		return { action: 'create' as const, message: null, id: null };
	},

	update: async ({ locals, request }) => {
		const user = requireSettingsSection(locals.user, SECTION);
		const fields = await fieldsOf(request);
		const id = withId.safeParse(fields);
		const parsed = named.safeParse(fields);
		if (!id.success || !parsed.success) return rejected('update', invalid());

		const outcome = await updateLabel(user, id.data.id, parsed.data);
		if (!outcome.ok) return rejected('update', failureMessage(outcome.error), id.data.id);
		return { action: 'update' as const, message: null, id: null };
	},

	archive: async ({ locals, request }) => {
		const user = requireSettingsSection(locals.user, SECTION);
		const parsed = withId
			.extend({ active: z.enum(['true', 'false']) })
			.safeParse(await fieldsOf(request));
		if (!parsed.success) return rejected('archive', m.labels_error_not_found());

		const outcome = await setLabelActive(user, parsed.data.id, parsed.data.active === 'true');
		if (!outcome.ok) return rejected('archive', failureMessage(outcome.error), parsed.data.id);
		return { action: 'archive' as const, message: null, id: null };
	},

	delete: async ({ locals, request }) => {
		const user = requireSettingsSection(locals.user, SECTION);
		const id = withId.safeParse(await fieldsOf(request));
		if (!id.success) return rejected('delete', m.labels_error_not_found());

		const outcome = await deleteLabel(user, id.data.id);
		if (!outcome.ok) return rejected('delete', failureMessage(outcome.error), id.data.id);
		return { action: 'delete' as const, message: null, id: null };
	}
};
