<script lang="ts">
	import DataTable, { type DataTableColumn } from '#lib/components/unitati/DataTable.svelte';
	import PageHeader from '#lib/components/unitati/PageHeader.svelte';
	import RelatedRecords from '#lib/components/unitati/RelatedRecords.svelte';
	import StatusBadge from '#lib/components/unitati/StatusBadge.svelte';
	import TicketDetailLayout from '#lib/components/unitati/TicketDetailLayout.svelte';
	import TicketThread from '#lib/components/unitati/TicketThread.svelte';
	import WorkPanel from '#lib/components/unitati/WorkPanel.svelte';
	import type { RelatedGroup } from '#lib/server/links/related.js';
	import type { ThreadItem } from '#lib/server/service-desk/comments.js';

	interface Pattern {
		title: string;
		body: string;
		links: { id: string; label: string }[];
	}

	interface FeedbackRule {
		situation: string;
		use: string;
		why: string;
	}

	interface WorkflowRule {
		situation: string;
		use: string;
		why: string;
	}

	/**
	 * The form-workflow decision table #100/ADR 0020 asks for: which of the
	 * three shapes a given task needs. Order matters — narrowest scope first,
	 * so a reader checks "is this short enough for a Dialog?" before reaching
	 * for a heavier shape by habit.
	 */
	const FORM_WORKFLOW_TABLE: WorkflowRule[] = [
		{
			situation: 'Crear o editar una entrada de catálogo (nueva categoría, editar un modelo)',
			use: 'Dialog',
			why: 'Una a tres campos, una sola acción primaria, un único contenedor de scroll — nunca una subtarea anidada dentro.'
		},
		{
			situation: 'Editar un registro que la visita ya tenía abierto (una ficha, una fila de lista)',
			use: 'Sheet',
			why: 'No navega fuera de la página que ya daba el contexto; la ruta canónica sigue existiendo para navegación directa y envío sin JS — el Sheet es progressive enhancement sobre la misma validación y la misma action, nunca una segunda copia.'
		},
		{
			situation:
				'Crear un registro con una subtarea propia (un activo que puede necesitar crear su modelo)',
			use: 'PageLayout variant="record" + WorkPanel en side',
			why: 'La subtarea es un trabajo genuino, no una nota al margen: merece su propia columna de 340px, no un <details> colapsado compitiendo por los mismos 672px que el formulario principal.'
		},
		{
			situation: 'Crear un registro con un solo formulario, sin subtarea (la mayoría de altas)',
			use: 'PageLayout variant="form"',
			why: 'Una medida fija de 672px es la que ADR 0018 reserva para esto — ensanchar sin una razón solo deja el formulario flotando en un canvas vacío.'
		},
		{
			situation:
				'Un formulario largo con descripción, selección de activos y adjuntos (abrir un ticket)',
			use: 'Página completa (full page), sin Dialog ni Sheet',
			why: 'Excede el ámbito de un Dialog (una a tres campos) y el de un Sheet (editar algo que ya existía); el portal de empleado necesita seguir siendo independientemente simple.'
		},
		{
			situation: 'Eliminar, desvincular, o cualquier consecuencia irreversible',
			use: 'ConfirmDialog, no Dialog',
			why: 'Dialog es para un formulario real con su propio envío; ConfirmDialog ya construye el botón de confirmar, su tono y el bloqueo de Cancelar/Escape mientras la mutación está en curso.'
		}
	];

	/**
	 * The feedback decision table #99 asks for: which of the taxonomy's pieces
	 * answers which situation. #89's toast row is a placeholder — the row
	 * exists so the table is complete, but the component behind it is not
	 * built here.
	 */
	const FEEDBACK_TABLE: FeedbackRule[] = [
		{
			situation: 'Error de un campo concreto',
			use: 'Field / SelectField (prop error)',
			why: 'Ya asociado con aria-describedby; un Alert al lado duplicaría el anuncio.'
		},
		{
			situation: 'Error a nivel de formulario (no de un campo)',
			use: 'Alert tone="danger"',
			why: 'role="alert"/aria-live="assertive": interrumpe, porque el envío falló.'
		},
		{
			situation: 'Aviso operativo que se queda en contexto',
			use: 'Alert tone="warning" o "info"',
			why: 'role="status"/polite: informa sin interrumpir cada vez que la página se repinta.'
		},
		{
			situation: 'Acción destructiva o que rompe una relación (eliminar, desvincular)',
			use: 'ConfirmDialog',
			why: 'Nombra el registro concreto, bloquea Cancelar/Escape mientras hay una mutación en curso y nunca se cierra solo antes de que el servidor responda.'
		},
		{
			situation: 'Éxito/fallo puntual de una acción de red',
			use: 'Toast (#89, todavía sin construir)',
			why: 'Transitorio por definición: ni Alert ni ConfirmDialog se quedan ni desaparecen solos.'
		},
		{
			situation: 'Guardar, asignar, filtrar — cualquier interacción rutinaria',
			use: 'Ningún diálogo de confirmación',
			why: 'window.confirm()/alert() no se usan en este sistema; una confirmación solo cuando la consecuencia lo merece.'
		}
	];

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
			title: 'Dialog corto vs Sheet contextual vs página completa',
			body: 'Tres formas de tarea (#100, ADR 0020), elegidas por lo que la tarea necesita, no por costumbre: Dialog para una a tres campos con una sola acción (las catálogos de categorías, fabricantes y modelos ya lo usan tanto para crear como para editar), Sheet para editar un registro que la visita ya tenía abierto sin navegar fuera de él (la ficha de un activo ya lo usa, encima de la misma ruta canónica y la misma action que su página de edición), página completa — con o sin columna lateral de PageLayout variant="record" — para una creación con su propia subtarea o un formulario largo. La tabla de abajo es la fuente de verdad.',
			links: [
				{ id: 'dialog', label: 'Dialog' },
				{ id: 'sheet', label: 'Sheet' },
				{ id: 'page-layout', label: 'PageLayout' },
				{ id: 'work-panel', label: 'WorkPanel' }
			]
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
			title: 'Alert vs ConfirmDialog vs Toast',
			body: 'Tres piezas distintas de la misma taxonomía de feedback (#99), nunca intercambiables: Alert para lo que se queda en contexto, ConfirmDialog para lo que pide una decisión antes de una consecuencia irreversible, Toast (#89, todavía sin construir) para lo transitorio. La tabla de abajo es la fuente de verdad — RelatedRecords (desvincular) y el catálogo de Categorías/Fabricantes (eliminar) ya usan ConfirmDialog; service-desk/new ya usa Alert para su error de formulario.',
			links: [
				{ id: 'alert', label: 'Alert' },
				{ id: 'confirm-dialog', label: 'ConfirmDialog' },
				{ id: 'related-records', label: 'RelatedRecords' }
			]
		}
	];

	/**
	 * Composed screen specimens for #101: not individual components (each
	 * already has its own gallery page) but the same real screens the issue's
	 * four reported v0.14.0 screenshots named, at the row counts/edge cases
	 * the issue's "Done when" checklist asks to prove — one row, fifty rows,
	 * a 70-character related-asset name at the 320px rail width, long asset
	 * detail values.
	 */
	interface IndexRow {
		tag: string;
		subject: string;
		status: 'in_progress' | 'resolved';
	}

	function indexRows(count: number): IndexRow[] {
		return Array.from({ length: count }, (_, index) => ({
			tag: `TCK-${String(index + 1).padStart(4, '0')}`,
			subject:
				index === 0 ? 'El portátil no enciende tras la actualización' : `Incidencia ${index + 1}`,
			status: index % 3 === 0 ? 'resolved' : 'in_progress'
		}));
	}

	const indexColumns: DataTableColumn<IndexRow>[] = [
		{ key: 'tag', header: 'Código', cell: indexTagCell },
		{ key: 'subject', header: 'Asunto', cell: indexSubjectCell },
		{ key: 'status', header: 'Estado', cell: indexStatusCell }
	];

	const longAssetName =
		'Estación de acoplamiento USB-C de repuesto para portátiles de desarrollo, almacén central';

	const threadWithLongAsset: ThreadItem[] = [
		{
			kind: 'comment',
			id: 'c1',
			authorPersonId: 'p1',
			authorName: 'Ada Lovelace',
			body: 'El equipo no enciende desde esta mañana, ya lo he cargado toda la noche.',
			visibility: 'public',
			createdAt: new Date('2026-03-01T09:05:00Z'),
			attachments: []
		},
		{
			kind: 'comment',
			id: 'c2',
			authorPersonId: 'p2',
			authorName: 'Soporte técnico',
			body: 'Nota interna: comprobar garantía antes de ofrecer sustitución.',
			visibility: 'internal',
			createdAt: new Date('2026-03-01T10:00:00Z'),
			attachments: []
		}
	];

	const relatedWithLongName: RelatedGroup[] = [
		{
			relation: 'affects',
			icon: 'asset',
			items: [
				{
					linkedAt: new Date('2026-03-01T09:00:00Z'),
					ref: { kind: 'asset', id: '1', tag: 'AST-0231', title: longAssetName, href: '#' },
					status: 'in_use'
				},
				{
					linkedAt: new Date('2026-03-01T09:00:00Z'),
					ref: { kind: 'asset', id: '2', tag: 'AST-0232', title: 'Monitor Dell 27"', href: '#' },
					status: 'in_repair'
				}
			]
		}
	];

	interface CatalogueRow {
		id: string;
		name: string;
		manufacturerName: string;
		categoryName: string;
	}

	function catalogueRows(count: number): CatalogueRow[] {
		return Array.from({ length: count }, (_, index) => ({
			id: String(index + 1),
			name: index === 0 ? 'MacBook Pro 14" (M3 Pro)' : `Modelo ${index + 1}`,
			manufacturerName: 'Apple',
			categoryName: 'Portátil'
		}));
	}
</script>

{#snippet indexTagCell(row: IndexRow)}<span class="font-mono text-xs">{row.tag}</span>{/snippet}
{#snippet indexSubjectCell(row: IndexRow)}{row.subject}{/snippet}
{#snippet indexStatusCell(row: IndexRow)}<StatusBadge status={row.status} />{/snippet}

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

			{#if pattern.title === 'Dialog corto vs Sheet contextual vs página completa'}
				<div class="mt-[var(--space-4)] overflow-x-auto">
					<table class="ut-table w-full text-sm">
						<thead>
							<tr>
								<th class="px-[var(--space-3)] py-2 text-left">Situación</th>
								<th class="px-[var(--space-3)] py-2 text-left">Usa</th>
								<th class="px-[var(--space-3)] py-2 text-left">Por qué</th>
							</tr>
						</thead>
						<tbody>
							{#each FORM_WORKFLOW_TABLE as rule (rule.situation)}
								<tr>
									<td class="px-[var(--space-3)] py-2">{rule.situation}</td>
									<td class="px-[var(--space-3)] py-2 font-medium">{rule.use}</td>
									<td class="px-[var(--space-3)] py-2 text-[var(--ink-muted)]">{rule.why}</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			{/if}

			{#if pattern.title === 'Alert vs ConfirmDialog vs Toast'}
				<div class="mt-[var(--space-4)] overflow-x-auto">
					<table class="ut-table w-full text-sm">
						<thead>
							<tr>
								<th class="px-[var(--space-3)] py-2 text-left">Situación</th>
								<th class="px-[var(--space-3)] py-2 text-left">Usa</th>
								<th class="px-[var(--space-3)] py-2 text-left">Por qué</th>
							</tr>
						</thead>
						<tbody>
							{#each FEEDBACK_TABLE as rule (rule.situation)}
								<tr>
									<td class="px-[var(--space-3)] py-2">{rule.situation}</td>
									<td class="px-[var(--space-3)] py-2 font-medium">{rule.use}</td>
									<td class="px-[var(--space-3)] py-2 text-[var(--ink-muted)]">{rule.why}</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			{/if}
		</WorkPanel>
	{/each}

	<PageHeader title="Especímenes compuestos">
		{#snippet summary()}
			Las cuatro pantallas que el issue #101 pidió probar, con los mismos componentes que las rutas
			reales — una fila, cincuenta filas, un nombre de activo de 70 caracteres en el rail de 320px,
			valores largos de ficha. No son componentes nuevos: cada pieza ya tiene su propia página de
			galería; esto es la composición final, así que ningún especimen aquí envuelve con un WorkPanel
			adicional lo que ya es su propio panel — el mismo "no double border" que el issue pide en las
			pantallas reales.
		{/snippet}
	</PageHeader>

	<section>
		<h3 class="text-[15px] leading-[22px] font-semibold text-[var(--ink)]">
			Índice de lista — una fila y cincuenta filas
		</h3>
		<div class="mt-[var(--space-3)] grid gap-[var(--space-5)] lg:grid-cols-2">
			<div>
				<p class="ut-muted mb-2 text-xs font-semibold tracking-[0.04em] uppercase">Una fila</p>
				<DataTable
					columns={indexColumns}
					rows={indexRows(1)}
					rowKey={(row) => row.tag}
					rowLabel={(row) => row.subject}
					emptyMessage="Todavía no hay tickets."
				/>
			</div>
			<div>
				<p class="ut-muted mb-2 text-xs font-semibold tracking-[0.04em] uppercase">
					Cincuenta filas
				</p>
				<DataTable
					columns={indexColumns}
					rows={indexRows(50)}
					rowKey={(row) => row.tag}
					rowLabel={(row) => row.subject}
					emptyMessage="Todavía no hay tickets."
					compact
				/>
			</div>
		</div>
	</section>

	<section>
		<h3 class="text-[15px] leading-[22px] font-semibold text-[var(--ink)]">
			Ficha de ticket — mensajes públicos/internos y activo relacionado largo
		</h3>
		<div class="mt-[var(--space-3)] grid gap-[var(--space-5)] lg:grid-cols-[1fr_320px]">
			<WorkPanel>
				<TicketDetailLayout
					ticketTag="TCK-0042"
					subject="No enciende el portátil"
					status="in_progress"
					priority="high"
					provenance="Abierto por Ada Lovelace · 1 mar 2026, 09:00 · vía portal"
				/>
				<div class="mt-[var(--space-5)]">
					<TicketThread items={threadWithLongAsset} attachmentHref={(id) => `#${id}`} />
				</div>
			</WorkPanel>
			<div class="w-full max-w-[320px]">
				<RelatedRecords groups={relatedWithLongName} />
			</div>
		</div>
	</section>

	<section>
		<h3 class="text-[15px] leading-[22px] font-semibold text-[var(--ink)]">
			Ficha de activo — valores largos
		</h3>
		<div class="mt-[var(--space-3)] grid gap-[var(--space-4)] sm:grid-cols-2">
			<WorkPanel heading="Detalles">
				<dl class="divide-y divide-[var(--border)]">
					<div class="flex justify-between gap-[var(--space-4)] py-[var(--space-2)] text-sm">
						<dt class="text-[var(--ink-muted)]">Modelo</dt>
						<dd class="text-right text-[var(--ink)]">{longAssetName}</dd>
					</div>
					<div class="flex justify-between gap-[var(--space-4)] py-[var(--space-2)] text-sm">
						<dt class="text-[var(--ink-muted)]">Ubicación</dt>
						<dd class="text-right text-[var(--ink)]">
							Almacén central, planta -1, pasillo de reposición de periféricos
						</dd>
					</div>
				</dl>
			</WorkPanel>
			<WorkPanel heading="Estado">
				<p class="text-sm text-[var(--ink-muted)]">
					Un valor largo no rompe el ancho fijo del panel — se envuelve, nunca desborda.
				</p>
			</WorkPanel>
		</div>
	</section>

	<section>
		<h3 class="text-[15px] leading-[22px] font-semibold text-[var(--ink)]">
			Fila de catálogo — una fila y cincuenta filas
		</h3>
		<div class="mt-[var(--space-3)] grid gap-[var(--space-5)] lg:grid-cols-2">
			{#each [1, 50] as count (count)}
				<div>
					<p class="ut-muted mb-2 text-xs font-semibold tracking-[0.04em] uppercase">
						{count}
						{count === 1 ? 'fila' : 'filas'}
					</p>
					<div
						class="overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface-1)]"
					>
						<ul class="divide-y divide-[var(--border)]">
							{#each catalogueRows(count) as row (row.id)}
								<li
									class="flex items-center justify-between gap-[var(--space-3)] p-[var(--space-3)]"
								>
									<div class="grid min-w-0 flex-1 gap-[var(--space-1)] sm:grid-cols-3">
										<span class="truncate text-sm font-medium text-[var(--ink)]">{row.name}</span>
										<span class="truncate text-sm text-[var(--ink-muted)]"
											>{row.manufacturerName}</span
										>
										<span class="truncate text-sm text-[var(--ink-muted)]">{row.categoryName}</span>
									</div>
								</li>
							{/each}
						</ul>
					</div>
				</div>
			{/each}
		</div>
	</section>
</div>
