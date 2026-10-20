import { fail } from '@sveltejs/kit';
import { z } from 'zod';
import { m } from '#lib/paraglide/messages.js';
import {
	LINK_VALID_DAYS_MAX,
	LINK_VALID_DAYS_MIN,
	getHandoverSettings,
	listCategories,
	listHandoverAgreements,
	listHandoverTemplateVersions,
	removeHandoverOverride,
	saveHandoverTemplate,
	setHandoverLinkValidDays,
	type HandoverDirection
} from '#lib/server/assets/index.js';
import { requireSettingsSection } from '#lib/server/settings/guard.js';
import { fieldsOf, rejected, withId } from '../../../assets/form-data';
import type { Actions, PageServerLoad } from './$types';

const SECTION = '/settings/assets/handover-agreements';
const DIRECTIONS: readonly HandoverDirection[] = ['delivery', 'return'];

export const load: PageServerLoad = async ({ locals }) => {
	const user = requireSettingsSection(locals.user, SECTION);
	const [agreements, categories, settings] = await Promise.all([
		listHandoverAgreements(user.organisationId),
		listCategories(user.organisationId),
		getHandoverSettings(user.organisationId)
	]);

	const withVersions = await Promise.all(
		agreements.map(async (agreement) => ({
			...agreement,
			versions: await listHandoverTemplateVersions(user.organisationId, agreement.templateId)
		}))
	);

	return {
		agreements: withVersions,
		categories: categories.map(({ id, name }) => ({ id, name })),
		missingGlobals: DIRECTIONS.filter(
			(direction) => !agreements.some((a) => a.direction === direction && a.categoryId === null)
		),
		linkValidDays: settings.linkValidDays,
		linkValidDaysMin: LINK_VALID_DAYS_MIN,
		linkValidDaysMax: LINK_VALID_DAYS_MAX
	};
};

const saveInput = z.object({
	direction: z.enum(['delivery', 'return']),
	categoryId: z.uuid().optional(),
	body: z.string()
});

export const actions: Actions = {
	save: async ({ request, locals }) => {
		const user = requireSettingsSection(locals.user, SECTION);
		const fields = await fieldsOf(request);
		const parsed = saveInput.safeParse({
			...fields,
			categoryId: fields.categoryId === '' ? undefined : fields.categoryId
		});
		if (!parsed.success) return rejected('save', m.handover_agreements_error_empty());

		const outcome = await saveHandoverTemplate(user, {
			direction: parsed.data.direction,
			categoryId: parsed.data.categoryId ?? null,
			body: parsed.data.body
		});
		if (!outcome.ok) {
			const message =
				outcome.error === 'category_not_found'
					? m.handover_agreements_error_category()
					: m.handover_agreements_error_empty();
			return rejected('save', message);
		}
		return { action: 'save' as const, message: null, id: null };
	},

	removeOverride: async ({ request, locals }) => {
		const user = requireSettingsSection(locals.user, SECTION);
		const target = withId.safeParse(await fieldsOf(request));
		if (!target.success) return rejected('delete', m.handover_agreements_error_not_found());

		const outcome = await removeHandoverOverride(user, target.data.id);
		if (!outcome.ok) {
			const message =
				outcome.error === 'in_use'
					? m.handover_agreements_remove_in_use()
					: m.handover_agreements_error_not_found();
			return rejected('delete', message, target.data.id);
		}
		return { action: 'delete' as const, message: null, id: null };
	},

	linkDays: async ({ request, locals }) => {
		const user = requireSettingsSection(locals.user, SECTION);
		const days = Number((await fieldsOf(request)).days);

		const outcome = await setHandoverLinkValidDays(user, days);
		if (!outcome.ok) {
			return fail(400, {
				action: 'linkDays' as const,
				message: m.handover_link_error({ min: LINK_VALID_DAYS_MIN, max: LINK_VALID_DAYS_MAX }),
				id: null
			});
		}
		return { action: 'linkDays' as const, message: null, id: null };
	}
};
