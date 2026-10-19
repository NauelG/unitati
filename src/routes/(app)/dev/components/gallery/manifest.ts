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
	'charts',
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
	// Its own category rather than more of "Datos" (#90): these two are the
	// only components in the app that render a *shape* instead of a value, and
	// they share one rule nothing else has — every chart ships an empty state.
	// A reader looking for that rule should find a section, not two rows.
	charts: 'Gráficos',
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
	{
		id: 'segmented-control',
		name: 'SegmentedControl',
		category: 'actions',
		summary: 'Selector de un grupo de opciones en una píldora: enlaces o botones.',
		sourceFile: 'SegmentedControl.svelte',
		load: () => import('./specs/SegmentedControl.svelte')
	},
	{
		id: 'user-menu',
		name: 'UserMenu',
		category: 'actions',
		summary: 'El botón de perfil de la topbar: identidad, tema y cerrar sesión en un menú.',
		sourceFile: 'UserMenu.svelte',
		load: () => import('./specs/UserMenu.svelte')
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
		id: 'form-error',
		name: 'FormError',
		category: 'fields',
		summary: 'La línea de error de un formulario: lo que dice el servidor al rechazar el envío.',
		sourceFile: 'FormError.svelte',
		load: () => import('./specs/FormError.svelte')
	},
	{
		id: 'form-actions',
		name: 'FormActions',
		category: 'fields',
		summary:
			'La fila de acciones de un formulario en Dialog o Sheet: secundaria primero, primaria última.',
		sourceFile: 'FormActions.svelte',
		load: () => import('./specs/FormActions.svelte')
	},
	{
		id: 'select-field',
		name: 'SelectField',
		category: 'fields',
		summary: 'El `Field` de una lista desplegable, vendorizada sobre el primitivo `select`.',
		sourceFile: 'SelectField.svelte',
		load: () => import('./specs/SelectField.svelte')
	},
	{
		id: 'search-select-field',
		name: 'SearchSelectField',
		category: 'fields',
		summary: 'Combobox buscable de una sola opción, para listas largas o remotas.',
		sourceFile: 'SearchSelectField.svelte',
		load: () => import('./specs/SearchSelectField.svelte')
	},

	// Feedback
	{
		id: 'alert',
		name: 'Alert',
		category: 'feedback',
		summary: 'Feedback persistente: error de formulario, aviso operativo, nota permanente.',
		sourceFile: 'Alert.svelte',
		load: () => import('./specs/Alert.svelte')
	},
	{
		id: 'dialog',
		name: 'Dialog',
		category: 'feedback',
		summary:
			'Diálogo corto de una a tres campos (ADR 0020): crear o editar una entrada de catálogo.',
		sourceFile: 'Dialog.svelte',
		load: () => import('./specs/Dialog.svelte')
	},
	{
		id: 'tooltip',
		name: 'Tooltip',
		category: 'feedback',
		summary: 'Etiqueta flotante para controles de solo icono, en hover y foco.',
		sourceFile: 'Tooltip.svelte',
		load: () => import('./specs/Tooltip.svelte')
	},
	{
		id: 'close-button',
		name: 'CloseButton',
		category: 'feedback',
		summary: 'El botón de cerrar de un overlay, con nombre accesible en español.',
		sourceFile: 'CloseButton.svelte',
		load: () => import('./specs/CloseButton.svelte')
	},
	{
		id: 'escalate-sheet',
		name: 'EscalateSheet',
		category: 'feedback',
		summary: 'Escalar un ticket a una tarea o un proyecto, nuevo o existente (#150).',
		sourceFile: 'EscalateSheet.svelte',
		load: () => import('./specs/EscalateSheet.svelte')
	},
	{
		id: 'sheet',
		name: 'Sheet',
		category: 'feedback',
		summary:
			'Edición contextual de un registro ya abierto (ADR 0020), sobre Sheet de shadcn-svelte.',
		sourceFile: 'Sheet.svelte',
		load: () => import('./specs/Sheet.svelte')
	},
	{
		id: 'confirm-dialog',
		name: 'ConfirmDialog',
		category: 'feedback',
		summary: 'Confirmación destructiva o de desvincular, sobre alert-dialog de shadcn-svelte.',
		sourceFile: 'ConfirmDialog.svelte',
		load: () => import('./specs/ConfirmDialog.svelte')
	},
	{
		id: 'status-badge',
		name: 'StatusBadge',
		category: 'feedback',
		summary: 'Insignia de estado, derivada de una clave de dominio, nunca de texto libre.',
		sourceFile: 'StatusBadge.svelte',
		load: () => import('./specs/StatusBadge.svelte')
	},
	{
		id: 'method-badge',
		name: 'MethodBadge',
		category: 'feedback',
		summary: 'El método HTTP de un caso de uso, con el tono de cuánto cambia la petición.',
		sourceFile: 'MethodBadge.svelte',
		load: () => import('./specs/MethodBadge.svelte')
	},
	{
		id: 'queue-label',
		name: 'QueueLabel',
		category: 'feedback',
		summary: 'El nombre de una cola con un punto del color asignado.',
		sourceFile: 'QueueLabel.svelte',
		load: () => import('./specs/QueueLabel.svelte')
	},
	{
		id: 'environment-badge',
		name: 'EnvironmentBadge',
		category: 'feedback',
		summary: 'Indicador de entorno no-productiva; no renderiza nada en producción.',
		sourceFile: 'EnvironmentBadge.svelte',
		load: () => import('./specs/EnvironmentBadge.svelte')
	},
	{
		id: 'empty-state',
		name: 'EmptyState',
		category: 'feedback',
		summary: 'El grid vacío compartido: título, frase, icono en disco suave y acción.',
		sourceFile: 'EmptyState.svelte',
		load: () => import('./specs/EmptyState.svelte')
	},
	{
		id: 'skeleton',
		name: 'Skeleton',
		category: 'feedback',
		summary:
			'Bloque surface-2 con un barrido de luz (#89): la forma de un contenido aún no llegado.',
		sourceFile: 'Skeleton.svelte',
		load: () => import('./specs/Skeleton.svelte')
	},
	{
		id: 'data-table-skeleton',
		name: 'DataTableSkeleton',
		category: 'feedback',
		summary: 'La geometría exacta de DataTable (cabecera + N filas) antes de las filas reales.',
		sourceFile: 'DataTableSkeleton.svelte',
		load: () => import('./specs/DataTableSkeleton.svelte')
	},
	{
		id: 'kpi-card-skeleton',
		name: 'KpiCardSkeleton',
		category: 'feedback',
		summary: 'La caja de KpiCard (etiqueta + número de 28/34) antes del recuento real.',
		sourceFile: 'KpiCardSkeleton.svelte',
		load: () => import('./specs/KpiCardSkeleton.svelte')
	},
	{
		id: 'timeline-skeleton',
		name: 'TimelineSkeleton',
		category: 'feedback',
		summary: 'El punto + carril de AssetTimeline, detrás del {#await} de la ficha de activo.',
		sourceFile: 'TimelineSkeleton.svelte',
		load: () => import('./specs/TimelineSkeleton.svelte')
	},
	{
		id: 'thread-skeleton',
		name: 'ThreadSkeleton',
		category: 'feedback',
		summary: 'El avatar + tarjeta de TicketThread, antes de que llegue el hilo real.',
		sourceFile: 'ThreadSkeleton.svelte',
		load: () => import('./specs/ThreadSkeleton.svelte')
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
		id: 'rolling-number',
		name: 'RollingNumber',
		category: 'data',
		summary: 'Un recuento que rueda cuando cambia y se queda quieto el resto del tiempo (S2).',
		sourceFile: 'RollingNumber.svelte',
		load: () => import('./specs/RollingNumber.svelte')
	},
	{
		id: 'rolling-text',
		name: 'RollingText',
		category: 'data',
		summary: 'Una frase traducida cuyos números ruedan, con la frase entera como nombre accesible.',
		sourceFile: 'RollingText.svelte',
		load: () => import('./specs/RollingText.svelte')
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
		id: 'description-list',
		name: 'DescriptionList',
		category: 'data',
		summary: 'Pares etiqueta/valor de una ficha en rejilla de 104 px + 1fr.',
		sourceFile: 'DescriptionList.svelte',
		load: () => import('./specs/DescriptionList.svelte')
	},
	{
		id: 'list-toolbar',
		name: 'ListToolbar',
		category: 'data',
		summary: 'La franja de búsqueda y filtros de un índice, pegada al panel de la tabla.',
		sourceFile: 'ListToolbar.svelte',
		load: () => import('./specs/ListToolbar.svelte')
	},
	{
		id: 'asset-timeline',
		name: 'AssetTimeline',
		category: 'data',
		summary: 'Un único carril de actividad de un activo, con sus relaciones de ticket en vivo.',
		sourceFile: 'AssetTimeline.svelte',
		load: () => import('./specs/AssetTimeline.svelte')
	},
	{
		id: 'schema-field-table',
		name: 'SchemaFieldTable',
		category: 'data',
		summary: 'Los campos de una petición o respuesta: nombre, tipo, obligatorio y descripción.',
		sourceFile: 'SchemaFieldTable.svelte',
		load: () => import('./specs/SchemaFieldTable.svelte')
	},

	// Charts
	{
		id: 'sparkline',
		name: 'Sparkline',
		category: 'charts',
		summary: 'Tendencia diaria sin ejes, para el pie de un KpiCard. Con estado vacío real.',
		sourceFile: 'Sparkline.svelte',
		load: () => import('./specs/Sparkline.svelte')
	},
	{
		id: 'donut-chart',
		name: 'DonutChart',
		category: 'charts',
		summary: 'Un reparto como anillo, con el total en el hueco. Con estado vacío real.',
		sourceFile: 'DonutChart.svelte',
		load: () => import('./specs/DonutChart.svelte')
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

	{
		id: 'relation-constellation',
		name: 'RelationConstellation',
		category: 'relations',
		summary: 'El vecindario de un registro: él al centro, sus vínculos alrededor (S3).',
		sourceFile: 'RelationConstellation.svelte',
		load: () => import('./specs/RelationConstellation.svelte')
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
		id: 'rich-text-editor',
		name: 'RichTextEditor',
		category: 'conversation',
		summary: 'Editor de texto enriquecido que guarda markdown, con barra de herramientas.',
		sourceFile: 'RichTextEditor.svelte',
		load: () => import('./specs/RichTextEditor.svelte')
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
	{
		id: 'breadcrumbs',
		name: 'Breadcrumbs',
		category: 'navigation',
		summary: 'Rastro de ruta de 56px en la ficha de un registro, con segmentos del servidor.',
		sourceFile: 'Breadcrumbs.svelte',
		load: () => import('./specs/Breadcrumbs.svelte')
	},
	{
		id: 'settings-nav',
		name: 'SettingsNav',
		category: 'navigation',
		summary: 'Navegación secundaria de Configuración: un encabezado por módulo y sus catálogos.',
		sourceFile: 'SettingsNav.svelte',
		load: () => import('./specs/SettingsNav.svelte')
	},
	{
		id: 'global-search',
		name: 'GlobalSearch',
		category: 'navigation',
		summary:
			'Búsqueda global ⌘K: una caja sobre todos los registros, con permisos aplicados en la consulta, y las acciones permitidas.',
		sourceFile: 'GlobalSearch.svelte',
		load: () => import('./specs/GlobalSearch.svelte')
	},
	{
		id: 'keymap-overlay',
		name: 'KeymapOverlay',
		category: 'navigation',
		summary: 'La ayuda `?`: cada atajo registrado, agrupado por zona, generada desde keymap.ts.',
		sourceFile: 'KeymapOverlay.svelte',
		load: () => import('./specs/KeymapOverlay.svelte')
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
		id: 'text-area-field',
		name: 'TextAreaField',
		category: 'fields',
		summary: 'Campo de texto multilínea con etiqueta, pista y error.',
		sourceFile: 'TextAreaField.svelte',
		load: () => import('./specs/TextAreaField.svelte')
	},
	{
		id: 'project-progress',
		name: 'ProjectProgress',
		category: 'data',
		summary: 'Barra de progreso de un proyecto: completadas ÷ (total − canceladas).',
		sourceFile: 'ProjectProgress.svelte',
		load: () => import('./specs/ProjectProgress.svelte')
	},
	{
		id: 'task-board',
		name: 'TaskBoard',
		category: 'data',
		summary: 'El tablero kanban de un proyecto: «Mover a…» como acción y arrastre por encima.',
		sourceFile: 'TaskBoard.svelte',
		load: () => import('./specs/TaskBoard.svelte')
	},
	{
		id: 'board-column',
		name: 'BoardColumn',
		category: 'data',
		summary:
			'Una columna del tablero; plegada a mano o por estar vacía, una tira que sigue siendo destino.',
		sourceFile: 'BoardColumn.svelte',
		load: () => import('./specs/BoardColumn.svelte')
	},
	{
		id: 'task-card',
		name: 'TaskCard',
		category: 'data',
		summary: 'Tarjeta de tarea: código, título, personas asignadas, fecha y menú «Mover a…».',
		sourceFile: 'TaskCard.svelte',
		load: () => import('./specs/TaskCard.svelte')
	},
	{
		id: 'task-board-skeleton',
		name: 'TaskBoardSkeleton',
		category: 'feedback',
		summary: 'La silueta del tablero mientras carga.',
		sourceFile: 'TaskBoardSkeleton.svelte',
		load: () => import('./specs/TaskBoardSkeleton.svelte')
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
export const GALLERY_EXCEPTIONS: GalleryException[] = [
	{
		sourceFile: 'ThemeMenuItems.svelte',
		reason:
			'Not a standalone component: the theme radio group is the body of a dropdown menu and renders only inside one. It is shown, working, in the UserMenu entry.'
	},
	{
		sourceFile: 'MoveTaskDialog.svelte',
		reason:
			"Bound to one record: it posts to the task record's own `moveToProject` action (#120), so it cannot render outside a task page. The generic shell is the Dialog entry."
	}
];

export function findComponentEntry(id: string): ComponentManifestEntry | undefined {
	return COMPONENT_MANIFEST.find((entry) => entry.id === id);
}

export function entriesByCategory(category: GalleryCategory): ComponentManifestEntry[] {
	return COMPONENT_MANIFEST.filter((entry) => entry.category === category);
}
