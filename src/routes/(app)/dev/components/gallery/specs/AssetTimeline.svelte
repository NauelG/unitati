<script lang="ts">
	import ComponentDocPage from '../ComponentDocPage.svelte';
	import AssetTimeline from '#lib/components/unitati/AssetTimeline.svelte';
	import type { AssetTimelineItem } from '#lib/server/links/timeline.js';

	const full: AssetTimelineItem[] = [
		{
			kind: 'ticket',
			id: 't1',
			at: new Date('2026-03-02T09:00:00Z'),
			record: { kind: 'ticket', id: 't1', tag: 'TCK-0042', title: 'No enciende', href: '#' },
			status: 'in_progress'
		},
		{
			kind: 'activity',
			id: 'a1',
			at: new Date('2026-03-01T12:00:00Z'),
			entry: {
				id: 'a1',
				verb: 'state.changed',
				occurredAt: new Date('2026-03-01T12:00:00Z'),
				actorPersonId: 'p1',
				actorName: 'Ada Lovelace',
				payload: { from: 'in_stock', to: 'in_use' }
			}
		},
		{
			kind: 'activity',
			id: 'a2',
			at: new Date('2026-02-20T08:30:00Z'),
			entry: {
				id: 'a2',
				verb: 'note.added',
				occurredAt: new Date('2026-02-20T08:30:00Z'),
				actorPersonId: null,
				actorName: null,
				payload: { text: 'Entregado con cargador original y funda.' }
			}
		},
		{
			kind: 'activity',
			id: 'a3',
			at: new Date('2026-02-15T10:00:00Z'),
			entry: {
				id: 'a3',
				verb: 'asset.created',
				occurredAt: new Date('2026-02-15T10:00:00Z'),
				actorPersonId: 'p1',
				actorName: 'Ada Lovelace',
				payload: { assetTag: 'AST-0231', name: 'MacBook Pro 14"' }
			}
		}
	];

	const single: AssetTimelineItem[] = [full[3]];
</script>

<ComponentDocPage
	name="AssetTimeline"
	summary="Un único carril de actividad de un activo, con sus relaciones de ticket en vivo."
	role="Toma la lista ya fusionada que mergeAssetTimeline (en links) devuelve: eventos pasados de activity y tickets de la relación en vivo, en un solo carril. El punto de ticket existe porque los tickets ya aparecen; el punto de proyecto llega con la primera entrada de proyecto — no antes, porque una variante que nada puede renderizar es una variante que nadie prueba."
	whenToUse={[
		'La pestaña de historial de un activo, mezclando su propia actividad con los tickets abiertos sobre él.'
	]}
	whenNotToUse={[
		'Para una conversación con comentarios de personas: usa TicketThread.',
		'Para una sola mención a un registro: usa RecordRef.'
	]}
	propsDoc={[
		{
			name: 'items',
			type: 'AssetTimelineItem[]',
			description: 'Más reciente primero, como mergeAssetTimeline las devuelve. Nunca se reordenan.'
		}
	]}
	usage={`<AssetTimeline items={mergeAssetTimeline(activityEntries, relatedGroups)} />`}
	referenceHref="https://github.com/NauelG/unitati/blob/main/docs/design/design-system.html"
	referenceLabel="Design system — familia .ut-timeline"
>
	{#snippet demo()}
		<div>
			<p class="ut-muted mb-2 text-xs font-semibold tracking-[0.04em] uppercase">
				Carril completo (alta, nota, cambio de estado, ticket)
			</p>
			<AssetTimeline items={full} />
		</div>
		<div>
			<p class="ut-muted mb-2 text-xs font-semibold tracking-[0.04em] uppercase">Un solo evento</p>
			<AssetTimeline items={single} />
		</div>
		<div>
			<p class="ut-muted mb-2 text-xs font-semibold tracking-[0.04em] uppercase">Vacío</p>
			<AssetTimeline items={[]} />
		</div>
	{/snippet}
</ComponentDocPage>
