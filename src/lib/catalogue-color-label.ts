import type { CatalogueColor } from '#lib/domain/catalogue-color.js';
import { m } from '#lib/paraglide/messages.js';

/** The name a person hears for a swatch: the palette key is not display text. */
export function catalogueColorLabel(color: CatalogueColor): string {
	switch (color) {
		case 'gray':
			return m.catalogue_color_gray();
		case 'blue':
			return m.catalogue_color_blue();
		case 'violet':
			return m.catalogue_color_violet();
		case 'pink':
			return m.catalogue_color_pink();
		case 'red':
			return m.catalogue_color_red();
		case 'amber':
			return m.catalogue_color_amber();
		case 'green':
			return m.catalogue_color_green();
		case 'teal':
			return m.catalogue_color_teal();
	}
}
