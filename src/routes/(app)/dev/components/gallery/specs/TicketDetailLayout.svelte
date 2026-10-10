<script lang="ts">
	import ComponentDocPage from '../ComponentDocPage.svelte';
	import TicketDetailLayout from '#lib/components/unitati/TicketDetailLayout.svelte';
	import Button from '#lib/components/unitati/Button.svelte';
</script>

<ComponentDocPage
	name="TicketDetailLayout"
	summary="Cabecera de ficha de ticket: chips de código/estado/prioridad, asunto y procedencia."
	role="Compone dentro de la variante record de PageLayout, que es dueña de la rejilla y el techo de ancho (ADR 0018) — este componente solo renderiza la cabecera, nunca su propio contenedor. Deja la columna lateral al caller, que normalmente pone ahí un RelatedRecords."
	whenToUse={['La cabecera de la ficha de un ticket, dentro de PageLayout variant="record".']}
	whenNotToUse={[
		'Para la cabecera de cualquier otra página: usa PageHeader directamente.',
		'Para la ficha de un activo: ese layout no reutiliza este componente, construye su propia cabecera con PageHeader.'
	]}
	propsDoc={[
		{ name: 'ticketTag', type: 'string', description: 'Código del ticket, en mono.' },
		{
			name: 'subject',
			type: 'string',
			description: 'Asunto, en Unbounded (título propio de la página).'
		},
		{ name: 'status', type: 'TicketStatus', description: 'Insignia de estado.' },
		{
			name: 'priority',
			type: 'Priority',
			description: 'Insignia de prioridad (nada si es "normal").'
		},
		{
			name: 'provenance',
			type: 'string',
			description: '"Abierto por X · hace 2h · vía portal" — una línea ya formateada.'
		},
		{
			name: 'actions',
			type: 'Snippet',
			description: 'Acciones secundarias primero, la primaria al final.'
		}
	]}
	usage={`<TicketDetailLayout
  ticketTag={ticket.tag}
  subject={ticket.subject}
  status={ticket.status}
  priority={ticket.priority}
  provenance={provenanceLine}
/>`}
	referenceHref="https://github.com/NauelG/unitati/blob/main/docs/adr/0018-page-layout-vocabulary.md"
	referenceLabel="ADR 0018 — vocabulario de layout de página"
>
	{#snippet demo()}
		<div>
			<p class="ut-muted mb-2 text-xs font-semibold tracking-[0.04em] uppercase">Con acciones</p>
			<TicketDetailLayout
				ticketTag="TCK-0042"
				subject="No enciende el portátil"
				status="in_progress"
				priority="urgent"
				provenance="Abierto por Ada Lovelace · hace 2h · vía portal"
			>
				{#snippet actions()}
					<Button variant="secondary" size="sm">Asignar</Button>
					<Button size="sm">Resolver</Button>
				{/snippet}
			</TicketDetailLayout>
		</div>
		<div>
			<p class="ut-muted mb-2 text-xs font-semibold tracking-[0.04em] uppercase">
				Prioridad normal (sin insignia) y asunto largo
			</p>
			<TicketDetailLayout
				ticketTag="TCK-0099"
				subject="Un asunto de ticket deliberadamente largo para comprobar cómo se comporta el título a este ancho"
				status="new"
				priority="normal"
				provenance="Abierto por Ada Lovelace · hace 5 minutos · vía portal"
			/>
		</div>
	{/snippet}
</ComponentDocPage>
