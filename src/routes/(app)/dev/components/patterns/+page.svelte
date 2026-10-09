<script lang="ts">
	import PageHeader from '#lib/components/unitati/PageHeader.svelte';
	import WorkPanel from '#lib/components/unitati/WorkPanel.svelte';

	interface Pattern {
		title: string;
		body: string;
		links: { id: string; label: string }[];
	}

	const patterns: Pattern[] = [
		{
			title: 'Shell de navegación con scroll independiente',
			body: 'AppShell fija el sidebar y la topbar; solo <main> se desplaza (ADR 0015/0016). Ninguna página bajo (app) añade su propio contenedor de scroll — si una pantalla necesita un panel con scroll propio dentro de main, ese panel es un WorkPanel con overflow-y propio, no una segunda capa de AppShell.',
			links: [{ id: 'app-shell', label: 'AppShell' }]
		},
		{
			title: 'Barra de herramientas de lista + tabla en un panel de trabajo',
			body: 'Una página index compone PageHeader (título + acción primaria de alta) seguido de un WorkPanel que envuelve un DataTable. El WorkPanel nunca lleva heading propio aquí — el título ya lo dio PageHeader — así que se usa sin heading/actions, solo como el borde de 12px alrededor de la tabla.',
			links: [
				{ id: 'page-header', label: 'PageHeader' },
				{ id: 'work-panel', label: 'WorkPanel' },
				{ id: 'data-table', label: 'DataTable' }
			]
		},
		{
			title: 'Hilo público + compositor como superficie primaria, rail lateral como secundaria',
			body: 'PageLayout variant="record" separa dos columnas: la principal lleva TicketDetailLayout + TicketThread + TicketComposer, que son el área de trabajo primaria y por eso componen directamente, sin WorkPanel envolviéndolas. La columna side lleva RelatedRecords, que ya es su propio panel — la secundaria sí se acota.',
			links: [
				{ id: 'ticket-detail-layout', label: 'TicketDetailLayout' },
				{ id: 'ticket-thread', label: 'TicketThread' },
				{ id: 'ticket-composer', label: 'TicketComposer' },
				{ id: 'related-records', label: 'RelatedRecords' }
			]
		},
		{
			title: 'Dialog corto vs Sheet largo vs formulario de página completa',
			body: 'Una confirmación de una frase vive donde se pide (RelatedRecords ya muestra el patrón: un formulario inline con confirm/cancel, no un diálogo modal). Un formulario corto que no necesita su propio ancho de página es un Sheet (el drawer móvil de AppShell usa el mismo primitivo de ui/sheet). Un formulario con varios campos relacionados es PageLayout variant="form" — la medida fija de ADR 0018. Qué formulario de ticket/alta usa cuál todavía depende de la decisión pendiente en #100: esta página documenta la regla, no la implementación de esa pantalla.',
			links: [{ id: 'page-layout', label: 'PageLayout' }]
		},
		{
			title: 'Select vs SearchSelect (AssetPicker)',
			body: 'SelectField es para un conjunto fijo y pequeño de opciones conocidas de antemano (estados, prioridades). AssetPicker (el "SearchSelect" de este sistema) es para elegir entre un universo que puede ser demasiado grande para cargar entero: pregunta a un endpoint mientras el usuario escribe. Ningún formulario debería usar un SelectField con cientos de <option> como sustituto de AssetPicker.',
			links: [
				{ id: 'select-field', label: 'SelectField' },
				{ id: 'asset-picker', label: 'AssetPicker' }
			]
		},
		{
			title: 'Alert vs ConfirmDialog (hoy: confirmación inline) vs Toast',
			body: 'Este sistema no tiene todavía un componente Alert ni un Toast (ninguno de los dos está en el design system actual). El único patrón de confirmación hoy es el inline de RelatedRecords: un botón "pedir" (ghost) seguido de un formulario con el mensaje de la pregunta y dos botones (danger para confirmar, ghost para cancelar) — nunca un diálogo modal para una sola frase. Cuando Alert/Toast lleguen, esta sección se actualiza para distinguir los tres; mientras tanto, el patrón inline es la única fuente de verdad.',
			links: [{ id: 'related-records', label: 'RelatedRecords' }]
		}
	];
</script>

<div class="flex flex-col gap-[var(--space-6)]">
	<PageHeader title="Patrones de composición">
		{#snippet summary()}
			Cómo los componentes se combinan en una pantalla real, no solo cómo se ven uno a uno. Las
			plantillas que una nueva pantalla reutiliza para encajar en este mismo sistema.
		{/snippet}
	</PageHeader>

	{#each patterns as pattern (pattern.title)}
		<WorkPanel heading={pattern.title}>
			<p class="text-sm leading-[22px] text-[var(--ink)]">{pattern.body}</p>
			<div class="mt-[var(--space-3)] flex flex-wrap gap-[var(--space-2)]">
				{#each pattern.links as link (link.id)}
					<a
						href="/dev/components/{link.id}"
						class="ut-badge ut-badge-neutral no-underline hover:underline">{link.label}</a
					>
				{/each}
			</div>
		</WorkPanel>
	{/each}
</div>
