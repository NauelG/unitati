/**
 * The knowledge base's closed sets (ADR 0031), shared by the server domain and
 * the client.
 *
 * A space's `icon` and `colour` are stored as **text keys of these sets**, not as
 * Postgres enums: both sets will grow, and Postgres cannot drop an enum value.
 * The domain validates the key; the database does not.
 */

/** Who reads a space: `staff` is technicians and admins, `portal` is every employee too. */
export const SPACE_AUDIENCES = ['staff', 'portal'] as const;

export type SpaceAudience = (typeof SPACE_AUDIENCES)[number];

/** lucide icon names (kebab-case, as `@lucide/svelte/icons/<name>` files are called). */
export const SPACE_ICONS = [
	'book',
	'book-open',
	'life-buoy',
	'wrench',
	'laptop',
	'server',
	'shield',
	'key',
	'users',
	'building',
	'printer',
	'wifi',
	'mail',
	'phone',
	'folder',
	'file-text',
	'graduation-cap',
	'rocket',
	'settings',
	'scale',
	'heart-handshake',
	'megaphone',
	'clipboard-list',
	'lightbulb'
] as const;

export type SpaceIcon = (typeof SPACE_ICONS)[number];

/**
 * Keys of the palette. Every key has a light and a dark value in `app.css`
 * (`--kb-<key>`), so a swatch stays legible on both canvases and nobody picks a
 * colour that vanishes on one of them. No free hex anywhere.
 */
export const SPACE_COLOURS = [
	'gray',
	'blue',
	'violet',
	'pink',
	'red',
	'amber',
	'green',
	'teal'
] as const;

export type SpaceColour = (typeof SPACE_COLOURS)[number];

export const DEFAULT_SPACE_ICON: SpaceIcon = 'book-open';
export const DEFAULT_SPACE_COLOUR: SpaceColour = 'blue';

export const SPACE_NAME_MAX = 80;
export const SPACE_DESCRIPTION_MAX = 280;

export function isSpaceIcon(value: unknown): value is SpaceIcon {
	return typeof value === 'string' && (SPACE_ICONS as readonly string[]).includes(value);
}

export function isSpaceColour(value: unknown): value is SpaceColour {
	return typeof value === 'string' && (SPACE_COLOURS as readonly string[]).includes(value);
}

/** The CSS custom property holding a colour. Unknown keys fall back to the default. */
export function spaceColourVar(colour: string): string {
	return `var(--kb-${isSpaceColour(colour) ? colour : DEFAULT_SPACE_COLOUR})`;
}
