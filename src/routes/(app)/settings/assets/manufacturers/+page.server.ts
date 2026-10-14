import {
	createManufacturer,
	deleteManufacturer,
	listManufacturers,
	renameManufacturer
} from '#lib/server/assets/index.js';
import { m } from '#lib/paraglide/messages.js';
import { nameCatalogue } from '../name-catalogue';

const catalogue = nameCatalogue({
	list: listManufacturers,
	create: createManufacturer,
	rename: renameManufacturer,
	remove: deleteManufacturer,
	inUseMessage: m.catalogue_error_in_use_manufacturer,
	section: '/settings/assets/manufacturers'
});

export const load = catalogue.load;
export const actions = catalogue.actions;
