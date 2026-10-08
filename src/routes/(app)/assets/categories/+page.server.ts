import {
	createCategory,
	deleteCategory,
	listCategories,
	renameCategory
} from '#lib/server/assets/index.js';
import { m } from '#lib/paraglide/messages.js';
import { nameCatalogue } from '../name-catalogue';

const catalogue = nameCatalogue({
	list: listCategories,
	create: createCategory,
	rename: renameCategory,
	remove: deleteCategory,
	inUseMessage: m.catalogue_error_in_use_category
});

export const load = catalogue.load;
export const actions = catalogue.actions;
