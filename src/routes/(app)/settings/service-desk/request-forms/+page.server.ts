import { z } from 'zod';
import { REQUEST_FORM_DESCRIPTION_MAX, REQUEST_FORM_KINDS } from '#lib/domain/request-form.js';
import { m } from '#lib/paraglide/messages.js';
import {
	createRequestForm,
	deleteRequestForm,
	listQueues,
	listRequestForms,
	updateRequestForm
} from '#lib/server/service-desk/index.js';
import { requireSettingsSection } from '#lib/server/settings/guard.js';
import { failureMessage } from '#lib/ticket-errors.js';
import { fieldsOf, rejected } from '../../../assets/form-data';
import type { Actions, PageServerLoad } from './$types';

const SECTION = '/settings/service-desk/request-forms';

export const load: PageServerLoad = async ({ locals }) => {
	const user = requireSettingsSection(locals.user, SECTION);
	const [forms, queues] = await Promise.all([listRequestForms(user), listQueues(user)]);
	return {
		forms,
		queues: queues.map(({ id, name }) => ({ id, name })),
		descriptionMax: REQUEST_FORM_DESCRIPTION_MAX
	};
};

const named = z.object({
	name: z.string().trim().min(1),
	description: z.string().trim().max(REQUEST_FORM_DESCRIPTION_MAX).default(''),
	queueId: z.uuid(),
	// A checkbox posts `on` when ticked and nothing at all when not.
	active: z.literal('on').optional()
});
const withId = z.object({ id: z.uuid() });

export const actions: Actions = {
	create: async ({ locals, request }) => {
		const user = requireSettingsSection(locals.user, SECTION);
		const parsed = named
			.extend({ kind: z.enum(REQUEST_FORM_KINDS) })
			.safeParse(await fieldsOf(request));
		if (!parsed.success) return rejected('create', m.request_forms_error_invalid());

		const { active, ...values } = parsed.data;
		const outcome = await createRequestForm(user, { ...values, active: active === 'on' });
		if (!outcome.ok) return rejected('create', failureMessage(outcome.error));
		return { action: 'create' as const, message: null, id: null };
	},

	update: async ({ locals, request }) => {
		const user = requireSettingsSection(locals.user, SECTION);
		const fields = await fieldsOf(request);
		const id = withId.safeParse(fields);
		const parsed = named.safeParse(fields);
		if (!id.success || !parsed.success) return rejected('update', m.request_forms_error_invalid());

		const { active, ...values } = parsed.data;
		const outcome = await updateRequestForm(user, id.data.id, {
			...values,
			active: active === 'on'
		});
		if (!outcome.ok) return rejected('update', failureMessage(outcome.error), id.data.id);
		return { action: 'update' as const, message: null, id: null };
	},

	delete: async ({ locals, request }) => {
		const user = requireSettingsSection(locals.user, SECTION);
		const id = withId.safeParse(await fieldsOf(request));
		if (!id.success) return rejected('delete', m.request_forms_error_not_found());

		const outcome = await deleteRequestForm(user, id.data.id);
		if (!outcome.ok) return rejected('delete', failureMessage(outcome.error), id.data.id);
		return { action: 'delete' as const, message: null, id: null };
	}
};
