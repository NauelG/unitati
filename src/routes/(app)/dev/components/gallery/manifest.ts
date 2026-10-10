import type { Component } from 'svelte';

/**
 * The gallery's category vocabulary (#85). Fixed by the issue, not derived:
 * a category is an editorial grouping for the index and the coverage page,
 * not a property any component declares about itself.
 */
export const GALLERY_CATEGORIES = [
	'actions',
	'fields',
	'feedback',
	'data',
	'relations',
	'conversation',
	'navigation',
	'layout'
] as const;

export type GalleryCategory = (typeof GALLERY_CATEGORIES)[number];

/** Display label per category. Spanish, like the rest of the gallery's copy. */
export const CATEGORY_LABEL: Record<GalleryCategory, string> = {
	actions: 'Acciones',
	fields: 'Campos',
	feedback: 'Feedback',
	data: 'Datos',
	relations: 'Relaciones',
	conversation: 'Conversación',
	navigation: 'Navegación',
	layout: 'Layout'
};

export interface PropDoc {
	name: string;
	type: string;
	/** Omitted for a required prop. */
	default?: string;
	description: string;
}

export interface ComponentManifestEntry {
	/** Kebab-case, used as the `[component]` route segment. */
	id: string;
	/** The exported component's own name — matches `sourceFile` without the extension. */
	name: string;
	category: GalleryCategory;
	/** One line, used on the category index and the coverage page. */
	summary: string;
	/** File name inside `src/lib/components/unitati/`. What the coverage guard checks against. */
	sourceFile: string;
	/** Lazy: the index never pays for 20 components' worth of demo fixtures. */
	load: () => Promise<{ default: Component }>;
}

/**
 * One entry per documented component, in reading order within its category.
 * Adding a component to `unitati/` means adding its entry and its spec under
 * `gallery/specs/` — the guard in `gallery.guard.spec.ts` fails the build
 * otherwise. See `GALLERY_EXCEPTIONS` for the alternative.
 */
export const COMPONENT_MANIFEST: ComponentManifestEntry[] = [
	// Actions
	{
		id: 'button',
		name: 'Button',
		category: 'actions',
		summary: 'Control interactivo primario; renderiza un `<a>` cuando recibe `href`.',
		sourceFile: 'Button.svelte',
		load: () => import('./specs/Button.svelte')
	},

	// Fields
	{
		id: 'field',
		name: 'Field',
		category: 'fields',
		summary: 'Campo de texto con etiqueta, ayuda y error.',
		sourceFile: 'Field.svelte',
		load: () => import('./specs/Field.svelte')
	},
	{
		id: 'select-field',
		name: 'SelectField',
		category: 'fields',
		summary: 'El `Field` de un `<select>`, comparte sus estilos.',
		sourceFile: 'SelectField.svelte',
		load: () => import('./specs/SelectField.svelte')
	},
	{
		id: 'asset-picker',
		name: 'AssetPicker',
		category: 'fields',
		summary: 'Selector múltiple de activos con búsqueda en vivo.',
		sourceFile: 'AssetPicker.svelte',
		load: () => import('./specs/AssetPicker.svelte')
	},

	// Feedback
	{
		id: 'status-badge',
		name: 'StatusBadge',
		category: 'feedback',
		summary: 'Insignia de estado, derivada de una clave de dominio, nunca de texto libre.',
		sourceFile: 'StatusBadge.svelte',
		load: () => import('./specs/StatusBadge.svelte')
	},
	{
		id: 'environment-badge',
		name: 'EnvironmentBadge',
		category: 'feedback',
		summary: 'Indicador de entorno no-productiva; no renderiza nada en producción.',
		sourceFile: 'EnvironmentBadge.svelte',
		load: () => import('./specs/EnvironmentBadge.svelte')
	},

	// Data
	{
		id: 'avatar',
		name: 'Avatar',
		category: 'data',
		summary: 'Disco de identidad de una persona, opcionalmente con nombre/meta o imagen.',
		sourceFile: 'Avatar.svelte',
		load: () => import('./specs/Avatar.svelte')
	},
	{
		id: 'kpi-card',
		name: 'KpiCard',
		category: 'data',
		summary: 'Un recuento de un vistazo: etiqueta corta y número tabular, sin decoración.',
		sourceFile: 'KpiCard.svelte',
		load: () => import('./specs/KpiCard.svelte')
	},
	{
		id: 'data-table',
		name: 'DataTable',
		category: 'data',
		summary: 'Tabla genérica ordenable y seleccionable, con fila-enlace y estado vacío.',
		sourceFile: 'DataTable.svelte',
		load: () => import('./specs/DataTable.svelte')
	},
	{
		id: 'asset-timeline',
		name: 'AssetTimeline',
		category: 'data',
		summary: 'Un único carril de actividad de un activo, con sus relaciones de ticket en vivo.',
		sourceFile: 'AssetTimeline.svelte',
		load: () => import('./specs/AssetTimeline.svelte')
	},

	// Relations
	{
		id: 'record-ref',
		name: 'RecordRef',
		category: 'relations',
		summary: 'Chip de referencia en línea, con tinte, a un registro (activo o ticket).',
		sourceFile: 'RecordRef.svelte',
		load: () => import('./specs/RecordRef.svelte')
	},
	{
		id: 'related-records',
		name: 'RelatedRecords',
		category: 'relations',
		summary: 'Panel lateral de registros vinculados, agrupados por relación.',
		sourceFile: 'RelatedRecords.svelte',
		load: () => import('./specs/RelatedRecords.svelte')
	},

	// Conversation
	{
		id: 'ticket-thread',
		name: 'TicketThread',
		category: 'conversation',
		summary: 'Carril cronológico de una conversación: comentarios y eventos del sistema.',
		sourceFile: 'TicketThread.svelte',
		load: () => import('./specs/TicketThread.svelte')
	},
	{
		id: 'ticket-composer',
		name: 'TicketComposer',
		category: 'conversation',
		summary: 'Caja de respuesta/nota interna al final de un hilo, con envío por ⌘↵.',
		sourceFile: 'TicketComposer.svelte',
		load: () => import('./specs/TicketComposer.svelte')
	},
	{
		id: 'ticket-detail-layout',
		name: 'TicketDetailLayout',
		category: 'conversation',
		summary: 'Cabecera de ficha de ticket: chips de código/estado/prioridad, asunto y procedencia.',
		sourceFile: 'TicketDetailLayout.svelte',
		load: () => import('./specs/TicketDetailLayout.svelte')
	},

	// Navigation
	{
		id: 'app-shell',
		name: 'AppShell',
		category: 'navigation',
		summary: 'El marco de la app: sidebar y topbar fijos, scroll de main independiente.',
		sourceFile: 'AppShell.svelte',
		load: () => import('./specs/AppShell.svelte')
	},
	{
		id: 'pager',
		name: 'Pager',
		category: 'navigation',
		summary: 'Anterior/siguiente como enlaces, porque una página es una URL.',
		sourceFile: 'Pager.svelte',
		load: () => import('./specs/Pager.svelte')
	},
	{
		id: 'logo',
		name: 'Logo',
		category: 'navigation',
		summary: 'Marca de la app: símbolo solo o símbolo + logotipo.',
		sourceFile: 'Logo.svelte',
		load: () => import('./specs/Logo.svelte')
	},

	// Layout
	{
		id: 'page-layout',
		name: 'PageLayout',
		category: 'layout',
		summary: 'El vocabulario de ancho de página (ADR 0018): tres formas, ningún contenedor propio.',
		sourceFile: 'PageLayout.svelte',
		load: () => import('./specs/PageLayout.svelte')
	},
	{
		id: 'page-header',
		name: 'PageHeader',
		category: 'layout',
		summary: 'Cabecera de página compartida: código, título, resumen y acciones.',
		sourceFile: 'PageHeader.svelte',
		load: () => import('./specs/PageHeader.svelte')
	},
	{
		id: 'work-panel',
		name: 'WorkPanel',
		category: 'layout',
		summary: 'Región secundaria acotada (ADR 0019): un panel con cabecera y acciones opcionales.',
		sourceFile: 'WorkPanel.svelte',
		load: () => import('./specs/WorkPanel.svelte')
	}
];

export interface GalleryException {
	/** File name inside `src/lib/components/unitati/`, same key the guard checks. */
	sourceFile: string;
	/** Why this component has no gallery page. Reviewed, not a silent opt-out. */
	reason: string;
}

/**
 * Components the guard must not flag. Empty today: every `unitati/*.svelte`
 * file has a manifest entry above. A future entry here needs the same
 * scrutiny `unitati/README.md`'s old "deliberately missing" list had —
 * a reason a reviewer would accept, not "not done yet".
 */
export const GALLERY_EXCEPTIONS: GalleryException[] = [];

export function findComponentEntry(id: string): ComponentManifestEntry | undefined {
	return COMPONENT_MANIFEST.find((entry) => entry.id === id);
}

export function entriesByCategory(category: GalleryCategory): ComponentManifestEntry[] {
	return COMPONENT_MANIFEST.filter((entry) => entry.category === category);
}
