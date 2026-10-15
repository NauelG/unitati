<script lang="ts">
	import ComponentDocPage from '../ComponentDocPage.svelte';
	import RelatedRecords from '#lib/components/unitati/RelatedRecords.svelte';
	import type { AssetRelatedGroup, RelatedGroup, ViaTask } from '#lib/server/links/related.js';

	const linkedAt = new Date('2026-01-01T10:00:00Z');

	const single: AssetRelatedGroup[] = [
		{
			relation: 'affects',
			icon: 'asset',
			items: [
				{
					linkedAt,
					ref: { kind: 'asset', id: '1', tag: 'AST-0231', title: 'MacBook Pro 14"', href: '#' },
					status: 'in_use'
				}
			]
		}
	];

	const several: AssetRelatedGroup[] = [
		{
			relation: 'affects',
			icon: 'asset',
			items: [
				{
					linkedAt,
					ref: { kind: 'asset', id: '1', tag: 'AST-0231', title: 'MacBook Pro 14"', href: '#' },
					status: 'in_use'
				},
				{
					linkedAt,
					ref: { kind: 'asset', id: '2', tag: 'AST-0232', title: 'Monitor Dell 27"', href: '#' },
					status: 'in_repair'
				}
			]
		},
		{
			relation: 'affected_by',
			icon: 'ticket',
			items: [
				{
					linkedAt,
					ref: {
						kind: 'ticket',
						id: '3',
						tag: 'TCK-0042',
						title: 'No enciende el portátil',
						href: '#'
					},
					status: 'in_progress'
				}
			]
		}
	];

	const ticket = (
		n: number,
		fields: {
			status: 'new' | 'in_progress' | 'waiting_on_user' | 'resolved';
			priority: 'low' | 'normal' | 'high' | 'urgent';
			assignee: string | null;
			via?: ViaTask;
		}
	) => ({
		linkedAt,
		ref: {
			kind: 'ticket' as const,
			id: `t${n}`,
			tag: `TCK-${String(n).padStart(4, '0')}`,
			title: ['No arranca el VPN', 'Alta de usuario nuevo', 'Impresora sin tóner'][n % 3],
			href: '#'
		},
		...fields
	});

	const viaTask = (n: number): ViaTask => ({
		kind: 'task',
		id: `task${n}`,
		tag: `TSK-${String(n).padStart(4, '0')}`,
		title: 'Preparar el puesto',
		href: '#',
		status: { group: 'started', name: 'En revisión' }
	});

	/** The task record: three tickets behind it. */
	const taskSide: RelatedGroup[] = [
		{
			relation: 'resolves',
			icon: 'ticket',
			items: [
				ticket(1, { status: 'in_progress', priority: 'urgent', assignee: 'Marta Soler' }),
				ticket(2, { status: 'new', priority: 'normal', assignee: null }),
				ticket(3, { status: 'resolved', priority: 'high', assignee: 'Jordi Vila' })
			]
		}
	];

	/** The project record: direct tickets, and tickets through two tasks (one ticket reaches it twice). */
	const projectSide: RelatedGroup[] = [
		{
			relation: 'handles',
			icon: 'ticket',
			items: [ticket(4, { status: 'waiting_on_user', priority: 'normal', assignee: 'Marta Soler' })]
		},
		{
			relation: 'resolves_via_tasks',
			icon: 'ticket',
			items: [
				ticket(1, {
					status: 'in_progress',
					priority: 'urgent',
					assignee: 'Marta Soler',
					via: viaTask(1)
				}),
				ticket(1, {
					status: 'in_progress',
					priority: 'urgent',
					assignee: 'Marta Soler',
					via: viaTask(2)
				}),
				ticket(2, { status: 'new', priority: 'normal', assignee: null, via: viaTask(1) })
			]
		}
	];

	/** What an employee holding only their own tickets is given: the same shape, fewer rows. */
	const employeeSide: RelatedGroup[] = [
		{
			relation: 'handles',
			icon: 'ticket',
			items: []
		},
		{
			relation: 'resolves_via_tasks',
			icon: 'ticket',
			items: [ticket(2, { status: 'new', priority: 'normal', assignee: null, via: viaTask(1) })]
		}
	].filter((group) => group.items.length > 0) as RelatedGroup[];
</script>

<ComponentDocPage
	name="RelatedRecords"
	summary="Panel lateral de registros vinculados, agrupados por relación."
	role="Renderiza lo que relatedTo devuelve y no sabe qué tabla respondió. Los grupos llegan ya ordenados y sin los vacíos, así que un panel vacío lo dice en vez de dibujar títulos sobre nada. unlinkAction ausente oculta el botón: el dominio rechaza igual a quien no puede desvincular, pero un botón que solo puede fallar es ruido."
	whenToUse={[
		'La columna lateral de una ficha de registro (PageLayout variant="record"), para ver con qué está conectado.',
		'Cuando el viewer puede desvincular: pasa unlinkAction.'
	]}
	whenNotToUse={[
		'Para mostrar una sola referencia en línea, dentro de una frase o celda: usa RecordRef.',
		'Para un carril cronológico de eventos: usa AssetTimeline o TicketThread.'
	]}
	propsDoc={[
		{
			name: 'groups',
			type: 'RelatedGroup[]',
			description:
				'Agrupados por relación, en el orden del design system. Un ticket que llega a un proyecto por dos tareas sale una vez, con las dos.'
		},
		{
			name: 'unlinkable',
			type: 'RelationName[]',
			description:
				'Las relaciones que se desvinculan desde aquí; todas si falta. El proyecto solo desvincula "handles".'
		},
		{
			name: 'unlinkAction',
			type: 'string',
			description: 'Form action que desvincula; ausente oculta el control.'
		},
		{
			name: 'error',
			type: 'string',
			description: 'Mostrado bajo el panel cuando la última desvinculación fue rechazada.'
		},
		{
			name: 'confirming',
			type: 'string | null',
			description: 'Bindable: el id del registro preguntando "¿seguro?", uno a la vez.'
		}
	]}
	usage={`<RelatedRecords
  groups={await relatedTo(viewer, { kind: 'ticket', id: ticket.id })}
  unlinkAction={canUnlink ? '?/unlink' : undefined}
/>`}
	referenceHref="https://github.com/NauelG/unitati/blob/main/docs/design/design-system.html"
	referenceLabel="Design system — panel de relaciones"
>
	{#snippet demo()}
		<div class="grid gap-[var(--space-5)] sm:grid-cols-2">
			<div>
				<p class="ut-muted mb-2 text-xs font-semibold tracking-[0.04em] uppercase">Un elemento</p>
				<RelatedRecords groups={single} />
			</div>
			<div>
				<p class="ut-muted mb-2 text-xs font-semibold tracking-[0.04em] uppercase">
					Varios, con desvincular
				</p>
				<RelatedRecords groups={several} unlinkAction="#" />
			</div>
			<div>
				<p class="ut-muted mb-2 text-xs font-semibold tracking-[0.04em] uppercase">
					Confirmando desvincular
				</p>
				<RelatedRecords groups={single} unlinkAction="#" confirming="1" />
			</div>
			<div>
				<p class="ut-muted mb-2 text-xs font-semibold tracking-[0.04em] uppercase">
					Error tras desvincular rechazado
				</p>
				<RelatedRecords
					groups={single}
					unlinkAction="#"
					error="No se pudo desvincular: el ticket sigue abierto."
				/>
			</div>
			<div>
				<p class="ut-muted mb-2 text-xs font-semibold tracking-[0.04em] uppercase">
					Tarea: Resuelve, con desvincular
				</p>
				<RelatedRecords groups={taskSide} unlinkAction="#" />
			</div>
			<div>
				<p class="ut-muted mb-2 text-xs font-semibold tracking-[0.04em] uppercase">
					Proyecto: Gestiona y Resuelve, vía tareas (solo desvincula lo directo)
				</p>
				<RelatedRecords groups={projectSide} unlinkAction="#" unlinkable={['handles']} />
			</div>
			<div>
				<p class="ut-muted mb-2 text-xs font-semibold tracking-[0.04em] uppercase">
					Empleado: solo sus solicitudes
				</p>
				<RelatedRecords groups={employeeSide} />
			</div>
			<div>
				<p class="ut-muted mb-2 text-xs font-semibold tracking-[0.04em] uppercase">Vacío</p>
				<RelatedRecords groups={[]} />
			</div>
		</div>
	{/snippet}
</ComponentDocPage>
