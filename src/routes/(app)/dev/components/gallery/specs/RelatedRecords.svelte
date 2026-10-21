<script lang="ts">
	import ComponentDocPage from '../ComponentDocPage.svelte';
	import Button from '#lib/components/unitati/Button.svelte';
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

	const progress = {
		counts: { backlog: 1, unstarted: 1, started: 2, completed: 4, cancelled: 0 },
		total: 8,
		ratio: 0.5
	};
	const taskRef = (id: string, tag: string, title: string, href: string) => ({
		kind: 'task' as const,
		id,
		tag,
		title,
		href
	});
	const projectRef = (id: string, tag: string, title: string, href: string) => ({
		kind: 'project' as const,
		id,
		tag,
		title,
		href
	});

	/** The ticket record, as staff read it: the work it was escalated to (#150). */
	const ticketWork: RelatedGroup[] = [
		{
			relation: 'resolved_in',
			icon: 'task',
			items: [
				{
					linkedAt,
					projectTag: 'PRJ-007',
					ref: taskRef('10', 'TSK-0042', 'Cambiar tóner', '#'),
					status: { group: 'started', name: 'En revisión' }
				}
			]
		},
		{
			relation: 'handled_in',
			icon: 'project',
			items: [
				{
					linkedAt,
					ref: projectRef('11', 'PRJ-007', 'Renovar impresoras', '#'),
					status: { archived: false, progress }
				},
				{
					linkedAt,
					ref: projectRef('12', 'PRJ-003', 'Migración antigua', '#'),
					status: { archived: true, progress: null }
				}
			]
		}
	];

	/** What the requesting employee gets: an out-of-scope target comes back as a count, nothing else. */
	const forRequester: RelatedGroup[] = [
		{
			relation: 'resolved_in',
			icon: 'task',
			items: [
				{
					linkedAt,
					ref: taskRef('10', 'TSK-0042', 'Cambiar tóner', '#'),
					status: { group: 'completed', name: 'Hecho' }
				}
			],
			restricted: 1
		},
		{
			relation: 'handled_in',
			icon: 'project',
			items: [],
			restricted: 2
		}
	];
	/** The asset record (#168): the tickets raised on this machine, closed ones included, each with its status. */
	const assetTickets: AssetRelatedGroup[] = [
		{
			relation: 'affected_by',
			icon: 'ticket',
			items: [
				{
					linkedAt,
					ref: { kind: 'ticket', id: 't1', tag: 'TCK-0093', title: 'Pantalla parpadea', href: '#' },
					status: 'in_progress'
				},
				{
					linkedAt,
					ref: { kind: 'ticket', id: 't2', tag: 'TCK-0071', title: 'Batería hinchada', href: '#' },
					status: 'closed'
				}
			]
		}
	];

	const ticketLinkProps = {
		linkAction: '#',
		linkLabel: 'Vincular ticket',
		linkDescription: 'Elige los tickets que han afectado a este activo.',
		linkFieldLabel: 'Tickets',
		linkPlaceholder: 'Busca por código o asunto',
		linkSearchUrl: '/dev/components/assets',
		linkSubmitLabel: (count: number) =>
			count === 0 ? 'Vincular' : count === 1 ? 'Vincular 1 ticket' : `Vincular ${count} tickets`
	};

	// "Vincular" (#79): one panel whose dialog the buttons below drive, since two
	// modals cannot be open at once.
	let linkOpen = $state(false);
	let linkFailure = $state<string>();
	let linkPending = $state(false);

	const linkProps = {
		linkAction: '#',
		linkLabel: 'Vincular activo',
		linkDescription: 'Elige los activos a los que afecta esta solicitud.',
		linkFieldLabel: 'Activos',
		linkPlaceholder: 'Busca por código o nombre',
		linkSearchUrl: '/service-desk/new/assets',
		linkSubmitLabel: (count: number) =>
			count === 0 ? 'Vincular' : count === 1 ? 'Vincular 1 activo' : `Vincular ${count} activos`
	};

	function openDialog(state: 'results' | 'refusal' | 'pending') {
		linkFailure = state === 'refusal' ? 'El activo no está disponible.' : undefined;
		linkPending = state === 'pending';
		linkOpen = true;
	}
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
			name: 'unlinkActions',
			type: 'Partial<Record<RecordKind, string>>',
			description:
				'Form action por tipo de registro (asset, task, project), para un panel que los mezcla. Gana sobre unlinkAction; un tipo sin entrada no dibuja control.'
		},
		{
			name: 'requester',
			type: 'boolean',
			default: 'false',
			description:
				'La lectura del solicitante: Resuelto en y Gestionado en se funden en «En seguimiento en», sin desvincular. Un item sin href se dibuja como texto.'
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
		},
		{
			name: 'linkAction',
			type: 'string',
			description:
				'Form action que vincula, con los ids repetidos en "ids". Ausente no dibuja nada de vincular (empleado, portal, quien no tiene permiso).'
		},
		{
			name: 'linkLabel / linkFieldLabel / linkSearchUrl / linkSubmitLabel',
			type: 'string | (count) => string',
			description:
				'Las palabras y el buscador los pone la ruta: el componente no sabe si vincula activos u otra cosa. El botón primario nombra el acto y el recuento ("Vincular 3 activos").'
		},
		{
			name: 'linkedIds',
			type: 'string[]',
			description: 'Ya vinculados: aparecen en la búsqueda, pero no se pueden elegir.'
		},
		{
			name: 'linkOpen',
			type: 'boolean',
			description: 'Bindable: la paleta de comandos abre el mismo diálogo.'
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
					Ticket: trabajo escalado, con desvincular por tipo
				</p>
				<RelatedRecords
					groups={ticketWork}
					unlinkActions={{ asset: '#', task: '#', project: '#' }}
				/>
			</div>
			<div>
				<p class="ut-muted mb-2 text-xs font-semibold tracking-[0.04em] uppercase">
					Solicitante: En seguimiento en, sin enlace fuera de su alcance
				</p>
				<RelatedRecords groups={forRequester} requester />
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
			<div>
				<p class="ut-muted mb-2 text-xs font-semibold tracking-[0.04em] uppercase">
					Vacío, con Vincular en lugar de la frase
				</p>
				<RelatedRecords groups={[]} {...linkProps} />
			</div>
			<div>
				<p class="ut-muted mb-2 text-xs font-semibold tracking-[0.04em] uppercase">
					Con elementos y Vincular en la cabecera
				</p>
				<RelatedRecords
					groups={single}
					unlinkAction="#"
					{...linkProps}
					bind:linkOpen
					bind:linkFailure
					bind:linkPending
				/>
				<div class="mt-2 flex flex-wrap gap-2">
					<Button type="button" size="sm" variant="secondary" onclick={() => openDialog('results')}>
						Diálogo con resultados
					</Button>
					<Button type="button" size="sm" variant="secondary" onclick={() => openDialog('refusal')}>
						Diálogo con rechazo
					</Button>
					<Button type="button" size="sm" variant="secondary" onclick={() => openDialog('pending')}>
						Diálogo pendiente
					</Button>
				</div>
			</div>
			<div>
				<p class="ut-muted mb-2 text-xs font-semibold tracking-[0.04em] uppercase">
					Ficha de activo: tickets con su estado, vincular y desvincular (#168)
				</p>
				<RelatedRecords groups={assetTickets} unlinkAction="#" {...ticketLinkProps} />
			</div>
			<div>
				<p class="ut-muted mb-2 text-xs font-semibold tracking-[0.04em] uppercase">
					Ficha de activo sin tickets: ofrece Vincular ticket
				</p>
				<RelatedRecords groups={[]} {...ticketLinkProps} />
			</div>
			<div>
				<p class="ut-muted mb-2 text-xs font-semibold tracking-[0.04em] uppercase">
					Sin linkAction: no se dibuja nada de vincular
				</p>
				<RelatedRecords groups={single} />
			</div>
		</div>
	{/snippet}
</ComponentDocPage>
