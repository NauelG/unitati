import {
	createCategory,
	deleteCategory,
	listCategories,
	renameCategory,
	setCategoryRequiresHandover
} from '#lib/server/assets/index.js';
import { m } from '#lib/paraglide/messages.js';
import { requireSettingsSection } from '#lib/server/settings/guard.js';
import { fieldsOf, rejected, withId } from '../../../assets/form-data';
import { nameCatalogue } from '../name-catalogue';

const SECTION = '/settings/assets/categories';

const catalogue = nameCatalogue({
	list: listCategories,
	create: createCategory,
	rename: renameCategory,
	remove: deleteCategory,
	inUseMessage: m.catalogue_error_in_use_category,
	section: SECTION
});

export const load = catalogue.load;
export const actions = {
	...catalogue.actions,

	/** The "requires handover" switch (ADR 0035): a checkbox is absent from the form when off. */
	setRequiresHandover: async ({ request, locals }: Parameters<typeof catalogue.load>[0]) => {
		const user = requireSettingsSection(locals.user, SECTION);
		const fields = await fieldsOf(request);
		const target = withId.safeParse(fields);
		if (!target.success) return rejected('rename', m.catalogue_error_not_found());

		const outcome = await setCategoryRequiresHandover(
			user,
			target.data.id,
			fields.requiresHandover === 'on'
		);
		if (!outcome.ok) return rejected('rename', m.catalogue_error_not_found(), target.data.id);
		return { action: 'rename' as const, message: null, id: null };
	}
};
