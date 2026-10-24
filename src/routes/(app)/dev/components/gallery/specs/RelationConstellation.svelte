<script lang="ts">
	import ComponentDocPage from '../ComponentDocPage.svelte';
	import RelationConstellation from '#lib/components/unitati/RelationConstellation.svelte';
	import type { AssetRelatedGroup, RelatedGroup } from '#lib/server/links/index.js';

	const linkedAt = new Date('2026-01-01T10:00:00Z');

	function tickets(count: number): AssetRelatedGroup[] {
		return [
			{
				relation: 'affected_by',
				icon: 'ticket',
				items: Array.from({ length: count }, (_, i) => {
					const tag = `TCK-${String(i + 12).padStart(4, '0')}`;
					return {
						linkedAt,
						ref: {
							kind: 'ticket' as const,
							id: String(i),
							tag,
							title: `Solicitud ${i}`,
							href: '#'
						},
						status: (['new', 'in_progress', 'resolved'] as const)[i % 3]
					};
				})
			}
		];
	}

	const centre = { kind: 'asset' as const, tag: 'AST-0231' };

	/** A ticket with an asset, a task and a project around it. */
	const ticketCentre = { kind: 'ticket' as const, tag: 'TCK-0042' };
	const ticketSide: RelatedGroup[] = [
		{
			relation: 'affects',
			icon: 'asset',
			items: [
				{
					linkedAt,
					ref: { kind: 'asset', id: 'a', tag: 'AST-0231', title: 'MacBook Pro 14"', href: '#' },
					status: 'in_repair'
				}
			]
		},
		{
			relation: 'resolved_in',
			icon: 'task',
			items: [
				{
					linkedAt,
					ref: { kind: 'task', id: 't', tag: 'TSK-0007', title: 'Cambiar disco', href: '#' },
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
					ref: {
						kind: 'project',
						id: 'p',
						tag: 'PRJ-0003',
						title: 'Renovación de equipos',
						href: '#'
					},
					status: { archived: true, progress: null }
				}
			]
		}
	];

	/** A project: a direct ticket, and the tasks that carry tickets. */
	const projectCentre = { kind: 'project' as const, tag: 'PRJ-0003' };
	const via = (n: number) => ({
		kind: 'task' as const,
		id: `task${n}`,
		tag: `TSK-000${n}`,
		title: 'Cambiar disco',
		href: '#',
		status: { group: n === 1 ? ('started' as const) : ('completed' as const), name: 'Nombre' }
	});
	const projectSide: RelatedGroup[] = [
		{
			relation: 'handles',
			icon: 'ticket',
			items: [
				{
					linkedAt,
					ref: { kind: 'ticket', id: 'x', tag: 'TCK-0050', title: 'Alta', href: '#' },
					status: 'new'
				}
			]
		},
		{
			relation: 'resolves_via_tasks',
			icon: 'ticket',
			items: [1, 2].map((n) => ({
				linkedAt,
				ref: { kind: 'ticket' as const, id: `y${n}`, tag: `TCK-006${n}`, title: 'VPN', href: '#' },
				status: 'in_progress' as const,
				via: via(n)
			}))
		}
	];
</script>

<ComponentDocPage
	name="RelationConstellation"
	summary="El vecindario de un registro: él al centro, sus vínculos alrededor (S3)."
	role="Una segunda proyección del mismo array que ya pinta RelatedRecords — sin consultas nuevas. Nodos radiales con punto de color de dominio y etiqueta mono, aristas hairline. Dibujo de entrada de ≤240ms; estático con reduced-motion. Cada nodo es un enlace (teclado: Tab/Enter) y entrega su view-transition-name al hacer clic, para que la etiqueta viaje a la cabecera de destino. Con más de 8 vínculos se agrupa por tipo en un nodo con recuento."
	whenToUse={[
		'En el detalle de un activo o de una solicitud, encima de RelatedRecords.',
		'Cuando el registro tiene vínculos: sin ellos, no se pinta.'
	]}
	whenNotToUse={[
		'Como grafo explorable (zoom, mapa de toda la organización): es solo el vecindario inmediato.',
		'En el portal: el empleado ve su solicitud sencilla; es una superficie de técnico.'
	]}
	propsDoc={[
		{
			name: 'centre',
			type: `{ kind: 'asset' | 'ticket' | 'task' | 'project'; tag: string }`,
			description: 'El registro cuya página es.'
		},
		{
			name: 'groups',
			type: 'RelatedGroup[]',
			description:
				'El mismo array que recibe RelatedRecords. En un proyecto, las tareas con solicitudes sustituyen a esas solicitudes. Con cuatro nodos o menos las aristas de solicitud↔tarea/proyecto llevan su relación escrita.'
		}
	]}
	usage={`<RelationConstellation centre={{ kind: 'asset', tag: asset.assetTag }} groups={related} />`}
	referenceHref="https://github.com/NauelG/unitati/blob/main/docs/vision.md"
	referenceLabel="Visión — las relaciones son el producto"
>
	{#snippet demo()}
		<div class="grid gap-[var(--space-5)] md:grid-cols-3">
			<div>
				<p class="mb-[var(--space-2)] text-xs text-[var(--ink-muted)]">3 vínculos</p>
				<RelationConstellation {centre} groups={tickets(3)} />
			</div>
			<div>
				<p class="mb-[var(--space-2)] text-xs text-[var(--ink-muted)]">8 vínculos (el máximo)</p>
				<RelationConstellation {centre} groups={tickets(8)} />
			</div>
			<div>
				<p class="mb-[var(--space-2)] text-xs text-[var(--ink-muted)]">11 vínculos (agrupado)</p>
				<RelationConstellation {centre} groups={tickets(11)} />
			</div>
		</div>
		<div class="mt-[var(--space-5)] grid gap-[var(--space-5)] md:grid-cols-3">
			<div>
				<p class="mb-[var(--space-2)] text-xs text-[var(--ink-muted)]">
					Solicitud: activo, tarea y proyecto
				</p>
				<RelationConstellation centre={ticketCentre} groups={ticketSide} />
			</div>
			<div>
				<p class="mb-[var(--space-2)] text-xs text-[var(--ink-muted)]">
					Proyecto: solicitud directa y tareas con solicitudes
				</p>
				<RelationConstellation centre={projectCentre} groups={projectSide} />
			</div>
		</div>
		<p class="mt-[var(--space-3)] text-xs text-[var(--ink-muted)]">
			Sin vínculos no se pinta nada.
		</p>
	{/snippet}
</ComponentDocPage>
