import { error, fail, redirect } from '@sveltejs/kit';
import { JUSTIFICATION_MAX } from '#lib/domain/request-form.js';
import { requirePermission } from '#lib/server/auth/guards.js';
import { listCategories } from '#lib/server/assets/index.js';
import { getActiveRequestForm, submitEquipmentRequest } from '#lib/server/service-desk/index.js';
import { renderMarkdown } from '#lib/server/shared/markdown.js';
import { failureMessage } from '#lib/ticket-errors.js';
import type { Actions, PageServerLoad } from './$types';

/** A form the employee cannot use (inactive, foreign, unknown) is simply not there. */
async function formFor(user: App.Locals['user'], formId: string) {
	const viewer = requirePermission(user, 'tickets.create');
	const requestForm = await getActiveRequestForm(viewer, formId);
	if (!requestForm) error(404, 'Not found');
	return { viewer, requestForm };
}

export const load: PageServerLoad = async ({ locals, params }) => {
	const { viewer, requestForm } = await formFor(locals.user, params.formId);
	const categories = await listCategories(viewer.organisationId);

	return {
		requestForm: {
			id: requestForm.id,
			name: requestForm.name,
			descriptionHtml: renderMarkdown(requestForm.description)
		},
		categories: categories.map(({ id, name }) => ({ value: id, label: name })),
		justificationMax: JUSTIFICATION_MAX
	};
};

export const actions: Actions = {
	default: async ({ locals, params, request }) => {
		const { viewer, requestForm } = await formFor(locals.user, params.formId);
		const data = await request.formData();
		const text = (key: string) => {
			const value = data.get(key);
			return typeof value === 'string' ? value : '';
		};
		const values = {
			categoryId: text('categoryId'),
			justification: text('justification'),
			neededBy: text('neededBy')
		};

		const outcome = await submitEquipmentRequest(viewer, {
			formId: requestForm.id,
			categoryId: values.categoryId,
			justification: values.justification,
			neededBy: values.neededBy === '' ? undefined : values.neededBy
		});
		if (!outcome.ok) return fail(400, { message: failureMessage(outcome.error), values });

		redirect(303, `/portal/tickets/${encodeURIComponent(outcome.value.ticketTag)}`);
	}
};
