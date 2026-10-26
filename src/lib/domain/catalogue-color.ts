/**
 * The colours a catalogue entry (a queue, a label) can wear. A fixed palette, not free hex: every key has a
 * light and a dark value in `app.css` (`--catalogue-<key>`), so a dot stays legible
 * on both canvases and no admin can pick a colour that vanishes on one of them.
 *
 * The key is what is stored; the CSS variable is derived from it.
 */
export const CATALOGUE_COLORS = [
	'gray',
	'blue',
	'violet',
	'pink',
	'red',
	'amber',
	'green',
	'teal'
] as const;

export type CatalogueColor = (typeof CATALOGUE_COLORS)[number];

export const DEFAULT_CATALOGUE_COLOR: CatalogueColor = 'gray';

export function isCatalogueColor(value: unknown): value is CatalogueColor {
	return typeof value === 'string' && (CATALOGUE_COLORS as readonly string[]).includes(value);
}

/** The CSS custom property that holds the colour. Unknown keys fall back to the default. */
export function catalogueColorVar(color: string): string {
	return `var(--catalogue-${isCatalogueColor(color) ? color : DEFAULT_CATALOGUE_COLOR})`;
}
