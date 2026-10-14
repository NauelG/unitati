/**
 * The command palette's "Registros" response shape (#88). Shared between
 * `/api/palette` (server) and `CommandPalette` (client) so neither imports
 * the other — a route file is not a module other code reaches into.
 */
export interface PaletteRecord {
	kind: 'asset' | 'ticket' | 'project' | 'task';
	tag: string;
	title: string;
	href: string;
}
